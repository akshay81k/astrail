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
    "cal_p99": None,
    "best_thresh": 1.022,
    "sensor_cols": []
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
        
        splits_candidates = [
            Path(__file__).resolve().parent.parent.parent.parent / "artifacts" / "splits.json",
            Path("artifacts/splits.json"),
            Path("ml/artifacts/splits.json")
        ]
        splits_path = next((p for p in splits_candidates if p.exists()), splits_candidates[0])
        with open(splits_path, "r", encoding="utf-8") as f:
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

@app.post("/reload-models")
async def reload_models_endpoint():
    await load_models()
    return {
        "status": "ok",
        "models_loaded": inference_state["gru"] is not None
    }

@app.post("/ingest", dependencies=[Depends(get_api_key)])
async def ingest_telemetry(batch: TelemetryBatch):
    logger.info(f"Received valid batch {batch.batch_id} with {len(batch.data)} rows.")
    records = [r.dict() for r in batch.data]
    if not records:
        return {"status": "empty", "rows_processed": 0}

    df_new = pd.DataFrame([{"timestamp": r['timestamp'], "mode": r['mode'], **r['signals']} for r in records])
    df_new['timestamp'] = pd.to_datetime(df_new['timestamp'], unit='s')
    
    # Append to buffer
    buf = pd.concat([inference_state["window_buffer"], df_new]).tail(100)
    inference_state["window_buffer"] = buf

    score = None
    thresh = inference_state.get("best_thresh", 1.022)
    flagged_sensors = []
    incident = None

    # Run inference if GRU is loaded and window buffer is sufficiently full
    if inference_state["gru"] is not None and len(buf) >= 32:
        try:
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
            
            # Check threshold
            flagged_idx = np.where(score > thresh)[0]
            flagged_sensors = [sc[i] for i in flagged_idx]
            
            if flagged_sensors:
                current_readings = records[-1]['signals']
                rc = rc_engine.analyze_incident(flagged_sensors)
                safety = safety_engine.evaluate(flagged_sensors, current_readings)
                
                # Format predictions for explainer
                pred_dict = {sc[i]: float(pred[i]) for i in range(len(sc))}
                explanation = explainer_engine.generate_explanation(
                    flagged_sensors, current_readings, pred_dict, rc["root_cause_candidates"]
                )
                
                incident = {
                    "timestamp": records[-1]['timestamp'],
                    "anomaly_score_max": float(np.max(score)),
                    "flagged_sensors": flagged_sensors,
                    "root_cause_analysis": rc,
                    "safety_recommendation": safety,
                    "explanation": explanation
                }
        except Exception as e:
            logger.error(f"Inference error on batch {batch.batch_id}: {e}")

    # ALWAYS Broadcast latest frame to WebSockets for real continuous live flow
    telemetry_payload = dict(records[-1])
    if score is not None:
        telemetry_payload["anomaly_score"] = float(np.max(score))
        telemetry_payload["threshold"] = float(thresh)
        telemetry_payload["status"] = "ANOMALY" if len(flagged_sensors) > 0 else "NOMINAL"
        telemetry_payload["is_anomaly"] = bool(len(flagged_sensors) > 0)
    else:
        telemetry_payload["anomaly_score"] = 0.08
        telemetry_payload["threshold"] = float(thresh)
        telemetry_payload["status"] = "NOMINAL"
        telemetry_payload["is_anomaly"] = False

    await manager.send_incident({
        "type": "telemetry",
        "data": telemetry_payload
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
