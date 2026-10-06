"""
Phase 2: Real detector evaluation from cached residuals.
NO hardcoded numbers. Everything computed from artifacts/cache/residuals.npy.
"""
import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

import numpy as np
import pandas as pd
from pathlib import Path
from spacecraft_rca.data.loaders import load_metadata_file

DATA_ROOT   = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR   = Path("artifacts/cache")
REPORTS_DIR = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440   # as specified

# ---------- helpers ----------
def ewma(arr, alpha=0.3):
    out = np.empty_like(arr)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = alpha * arr[i] + (1 - alpha) * out[i-1]
    return out

def persistence_alerts(score, threshold, win=3):
    """rolling(win).sum() == win  ===  every row in window >= threshold"""
    binary = (score >= threshold).astype(int)
    alert  = np.zeros(len(binary), dtype=int)
    for i in range(win - 1, len(binary)):
        if binary[i - win + 1 : i + 1].sum() == win:
            alert[i] = 1
    return alert

def find_first_alert(alerts, start, end, lookahead=200):
    window = alerts[start : min(end + lookahead, len(alerts))]
    hits = np.where(window)[0]
    return (start + hits[0]) if len(hits) else None

def episodes_from_alerts(alerts, gap=10):
    """Merge contiguous alert rows within gap into episodes."""
    eps = []
    in_ep = False
    s = None
    for i, a in enumerate(alerts):
        if a and not in_ep:
            in_ep = True; s = i
        elif not a and in_ep:
            if not eps or (s - eps[-1][1]) > gap:
                eps.append((s, i - 1))
            else:
                eps[-1] = (eps[-1][0], i - 1)
            in_ep = False
    if in_ep:
        eps.append((s, len(alerts) - 1))
    return eps

# ---------- load data ----------
print("Loading residuals from cache...")
residuals = np.load(CACHE_DIR / "residuals.npy")   # (79968, 23)
n_rows, n_ch = residuals.shape
print(f"Residuals shape: {residuals.shape}  NaN count: {np.isnan(residuals).sum()}")

# Per-row max score
score_max = residuals.max(axis=1)                  # (79968,)

# Load splits
with open("artifacts/splits.json") as f:
    splits = json.load(f)
cal_idx   = np.array(splits['calibration'])
val_norm  = np.array(splits.get('validation_normal', splits.get('validation', [])))
train_idx = np.array(splits['train'])

# Adjust indices: cache starts at row 32 of the raw 80k, so cache[i] corresponds to raw row i+32
CAL_OFFSET = 32

# ---------- 1. threshold on calibration only ----------
print("\n--- 1. CALIBRATION ---")
cal_idx_adj = cal_idx[cal_idx >= CAL_OFFSET] - CAL_OFFSET
cal_idx_adj = cal_idx_adj[cal_idx_adj < n_rows]
cal_score   = score_max[cal_idx_adj]
cal_score_smooth = ewma(cal_score)

# Sweep thresholds; pick smallest that gives <= 0.5 fp episodes/day on calibration
cal_days = len(cal_idx_adj) / ROWS_PER_DAY
best_thresh = None
for t_candidate in np.percentile(cal_score_smooth, np.arange(95, 100, 0.1)):
    alerts_cal = persistence_alerts(cal_score_smooth, t_candidate)
    eps_cal    = episodes_from_alerts(alerts_cal)
    fp_per_day = len(eps_cal) / cal_days
    if fp_per_day <= 0.5:
        best_thresh = float(t_candidate)
        best_fp_per_day = fp_per_day
        break

if best_thresh is None:
    best_thresh = float(np.percentile(cal_score_smooth, 99.9))
    alerts_cal  = persistence_alerts(cal_score_smooth, best_thresh)
    eps_cal     = episodes_from_alerts(alerts_cal)
    best_fp_per_day = len(eps_cal) / cal_days
    print(f"[BAD] Could not reach <= 0.5 fp/day; best was {best_fp_per_day:.3f} at threshold {best_thresh:.5f}")
else:
    print(f"Threshold: {best_thresh:.5f}  False episodes/day on calibration: {best_fp_per_day:.3f}")

THRESHOLD = best_thresh

# ---------- 2. Limit checker on all 23 signals ----------
print("\n--- 2. LIMIT CHECKER ---")
sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()[:n_ch]   # must match cache column order

df_raw = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
df_raw_sensor = df_raw[sensor_cols].copy()

train_idx_valid = train_idx[train_idx < len(df_raw_sensor)]
train_means = df_raw_sensor.iloc[train_idx_valid].mean()
train_stds  = df_raw_sensor.iloc[train_idx_valid].std().replace(0, 1.0)

if 'high_limit' in sig_cat.columns and 'low_limit' in sig_cat.columns:
    hi_limits = sig_cat.set_index('signal')['high_limit'].reindex(sensor_cols).values.astype(float)
    lo_limits = sig_cat.set_index('signal')['low_limit'].reindex(sensor_cols).values.astype(float)
    print("Limits: from signal_catalog high_limit/low_limit columns")
else:
    hi_limits = (train_means + 4 * train_stds).values
    lo_limits = (train_means - 4 * train_stds).values
    print("Limits: train mean +/- 4 sigma (signal_catalog has no limit columns)")

def limit_alarm_row(df_sensor, hi, lo, sensor_cols):
    """Return first row where ANY signal violates its limit."""
    violated = (df_sensor.values > hi) | (df_sensor.values < lo)
    rows = np.where(violated.any(axis=1))[0]
    return int(rows[0]) if len(rows) else None

# Full-dataset limit alarms per fault window
df_sensor_full = df_raw_sensor.copy()

# ---------- 3. Ground truth and 8-fault table ----------
print("\n--- 3. 8-FAULT TABLE ---")
df_gt = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")

# Build full score & alert arrays on ALL rows
score_all   = np.full(len(df_raw), np.nan)
score_all[CAL_OFFSET : CAL_OFFSET + n_rows] = score_max
# Forward-fill for first 32 rows with first valid value
first_valid = score_all[~np.isnan(score_all)][0]
score_all[:CAL_OFFSET] = first_valid
score_smooth_all = ewma(score_all)
alerts_all  = persistence_alerts(score_smooth_all, THRESHOLD)

header = f"{'fault_id':8} {'fault_type':28} {'true_source':16} {'limit_alarm':12} {'gru_alert':10} {'delay_rows':11} {'lead_rows':10} {'detected':8}"
print(header)
print("-" * len(header))

results = []
for _, row in df_gt.iterrows():
    fid   = row['fault_id']
    ftype = row['fault_type']
    fsrc  = row['source_subsystem']
    s_row = int(row['start_row'])
    e_row = int(row['end_row'])

    # Limit alarm: first row in [s_row, e_row] that ANY signal crosses its limit
    window_df = df_sensor_full.iloc[s_row : e_row + 1]
    lim_row = limit_alarm_row(window_df, hi_limits, lo_limits, sensor_cols)
    lim_row_abs = (s_row + lim_row) if lim_row is not None else None

    # GRU alert: first alert row in [s_row-5, e_row+200]
    gru_row = find_first_alert(alerts_all, max(0, s_row - 5), e_row)

    detected = gru_row is not None and gru_row <= e_row + 50
    delay    = (gru_row - s_row) if gru_row is not None else None
    lead     = (lim_row_abs - gru_row) if (lim_row_abs is not None and gru_row is not None) else None

    # Print
    lim_str   = str(lim_row_abs) if lim_row_abs is not None else "[BAD] no alarm"
    gru_str   = str(gru_row) if gru_row is not None else "[BAD] missed"
    delay_str = str(delay) if delay is not None else "[BAD]"
    lead_str  = str(lead)  if lead is not None  else "[BAD]"
    det_str   = "True" if detected else "False"

    print(f"{fid:8} {ftype:28} {fsrc:16} {lim_str:12} {gru_str:10} {delay_str:11} {lead_str:10} {det_str:8}")

    # Why was it missed?
    if not detected:
        win_scores = score_smooth_all[s_row : e_row + 1]
        print(f"    [BAD] {fid} missed. Score range in window: [{win_scores.min():.4f}, {win_scores.max():.4f}] vs threshold {THRESHOLD:.5f}")

    results.append({
        'fault_id': fid, 'fault_type': ftype, 'true_source': fsrc,
        'limit_alarm_row': lim_row_abs, 'gru_alert_row': gru_row,
        'delay_rows': delay, 'lead_rows': lead, 'detected': detected
    })

df_results = pd.DataFrame(results)

# ---------- Event-level precision / recall / F1 ----------
print("\n--- Event Precision / Recall / F1 ---")
detected_count = df_results['detected'].sum()
n_faults = len(df_results)
recall    = detected_count / n_faults if n_faults else 0.0
# False episodes on validation_normal
val_idx_adj = val_norm[val_norm >= CAL_OFFSET] - CAL_OFFSET
val_idx_adj = val_idx_adj[val_idx_adj < n_rows]
if len(val_idx_adj) == 0:
    print("[BAD] validation_normal split is empty in splits.json; cannot compute FP on normal data")
    fp_per_day_val = None
else:
    val_alerts  = alerts_all[val_idx_adj[0] + CAL_OFFSET : val_idx_adj[-1] + CAL_OFFSET + 1]
    fp_eps_val  = episodes_from_alerts(val_alerts)
    val_days    = len(val_idx_adj) / ROWS_PER_DAY
    fp_per_day_val = len(fp_eps_val) / val_days if val_days > 0 else None
    print(f"Validation-normal rows: {len(val_idx_adj)}  days: {val_days:.3f}  rows/day={ROWS_PER_DAY}")
    print(f"False episodes on validation-normal: {len(fp_eps_val)}  False episodes/day: {fp_per_day_val:.3f}")

# FP on all 80k outside fault windows
fault_rows = set()
for _, row in df_gt.iterrows():
    fault_rows.update(range(int(row['start_row']), int(row['end_row']) + 1))
normal_mask = np.array([i not in fault_rows for i in range(len(alerts_all))])
normal_alerts = alerts_all[normal_mask]
fp_eps_all = episodes_from_alerts(normal_alerts)
normal_days = normal_mask.sum() / ROWS_PER_DAY
fp_per_day_all = len(fp_eps_all) / normal_days if normal_days > 0 else None
print(f"Normal rows outside fault windows: {normal_mask.sum()}  days: {normal_days:.3f}  rows/day={ROWS_PER_DAY}")
print(f"False episodes outside fault windows: {len(fp_eps_all)}  False episodes/day: {fp_per_day_all:.3f}")

# Row-level TP/FP/FN/TN
fault_row_set = set()
for _, row in df_gt.iterrows():
    fault_row_set.update(range(int(row['start_row']), int(row['end_row']) + 1))
y_true = np.array([1 if i in fault_row_set else 0 for i in range(len(alerts_all))])
y_pred = alerts_all
TP = int(((y_pred == 1) & (y_true == 1)).sum())
FP = int(((y_pred == 1) & (y_true == 0)).sum())
FN = int(((y_pred == 0) & (y_true == 1)).sum())
TN = int(((y_pred == 0) & (y_true == 0)).sum())
row_prec = TP / (TP + FP) if (TP + FP) > 0 else 0.0
row_rec  = TP / (TP + FN) if (TP + FN) > 0 else 0.0
row_f1   = 2 * row_prec * row_rec / (row_prec + row_rec) if (row_prec + row_rec) > 0 else 0.0
always_normal_acc = TN / (TN + FP) if (TN + FP) > 0 else 0.0

print(f"\n--- Row-level TP/FP/FN/TN ---")
print(f"TP={TP}  FP={FP}  FN={FN}  TN={TN}")
print(f"Precision={row_prec:.4f}  Recall={row_rec:.4f}  F1={row_f1:.4f}")
print(f"Always-normal accuracy (reference): {always_normal_acc:.4f}")
print(f"\nEvent-level: detected={detected_count}/{n_faults}  Recall={recall:.3f}")

# Save cache for downstream phases
np.save(CACHE_DIR / "score_smooth_all.npy", score_smooth_all)
np.save(CACHE_DIR / "alerts_all.npy", alerts_all)
np.save(CACHE_DIR / "hi_limits.npy", hi_limits)
np.save(CACHE_DIR / "lo_limits.npy", lo_limits)
df_results.to_csv(REPORTS_DIR / "phase2_8fault_table.csv", index=False)
np.save(CACHE_DIR / "score_max_per_row.npy", score_max)

print("\nSaved: artifacts/cache/score_smooth_all.npy, alerts_all.npy, hi_limits.npy, lo_limits.npy, score_max_per_row.npy")
print("Saved: reports/phase2_8fault_table.csv")
print("\nPHASE 2 GATE: evaluating...")
gate_pass = fp_per_day_val is not None and fp_per_day_val <= 1.5
print(f"PHASE 2 GATE: {'PASS' if gate_pass else 'WARN (fp/day > 1 on normal)'}")
