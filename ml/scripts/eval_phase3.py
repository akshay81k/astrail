"""
Phase 3: Generate 60 subsystem + 60 sensor + 30 slow-drift + 40 noise windows.
Run GRU detector AND limit checker on each. Print detected counts and delay per type.
Writes: reports/phase3_injected_results.csv
"""
import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
import torch
from pathlib import Path
from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster
from spacecraft_rca.eval.fault_injector import (
    generate_subsystem_faults, generate_sensor_faults,
    inject_slow_drift, generate_noise_windows,
)

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440
WIN          = 32

# ---- Shared helpers (must match Phase 2 exactly) ----
def ewma(arr, alpha=0.3):
    out = np.empty(len(arr), dtype=float)
    out[0] = float(arr[0])
    for i in range(1, len(arr)):
        out[i] = alpha * float(arr[i]) + (1 - alpha) * out[i-1]
    return out

def persistence_alerts(score, threshold, win=3):
    binary = (np.asarray(score) >= threshold).astype(int)
    alert  = np.zeros(len(binary), dtype=int)
    for i in range(win - 1, len(binary)):
        if binary[i - win + 1 : i + 1].sum() == win:
            alert[i] = 1
    return alert

def first_alert(alerts, start, end, lookahead=200):
    sl = alerts[start : min(end + lookahead, len(alerts))]
    h  = np.where(sl)[0]
    return (start + int(h[0])) if len(h) else None

def limit_row(df_window, hi, lo):
    v = (df_window.values > hi) | (df_window.values < lo)
    r = np.where(v.any(axis=1))[0]
    return int(r[0]) if len(r) else None

# ---- Load artifacts ----
print("Loading GRU model...")
with open("artifacts/gru_config.json") as f:
    cfg = json.load(f)
gru = GRUForecaster(
    input_dim=cfg['input_dim'], hidden_dim=cfg['hidden_dim'],
    num_layers=cfg['num_layers'], output_dim=cfg['output_dim'], dropout=0.0
)
gru.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
gru.eval()

# Calibration threshold saved by Phase 2 (we read the score file + recompute)
score_smooth_all = np.load(CACHE_DIR / "score_smooth_all.npy")
hi_limits        = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits        = np.load(CACHE_DIR / "lo_limits.npy")

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
cal_idx   = np.array(splits_raw['calibration'])
train_idx = np.array(splits_raw['train'])

sig_cat     = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)  # should be 23

# Fit scaler on clean train rows
df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])

# Recompute the same CALIBRATION threshold used in Phase 2
cal_score_smooth = score_smooth_all[cal_idx[cal_idx >= WIN] - WIN]
cal_score_smooth = cal_score_smooth[cal_idx[cal_idx >= WIN] - WIN < len(score_smooth_all)]
cal_days = len(cal_score_smooth) / ROWS_PER_DAY
THRESHOLD = None
for t in np.percentile(cal_score_smooth, np.arange(95, 100, 0.1)):
    alerts_cal = persistence_alerts(cal_score_smooth, t)
    from itertools import groupby
    eps = sum(1 for k, g in groupby(alerts_cal) if k)
    if eps / cal_days <= 0.5:
        THRESHOLD = float(t)
        break
if THRESHOLD is None:
    THRESHOLD = float(np.percentile(cal_score_smooth, 99.9))
    print(f"[BAD] Could not find threshold <= 0.5 fp/day; using {THRESHOLD:.4f}")
else:
    print(f"Threshold (from calibration): {THRESHOLD:.5f}")

# ---- GRU inference on an injected dataframe ----
modes_list = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]

def score_df(df_inj):
    """Return per-row max GRU residual for an injected dataframe."""
    df_p = qp.transform_scaler(df_inj)
    X_sens = df_p[sensor_cols].fillna(0).values
    mode_oh = np.zeros((len(df_p), 4))
    if 'mode' in df_p.columns:
        for j, m in enumerate(modes_list):
            mode_oh[:, j] = (df_p['mode'] == m).astype(float)
    missing_cols = [f"{c}_is_missing" for c in sensor_cols]
    X_mask = np.zeros((len(df_p), n_sensors))
    for j, mc in enumerate(missing_cols):
        if mc in df_p.columns:
            X_mask[:, j] = df_p[mc].astype(float)
    X_full = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    X_t = torch.tensor(X_full, dtype=torch.float32)
    y_t = torch.tensor(X_sens, dtype=torch.float32)
    X_w  = X_t.unfold(0, WIN, 1).transpose(1, 2)[:-1]
    y_tg = y_t[WIN:]
    preds = []
    with torch.no_grad():
        for k in range(0, len(X_w), 512):
            preds.append(gru(X_w[k:k+512]))
    preds = torch.cat(preds, dim=0)
    res = torch.abs(preds - y_tg).numpy()
    score = res.max(axis=1)
    smooth = ewma(score)
    return smooth

# ---- Generate base "normal" dataframe for injection ----
# Use validation_normal slice from clean data (separate from train/cal)
val_norm_idx = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))
if len(val_norm_idx) == 0:
    print("[BAD] validation_normal split empty; using last 20k rows of clean data instead")
    df_normal = df_clean.iloc[-20000:].copy().reset_index(drop=True)
else:
    df_normal = df_clean.iloc[val_norm_idx].copy().reset_index(drop=True)
print(f"Base normal slice: {len(df_normal)} rows")

# ---- Run all four injection types ----
results = []

def eval_set(df_inj_input, df_events, label, run_gru=True):
    """Score an injected dataframe, check limit alarm per event, print table."""
    print(f"\n  --- {label} ({len(df_events)} events) ---")
    if run_gru:
        smooth = score_df(df_inj_input)
        alerts = persistence_alerts(smooth, THRESHOLD)
    
    df_sensor = df_inj_input[sensor_cols].copy()
    
    detected_gru   = 0
    detected_limit = 0
    delays_gru     = []
    delays_limit   = []

    for _, ev in df_events.iterrows():
        s_row = int(ev['start_row'])
        e_row = int(ev['end_row'])
        
        # GRU
        if run_gru:
            g_row = first_alert(alerts, max(0, s_row - WIN), e_row)
            if g_row is not None and g_row <= e_row + 50:
                detected_gru += 1
                delays_gru.append(g_row - s_row)
        
        # Limit checker
        window_df = df_sensor.iloc[s_row : e_row + 1]
        l_rel = limit_row(window_df, hi_limits, lo_limits)
        if l_rel is not None:
            detected_limit += 1
            delays_limit.append(l_rel)

    n = len(df_events)
    gru_recall   = detected_gru / n if n else 0
    lim_recall   = detected_limit / n if n else 0
    avg_gru_del  = float(np.mean(delays_gru))  if delays_gru  else None
    avg_lim_del  = float(np.mean(delays_limit)) if delays_limit else None

    print(f"    GRU detected:   {detected_gru}/{n}  recall={gru_recall:.3f}  avg_delay={avg_gru_del}")
    print(f"    Limit detected: {detected_limit}/{n}  recall={lim_recall:.3f}  avg_delay={avg_lim_del}")

    for _, ev in df_events.iterrows():
        results.append({
            'fault_type':      label,
            'fault_id':        ev['fault_id'],
            'start_row':       int(ev['start_row']),
            'end_row':         int(ev['end_row']),
            'gru_detected':    detected_gru > 0,  # event-level placeholder
            'limit_detected':  detected_limit > 0,
        })

print("\n=== PHASE 3: Injected Fault Evaluation ===")

# 60 subsystem faults
df_sub, ev_sub = generate_subsystem_faults(df_normal, sig_cat, n=60, seed=42)
eval_set(df_sub, ev_sub, "subsystem_fault")

# 60 sensor faults
df_sens, ev_sens = generate_sensor_faults(df_normal, sig_cat, n=60, seed=42)
eval_set(df_sens, ev_sens, "sensor_fault")

# 30 slow-drift faults
df_drift, ev_drift = inject_slow_drift(df_normal, sig_cat, hi_limits, lo_limits, n=30, seed=42)
eval_set(df_drift, ev_drift, "slow_drift")
print("  [Slow drift note: limit checker should detect 0 because ramp stays inside thresholds by design]")

# 40 noise windows
df_noise, ev_noise = generate_noise_windows(df_normal, sig_cat, n=40, seed=42)
eval_set(df_noise, ev_noise, "noise", run_gru=True)

# Save ground truths for downstream phases
ev_sub['split']   = 'injected_train'
ev_sens['split']  = 'injected_train'
ev_drift['split'] = 'injected_train'
ev_noise['split'] = 'injected_train'
all_events = pd.concat([ev_sub, ev_sens, ev_drift, ev_noise], ignore_index=True)
all_events.to_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv", index=False)
pd.DataFrame(results).to_csv(REPORTS_DIR / "phase3_injected_results.csv", index=False)

print("\nSaved: reports/phase3_injected_ground_truth.csv")
print("Saved: reports/phase3_injected_results.csv")
print("\nPHASE 3 GATE: numbers printed above.")
