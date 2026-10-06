import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

from pathlib import Path
import numpy as np
import pandas as pd

from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.root_cause import RootCauseEngine
from spacecraft_rca.models.safety_engine import SafetyEngine
from spacecraft_rca.models.time_to_limit import TimeToLimitProjector
from spacecraft_rca.models.explain import ExplainerEngine

DATA_ROOT = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR = Path("artifacts/cache")
REPORTS_DIR = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)

# 1. Load metadata & caches
sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors = len(sensor_cols)
sig_to_idx = {s: i for i, s in enumerate(sensor_cols)}

hi_limits = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits = np.load(CACHE_DIR / "lo_limits.npy")
res_norm = np.load(CACHE_DIR / "residuals_norm.npy")
df_imp = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")

qp = TelemetryQualityProcessor(DATA_ROOT)
rc_engine = RootCauseEngine(DATA_ROOT)
safety_engine = SafetyEngine(DATA_ROOT)
ttl_projector = TimeToLimitProjector(hi_limits, lo_limits, sensor_cols)
explainer_engine = ExplainerEngine()

incidents_to_generate = [
    ("F004", 40510),
    ("F006", 61098)
]

for fid, al_row in incidents_to_generate:
    print(f"\n=======================================================")
    print(f"  Generating Real Incident JSON: {fid} (Alert Row: {al_row})")
    print(f"=======================================================")
    
    # 32 rows buffer up to al_row
    buf = df_imp.iloc[max(0, al_row - 31) : al_row + 1].copy()
    current_readings = {col: float(buf[col].iloc[-1]) for col in sensor_cols if col in buf.columns}
    timestamp = str(buf['timestamp'].iloc[-1]) if 'timestamp' in buf.columns else f"2026-03-24T{al_row:06d}Z"
    
    # Model residuals at alert row
    row_res = res_norm[al_row]
    # Identify top channels by normalized residual
    top_indices = np.argsort(row_res)[::-1][:5]
    top_channels = [sensor_cols[i] for i in top_indices]
    
    # Threshold for alert = best_thresh ~ 3.0 or scores > 3.0
    thresh = 3.0
    flagged_idx = np.where(row_res > thresh)[0]
    if len(flagged_idx) == 0:
        flagged_idx = top_indices[:2]
    flagged_sensors = [sensor_cols[i] for i in flagged_idx]
    
    # Root Cause Analysis
    rc = rc_engine.analyze_incident(flagged_sensors)
    safety = safety_engine.evaluate(flagged_sensors, current_readings)
    
    # Time-To-Limit projection
    w_df = df_imp.iloc[max(0, al_row - 29) : al_row + 1]
    ttl_res = ttl_projector.evaluate(w_df, top_channels, alpha=0.80)
    
    # Per-channel sigmas
    sigmas = {s: round(float(row_res[sig_to_idx[s]]), 1) for s in flagged_sensors if s in sig_to_idx}
    
    # Runner-up
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
    
    # Limit Margin
    closest_sig = flagged_sensors[0] if flagged_sensors else sensor_cols[0]
    c_idx = sig_to_idx.get(closest_sig, 0)
    c_val = current_readings.get(closest_sig, 0.0)
    c_hi = hi_limits[c_idx]
    c_lo = lo_limits[c_idx]
    c_span = max(1e-4, c_hi - c_lo)
    c_dist = min(abs(c_hi - c_val), abs(c_val - c_lo))
    margin_pct = round(max(0.0, (c_dist / c_span) * 100), 1)
    
    limit_status = {
        "within_limits": bool(c_lo <= c_val <= c_hi),
        "closest_signal": closest_sig,
        "margin_pct": margin_pct
    }
    
    # Quality layer per-channel status and fraction
    ch_statuses, ok_frac = qp.compute_channel_quality_status(buf)
    valid_ch = int(round(ok_frac * len(sensor_cols)))
    dq_dict = {
        "status": "VALID" if ok_frac > 0.8 else "DEGRADED",
        "valid_channels": valid_ch,
        "total_channels": len(sensor_cols),
        "ok_fraction": round(float(ok_frac), 4),
        "per_channel_status": ch_statuses
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
        "fault_id": fid,
        "alert_row": al_row,
        "timestamp": timestamp,
        "anomaly_score_max": round(float(np.max(row_res)), 3),
        "flagged_sensors": flagged_sensors,
        "root_cause_analysis": rc,
        "safety_recommendation": safety,
        "evidence": evidence,
        "explanation": explanation
    }
    
    out_path = REPORTS_DIR / f"incident_{fid}.json"
    with open(out_path, "w") as f:
        json.dump(incident, f, indent=2)
    print(f"Saved incident to {out_path}")
    print("Evidence summary:")
    print(f"  - Onset Order: {evidence['onset_order']}")
    print(f"  - Top Subsystem: {rc.get('subsystem')} (Confidence: {top_conf}%)")
    print(f"  - Runner-up: {ru_dict}")
    print(f"  - Data Quality: {dq_dict['status']} (OK Fraction: {dq_dict['ok_fraction']})")
    print(f"  - Time-To-Limit: {evidence['time_to_limit']['status']}")
    if evidence['time_to_limit']['status'] == 'PROJECTED':
        print(f"    Critical Channel: {evidence['time_to_limit'].get('critical_channel')}")
        print(f"    Median Rows: {evidence['time_to_limit'].get('median_rows')}")
        print(f"    80% Range: {evidence['time_to_limit'].get('range_80')}")
    print(f"Explanation:\n  {explanation}\n")
