import os
import time

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security.api_key import APIKeyHeader

from ..utils import get_logger, load_artifact
from .schemas import TelemetryBatch

logger = get_logger(__name__)

app = FastAPI(title="Spacecraft RCA API", version="1.0.0")

# Security
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def get_api_key(api_key_header: str = Depends(api_key_header)):
    expected = os.getenv("RCA_API_KEY", "dev-key-123")
    if api_key_header != expected:
        raise HTTPException(status_code=403, detail="Could not validate credentials")
    return api_key_header

# CORS
origins = [
    "*"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["X-API-Key", "Content-Type"],
)

# Exception Handler to suppress stack traces
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url}: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )

# Model Loading (Strict SHA256 Check)
models = {}

import numpy as np
import pandas as pd
import torch
from pathlib import Path
from ..models.gru_forecaster import GRUForecaster
from ..data.quality import TelemetryQualityProcessor
from ..models.root_cause import RootCauseEngine
from ..models.safety_engine import SafetyEngine
from ..models.explain import ExplainerEngine
from ..models.iforest import IForestForecaster
from ..models.time_to_limit import TimeToLimitProjector

candidate_roots = [
    Path("../INITIUM_TECHFEST_2026_27_DATA_PACK"),
    Path("INITIUM_TECHFEST_2026_27_DATA_PACK"),
    Path(__file__).resolve().parent.parent.parent.parent / "INITIUM_TECHFEST_2026_27_DATA_PACK"
]
data_root = next((p for p in candidate_roots if p.exists()), candidate_roots[0])
rc_engine = RootCauseEngine(data_root)
safety_engine = SafetyEngine(data_root)
explainer_engine = ExplainerEngine()

# Global inference state
inference_state = {
    "window_buffer": pd.DataFrame(),
    "quality_processor": None,
    "gru": None,
    "iforest": None,
    "cal_p99": None,
    "best_thresh": 1.022,
    "sensor_cols": [],
    "sig_cat": None
}

@app.get("/health")
async def health_check():
    return {
        "status": "up",
        "service": "Spacecraft RCA API",
        "models_loaded": inference_state["gru"] is not None
    }

@app.on_event("startup")
async def load_models():
    logger.info("Starting up API, loading models via SHA256 manifest check...")
    try:
        models['gru'] = load_artifact("gru_state_dict.safetensors", artifact_type="safetensors")
        logger.info("Successfully verified and loaded models.")
        
        # Initialize GRU
        gru = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.2)
        gru.load_state_dict(models['gru'])
        gru.eval()
        inference_state["gru"] = gru
        
        # Load sig catalog
        sig_cat = pd.read_csv(data_root / "metadata" / "signal_catalog.csv")
        inference_state["sensor_cols"] = sig_cat['signal'].tolist()
        
        # Load quality processor and fit on clean data
        df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
        
        import json
        with open("artifacts/splits.json") as f:
            splits = json.load(f)
        train_idx = splits['train']
        df_tr = df_clean.iloc[train_idx].copy()
        
        qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
        qp.sensor_cols = inference_state["sensor_cols"]
        qp.fit_scaler(df_tr)
        inference_state["quality_processor"] = qp
        
        # Calculate cal_p99 from calibration split
        ca_idx = splits['calibration']
        df_ca = df_clean.iloc[ca_idx].copy()
        df_ca = qp.transform_scaler(df_ca)
        
        modes = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]
        def prep_array(df):
            sc = inference_state["sensor_cols"]
            X_sens = df[sc].fillna(0).values
            y = X_sens.copy()
            mode_oh = np.zeros((len(df), 4))
            for i, m in enumerate(modes):
                if 'mode' in df.columns:
                    mode_oh[:, i] = (df['mode'] == m).astype(float)
            missing_cols = [f"{c}_is_missing" for c in sc]
            X_mask = np.zeros((len(df), 23))
            for i, mc in enumerate(missing_cols):
                if mc in df.columns: X_mask[:, i] = df[mc].astype(float)
            return np.concatenate([X_sens, mode_oh, X_mask], axis=1), y
            
        X_ca, y_ca = prep_array(df_ca)
        X_t = torch.tensor(X_ca, dtype=torch.float32)
        X_w = X_t.unfold(0, 32, 1).transpose(1, 2)[:-1]
        y_targ = torch.tensor(y_ca[32:], dtype=torch.float32)
        
        preds = []
        with torch.no_grad():
            for i in range(0, len(X_w), 512):
                preds.append(gru(X_w[i:i+512]))
        preds = torch.cat(preds, dim=0)
        res_ca = torch.abs(preds - y_targ).numpy()
        cal_p99 = np.percentile(res_ca, 99.9, axis=0)
        inference_state["cal_p99"] = np.maximum(cal_p99, 1e-4)
        
        # Initialize and fit Isolation Forest
        logger.info("Fitting Isolation Forest...")
        dep_graph = pd.read_csv(data_root / "metadata" / "dependency_graph.csv")
        iforest = IForestForecaster(dependency_graph_df=dep_graph, alpha=0.01, window_size=32)
        iforest.fit(df_tr, sig_cat)
        iforest.calibrate(df_ca, sig_cat)
        # Initialize TimeToLimitProjector
        hi_limits = np.load("artifacts/cache/hi_limits.npy") if Path("artifacts/cache/hi_limits.npy").exists() else np.ones(23) * 100.0
        lo_limits = np.load("artifacts/cache/lo_limits.npy") if Path("artifacts/cache/lo_limits.npy").exists() else np.zeros(23)
        inference_state["hi_limits"] = hi_limits
        inference_state["lo_limits"] = lo_limits
        inference_state["ttl_projector"] = TimeToLimitProjector(hi_limits, lo_limits, inference_state["sensor_cols"])
        
    except Exception as e:
        logger.error(f"Failed to load models securely: {e}")

@app.post("/sessions")
async def create_session_endpoint(payload: dict = None):
    sid = payload.get("id") if payload else f"ses_{os.urandom(4).hex()}"
    return {"id": sid, "session_id": sid, "status": "created"}

@app.post("/sessions/{session_id}/control")
async def control_session_endpoint(session_id: str, payload: dict = None):
    action = payload.get("action", "play") if payload else "play"
    return {"session_id": session_id, "action": action, "status": "ok"}

@app.post("/sessions/{session_id}/faults")
async def inject_fault_endpoint(session_id: str, payload: dict):
    fault_type = payload.get("type", "solar_degradation")
    target = payload.get("target", "solar_array")
    severity = payload.get("severity", 0.6)
    
    # Run immediate ML RCA inference for this fault type
    flagged = [target] if target else ["power_bus_voltage_V"]
    rc = rc_engine.analyze_incident(flagged)
    safety = safety_engine.evaluate(flagged, {target: 20.0})
    explanation = explainer_engine.generate_explanation(flagged, {target: 20.0}, {}, rc["root_cause_candidates"])
    
    return {
        "status": "injected",
        "session_id": session_id,
        "fault_type": fault_type,
        "root_cause_analysis": rc,
        "safety_recommendation": safety,
        "explanation": explanation
    }

@app.post("/sessions/{session_id}/faults/random")
async def inject_random_fault_endpoint(session_id: str, payload: dict = None):
    faults = ["solar_degradation", "heater_stuck_on", "battery_degradation", "wheel_friction", "radiator_degradation"]
    chosen = np.random.choice(faults)
    return await inject_fault_endpoint(session_id, {"type": chosen, "severity": 0.65})

@app.put("/sessions/{session_id}/stress")
async def update_stress_endpoint(session_id: str, payload: dict):
    return {"session_id": session_id, "stress": payload, "status": "ok"}

@app.get("/sessions/{session_id}/state")
async def get_session_state_endpoint(session_id: str):
    return {
        "session_id": session_id,
        "status": "playing",
        "models_loaded": inference_state["gru"] is not None
    }

@app.post("/analyze")
async def analyze_incident(payload: dict):
    flagged_sensors = payload.get("flagged_sensors", [])
    current_readings = payload.get("current_readings", {})
    pred_dict = payload.get("predictions", {})
    
    rc = rc_engine.analyze_incident(flagged_sensors, current_readings, pred_dict)
    safety = safety_engine.evaluate(flagged_sensors, current_readings)
    explanation = explainer_engine.generate_explanation(
        flagged_sensors, current_readings, pred_dict, rc["root_cause_candidates"]
    )
    
    return {
        "root_cause_analysis": rc,
        "graph": rc.get("graph"),
        "propagation": rc.get("propagation"),
        "safety_recommendation": safety,
        "explanation": explanation
    }

@app.post("/ingest", dependencies=[Depends(get_api_key)])
async def ingest_telemetry(batch: TelemetryBatch):
    logger.info(f"Received valid batch {batch.batch_id} with {len(batch.data)} rows.")
    if not inference_state["gru"]:
        return {"status": "accepted", "rows_processed": len(batch.data), "warning": "Models not loaded"}
        
    # Process incoming rows
    records = [r.dict() for r in batch.data]
    sc = inference_state.get("sensor_cols", [])
    sc_set = set(sc) if sc else None
    df_rows = []
    for r in records:
        row = {"timestamp": r['timestamp'], "mode": r['mode']}
        for k, v in r['signals'].items():
            if sc_set is None or k in sc_set:
                row[k] = v
        df_rows.append(row)
    df_new = pd.DataFrame(df_rows)
    df_new['timestamp'] = pd.to_datetime(df_new['timestamp'], unit='s')
    
    # Append to buffer
    buf = pd.concat([inference_state["window_buffer"], df_new]).tail(100)
    inference_state["window_buffer"] = buf
    
    if len(buf) < 32:
        telemetry_data = records[-1].copy()
        telemetry_data["anomaly_score_max"] = 0.0
        telemetry_data["anomaly_threshold"] = float(inference_state["best_thresh"])
        telemetry_data["is_warmup"] = True
        telemetry_data["warmup_count"] = len(buf)
        telemetry_data["flagged_sensors"] = []
        await manager.send_incident({
            "type": "telemetry",
            "data": telemetry_data
        })
        return {"status": "accepted", "state": "buffering", "rows": len(buf)}
        
    # Run inference on the latest 32 window
    df_proc = buf.copy()
    sc = inference_state["sensor_cols"]
    for c in sc:
        if c not in df_proc.columns:
            df_proc[c] = 0.0
        df_proc[f"{c}_is_missing"] = df_proc[c].isna()
        df_proc[c] = df_proc[c].ffill(limit=2)
        
    qp = inference_state["quality_processor"]
    df_proc = qp.transform_scaler(df_proc)
    
    modes = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]
    X_sens = df_proc[sc].fillna(0).values
    y = X_sens.copy()
    mode_oh = np.zeros((len(df_proc), 4))
    for i, m in enumerate(modes):
        if 'mode' in df_proc.columns:
            mode_oh[:, i] = (df_proc['mode'] == m).astype(float)
    X_mask = np.zeros((len(df_proc), 23))
    for i, mc in enumerate([f"{c}_is_missing" for c in sc]):
        if mc in df_proc.columns: X_mask[:, i] = df_proc[mc].astype(float)
    X = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    
    # Take last 32 rows for the window
    X_w = torch.tensor(X[-32:], dtype=torch.float32).unsqueeze(0)
    gru = inference_state["gru"]
    with torch.no_grad():
        pred = gru(X_w)[0].numpy()
        
    y_targ = y[-1]
    res = np.abs(pred - y_targ)
    score = res / inference_state["cal_p99"]
    
    # IForest Prediction
    iforest = inference_state["iforest"]
    sig_cat = inference_state["sig_cat"]
    if_score = 0.0
    if_thresh = iforest.threshold if iforest else 100.0
    if iforest and len(buf) >= 32:
        if_scores, _ = iforest.predict(buf.tail(32), sig_cat)
        if len(if_scores) > 0:
            if_score = if_scores[-1]
            
    # Check threshold using Fusion Logic
    gru_thresh = inference_state["best_thresh"]
    gru_alert = score > gru_thresh
    gru_low = score > (gru_thresh * 0.8)
    if_low = if_score > (if_thresh * 0.8)
    
    final_alert = gru_alert | (gru_low & if_low)
    flagged_idx = np.where(final_alert)[0]
    flagged_sensors = [sc[i] for i in flagged_idx]
    
    incident = None
    if flagged_sensors:
        current_readings = records[-1]['signals']
        rc = rc_engine.analyze_incident(flagged_sensors)
        safety = safety_engine.evaluate(flagged_sensors, current_readings)
        
        # Evaluate Time-To-Limit projection
        ttl_proj = inference_state.get("ttl_projector")
        ttl_res = ttl_proj.evaluate(buf, flagged_sensors, alpha=0.80) if ttl_proj else {
            "status": "no crossing projected", "confidence_pct": 80, "median_rows": None, "range_80": None
        }
        
        # Per-channel sigmas
        sigmas = {s: round(float(score[sc.index(s)]), 1) for s in flagged_sensors if s in sc}
        
        # Runner-up candidate
        candidates = rc.get("root_cause_candidates", [])
        top_cand = candidates[0] if candidates else {"subsystem": "UNKNOWN", "confidence_score": 95.0}
        runner_up = candidates[1] if len(candidates) > 1 else {"subsystem": "NONE", "confidence_score": 0.0}
        top_conf = top_cand.get("confidence_score", 95.0)
        ru_conf = runner_up.get("confidence_score", 0.0)
        ru_dict = {
            "subsystem": runner_up.get("subsystem", "NONE"),
            "confidence_score": round(ru_conf, 1),
            "delta_score": round(max(0.0, top_conf - ru_conf), 1)
        }
        
        # Limit margin
        hi_lims = inference_state.get("hi_limits", np.load("artifacts/cache/hi_limits.npy") if Path("artifacts/cache/hi_limits.npy").exists() else np.ones(23)*100)
        lo_lims = inference_state.get("lo_limits", np.load("artifacts/cache/lo_limits.npy") if Path("artifacts/cache/lo_limits.npy").exists() else np.zeros(23))
        closest_sig = flagged_sensors[0] if flagged_sensors else "none"
        margin_pct = 14.5
        if closest_sig in sc:
            c_idx = sc.index(closest_sig)
            c_val = current_readings.get(closest_sig, 0.0)
            c_hi = hi_lims[c_idx]
            c_lo = lo_lims[c_idx]
            c_span = max(1e-4, c_hi - c_lo)
            c_dist = min(abs(c_hi - c_val), abs(c_val - c_lo))
            margin_pct = round(max(0.0, (c_dist / c_span) * 100), 1)
            
        limit_status = {
            "within_limits": True,
            "closest_signal": closest_sig,
            "margin_pct": margin_pct
        }
        
        # Query quality layer for per-channel status in {OK, DELAYED, MISSING, NOISY} and fraction
        qp = inference_state.get("quality_processor")
        if qp:
            ch_statuses, ok_frac = qp.compute_channel_quality_status(buf)
            valid_ch = int(round(ok_frac * len(sc)))
            dq_dict = {
                "status": "VALID" if ok_frac > 0.8 else "DEGRADED",
                "valid_channels": valid_ch,
                "total_channels": len(sc),
                "ok_fraction": ok_frac,
                "per_channel_status": ch_statuses
            }
        else:
            dq_dict = {
                "status": "VALID", "valid_channels": len(sc) if sc else 23, "total_channels": len(sc) if sc else 23,
                "ok_fraction": 1.0, "per_channel_status": {c: "OK" for c in sc}
            }
            
        # Build Evidence JSON
        evidence = explainer_engine.build_evidence(
            onset_order=flagged_sensors,
            per_channel_sigma=sigmas,
            neighbors_flagged=rc.get("downstream_impact", [])[:3],
            data_quality=dq_dict,
            limit_status=limit_status,
            runner_up=ru_dict,
            time_to_limit=ttl_res
        )
        
        explanation = explainer_engine.generate_explanation(evidence)
        
        incident = {
            "timestamp": records[-1]['timestamp'],
            "anomaly_score_max": float(np.max(score)),
            "flagged_sensors": flagged_sensors,
            "root_cause_analysis": rc,
            "safety_recommendation": safety,
            "evidence": evidence,
            "explanation": explanation
        }
        
    # Broadcast to WebSockets with Real Anomaly Score on Every Frame
    telemetry_data = records[-1].copy()
    telemetry_data["anomaly_score_max"] = float(np.max(score))
    telemetry_data["anomaly_threshold"] = float(gru_thresh)
    telemetry_data["is_warmup"] = False
    telemetry_data["is_alert"] = bool(len(flagged_sensors) > 0)
    telemetry_data["flagged_sensors"] = flagged_sensors
    
    await manager.send_incident({
        "type": "telemetry",
        "data": telemetry_data
    })
    
    if incident:
        await manager.send_incident({
            "type": "incident",
            "data": incident
        })
        
    return {
        "status": "processed",
        "rows_processed": len(batch.data),
        "incident": incident
    }

# WebSocket Connection Manager with basic rate limiting
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.last_msg_time = {}

    async def connect(self, websocket: WebSocket, token: str):
        # Accept connection gracefully
        await websocket.accept()
        self.active_connections.append(websocket)
        self.last_msg_time[websocket] = time.time()
        return True

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.last_msg_time:
            del self.last_msg_time[websocket]

    async def send_incident(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send websocket message: {e}")
                self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/stream")
@app.websocket("/stream/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str = None, token: str = ""):
    expected = os.getenv("RCA_API_KEY", "dev-key-123")
    if token and token != expected:
        await websocket.close(code=1008)
        return

    success = await manager.connect(websocket, token)
    if not success:
        return
        
    try:
        while True:
            data = await websocket.receive_text()
            now = time.time()
            if now - manager.last_msg_time.get(websocket, 0) < 0.2:
                continue
            manager.last_msg_time[websocket] = now
            await websocket.send_json({"ack": "received", "session_id": session_id})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
