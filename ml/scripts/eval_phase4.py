"""
Phase 4: CUSUM (Page-Hinkley) detector on normalized residuals.
Thresholds chosen on calibration for same false-alert budget as Phase 2.
Reports: 30 slow-drift faults: detected, delay, false episodes/day on normal data,
         with and without CUSUM.
Writes: reports/phase4_cusum_results.csv
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
from spacecraft_rca.eval.fault_injector import inject_slow_drift

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440
WIN          = 32

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

def episodes_from_alerts(alerts, gap=10):
    eps = []; in_ep = False; s = None
    for i, a in enumerate(alerts):
        if a and not in_ep:
            in_ep = True; s = i
        elif not a and in_ep:
            eps.append((s, i - 1)); in_ep = False
    if in_ep: eps.append((s, len(alerts) - 1))
    return eps

def cusum_detector(residuals_norm, delta, threshold_h):
    """
    Page-Hinkley CUSUM on per-row max normalized residual.
    Raises alert when cumulative sum S_hi > threshold_h.
    delta: target shift size (0.5 * expected_mean_shift)
    """
    n = len(residuals_norm)
    S_hi = np.zeros(n)
    alerts = np.zeros(n, dtype=int)
    for i in range(1, n):
        S_hi[i] = max(0.0, S_hi[i-1] + residuals_norm[i] - delta)
        if S_hi[i] > threshold_h:
            alerts[i] = 1
    return alerts, S_hi

# Load data
print("Loading cache...")
residuals         = np.load(CACHE_DIR / "residuals.npy")            # (79968, 23)
score_smooth_all  = np.load(CACHE_DIR / "score_smooth_all.npy")
hi_limits         = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits         = np.load(CACHE_DIR / "lo_limits.npy")
score_max_all     = np.load(CACHE_DIR / "score_max_per_row.npy")

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
cal_idx   = np.array(splits_raw['calibration'])
val_norm  = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))
train_idx = np.array(splits_raw['train'])

sig_cat     = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)

# Recompute GRU threshold from calibration (same as Phase 2)
cal_idx_adj = cal_idx[cal_idx >= WIN] - WIN
cal_idx_adj = cal_idx_adj[cal_idx_adj < len(score_max_all)]
cal_score   = ewma(score_max_all[cal_idx_adj])
cal_days    = len(cal_idx_adj) / ROWS_PER_DAY
THRESHOLD = None
for t in np.percentile(cal_score, np.arange(95, 100, 0.1)):
    alerts_cal = persistence_alerts(cal_score, t)
    n_eps = len(episodes_from_alerts(alerts_cal))
    if n_eps / cal_days <= 0.5:
        THRESHOLD = float(t); break
if THRESHOLD is None:
    THRESHOLD = float(np.percentile(cal_score, 99.9))
    print(f"[BAD] Could not reach <=0.5 fp/day; using {THRESHOLD:.5f}")
print(f"GRU Threshold: {THRESHOLD:.5f}")

# Normalize residuals by calibration std for CUSUM
cal_res = residuals[cal_idx_adj]
cal_res_max = cal_res.max(axis=1)
cal_mu  = cal_res_max.mean()
cal_std = cal_res_max.std()
if cal_std == 0: cal_std = 1.0
res_norm_all = (score_max_all - cal_mu) / cal_std

# Calibrate CUSUM threshold on calibration split for <=0.5 fp/day
cal_norm = res_norm_all[cal_idx_adj]
CUSUM_DELTA = 0.5   # target shift = 0.5 sigma
CUSUM_H = None
for h_candidate in np.arange(1.0, 20.0, 0.5):
    alerts_cusum, _ = cusum_detector(cal_norm, CUSUM_DELTA, h_candidate)
    eps_cusum = episodes_from_alerts(alerts_cusum)
    if len(eps_cusum) / cal_days <= 0.5:
        CUSUM_H = h_candidate; break
if CUSUM_H is None:
    CUSUM_H = 20.0
    print(f"[BAD] CUSUM could not reach <=0.5 fp/day on calibration; using H={CUSUM_H}")
else:
    _, _s = cusum_detector(cal_norm, CUSUM_DELTA, CUSUM_H)
    eps_check = episodes_from_alerts(persistence_alerts((_s > CUSUM_H).astype(float), 0.5))
    print(f"CUSUM H: {CUSUM_H:.1f}  delta: {CUSUM_DELTA:.2f}")

# Build CUSUM alerts on full residuals
alerts_cusum_full, S_full = cusum_detector(res_norm_all, CUSUM_DELTA, CUSUM_H)

# Also build standard GRU alerts on full row stream
score_all_smooth = ewma(score_max_all)
alerts_gru_full  = persistence_alerts(score_all_smooth, THRESHOLD)

# Combined: alert if EITHER detector fires
alerts_combined  = np.maximum(alerts_gru_full, alerts_cusum_full)

# False episodes on validation_normal for each path
def fp_on_val(alerts):
    if len(val_norm) == 0: return None, None
    v_alerts = alerts[val_norm[0]:val_norm[-1]+1]
    eps = episodes_from_alerts(v_alerts)
    days = len(val_norm) / ROWS_PER_DAY
    return len(eps), len(eps)/days if days>0 else None

fp_gru_n,  fp_gru_d  = fp_on_val(alerts_gru_full)
fp_cus_n,  fp_cus_d  = fp_on_val(alerts_cusum_full)
fp_comb_n, fp_comb_d = fp_on_val(alerts_combined)

print(f"\nFalse episodes/day on val-normal  [GRU alone]: {fp_gru_d}")
print(f"False episodes/day on val-normal  [CUSUM alone]: {fp_cus_d}")
print(f"False episodes/day on val-normal  [GRU+CUSUM combined]: {fp_comb_d}")

# Load or regenerate slow-drift events
gt_path = REPORTS_DIR / "phase3_injected_ground_truth.csv"
if gt_path.exists():
    all_events = pd.read_csv(gt_path)
    ev_drift   = all_events[all_events['fault_type'] == 'slow_drift'].copy()
    print(f"\nLoaded {len(ev_drift)} slow-drift events from Phase 3 ground truth.")
else:
    print("[BAD] Phase 3 ground truth not found; cannot evaluate slow-drift. Run eval_phase3.py first.")
    sys.exit(1)

# Load clean data to regenerate slow-drift injected data for scoring
df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
val_norm_idx = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))
if len(val_norm_idx) == 0:
    df_normal = df_clean.iloc[-20000:].copy().reset_index(drop=True)
else:
    df_normal = df_clean.iloc[val_norm_idx].copy().reset_index(drop=True)

df_drift_inj, ev_drift_re = inject_slow_drift(df_normal, sig_cat, hi_limits, lo_limits, n=30, seed=42)

# Score the slow-drift data
qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])
df_drift_proc = qp.transform_scaler(df_drift_inj)

X_sens = df_drift_proc[sensor_cols].fillna(0).values
mode_oh = np.zeros((len(df_drift_proc), 4))
if 'mode' in df_drift_proc.columns:
    modes_list = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]
    for j, m in enumerate(modes_list):
        mode_oh[:, j] = (df_drift_proc['mode'] == m).astype(float)
X_mask = np.zeros((len(df_drift_proc), n_sensors))
X_full = np.concatenate([X_sens, mode_oh, X_mask], axis=1)

with open("artifacts/gru_config.json") as f:
    cfg = json.load(f)
gru = GRUForecaster(
    input_dim=cfg['input_dim'], hidden_dim=cfg['hidden_dim'],
    num_layers=cfg['num_layers'], output_dim=cfg['output_dim'], dropout=0.0
)
gru.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
gru.eval()

X_t = torch.tensor(X_full, dtype=torch.float32)
y_t = torch.tensor(X_sens, dtype=torch.float32)
X_w = X_t.unfold(0, WIN, 1).transpose(1, 2)[:-1]
y_tg = y_t[WIN:]
preds = []
with torch.no_grad():
    for k in range(0, len(X_w), 512):
        preds.append(gru(X_w[k:k+512]))
preds = torch.cat(preds, dim=0)
drift_res    = torch.abs(preds - y_tg).numpy()
drift_score  = drift_res.max(axis=1)
drift_norm   = (drift_score - cal_mu) / cal_std
drift_smooth = ewma(drift_score)

drift_alerts_gru   = persistence_alerts(drift_smooth, THRESHOLD)
drift_alerts_cusum, _ = cusum_detector(drift_norm, CUSUM_DELTA, CUSUM_H)

print(f"\n--- Slow Drift: GRU vs CUSUM vs Limit Checker ---")
print(f"{'fault_id':15} {'start':8} {'end':8} {'lim_detected':14} {'gru_detected':14} {'cusum_detected':16} {'gru_delay':10} {'cusum_delay':12}")

records = []
limit_det = 0; gru_det = 0; cusum_det = 0

for _, ev in ev_drift_re.iterrows():
    s  = int(ev['start_row'])
    e  = int(ev['end_row'])
    # Limit check
    win_df = df_drift_inj[sensor_cols].iloc[s:e+1]
    l_rel  = None
    v = (win_df.values > hi_limits) | (win_df.values < lo_limits)
    r = np.where(v.any(axis=1))[0]
    l_detected = len(r) > 0
    if l_detected: limit_det += 1; l_rel = int(r[0])

    # GRU alert
    g_row = None
    win_g = drift_alerts_gru[max(0, s-WIN) : min(e+100, len(drift_alerts_gru))]
    h = np.where(win_g)[0]
    g_detected = len(h) > 0
    if g_detected: gru_det += 1; g_row = max(0, s-WIN) + int(h[0])

    # CUSUM alert
    c_row = None
    win_c = drift_alerts_cusum[max(0, s-WIN) : min(e+100, len(drift_alerts_cusum))]
    hc = np.where(win_c)[0]
    c_detected = len(hc) > 0
    if c_detected: cusum_det += 1; c_row = max(0, s-WIN) + int(hc[0])

    g_delay = (g_row - s) if g_row is not None else None
    c_delay = (c_row - s) if c_row is not None else None

    print(f"{ev['fault_id']:15} {s:8} {e:8} {str(l_detected):14} {str(g_detected):14} {str(c_detected):16} {str(g_delay):10} {str(c_delay):12}")
    records.append({
        'fault_id': ev['fault_id'], 'start': s, 'end': e,
        'limit_detected': l_detected, 'gru_detected': g_detected, 'cusum_detected': c_detected,
        'gru_delay': g_delay, 'cusum_delay': c_delay
    })

n_drift = len(ev_drift_re)
print(f"\nSummary (n={n_drift}): Limit={limit_det}/{n_drift}  GRU={gru_det}/{n_drift}  CUSUM={cusum_det}/{n_drift}")
if limit_det > 0:
    print(f"[BAD] Limit checker fired on {limit_det} slow-drift faults — verify peak_delta stays inside limits.")

pd.DataFrame(records).to_csv(REPORTS_DIR / "phase4_cusum_results.csv", index=False)
print("\nSaved: reports/phase4_cusum_results.csv")
print("\nPHASE 4 GATE: numbers printed above.")
