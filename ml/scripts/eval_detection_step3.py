import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
import torch
from pathlib import Path
from sklearn.linear_model import Ridge
from itertools import groupby
from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440
WIN          = 32
CAL_OFFSET   = 32

print("=== STEP 3: Detection Evaluation (Ridge Primary, GRU Comparison, Z-Score) ===")

# Helpers
def ewma(arr, alpha=0.3):
    out = np.empty_like(arr, dtype=float)
    out[0] = float(arr[0])
    for i in range(1, len(arr)):
        out[i] = alpha * float(arr[i]) + (1.0 - alpha) * out[i-1]
    return out

def persistence_alerts(score, threshold, win=3):
    binary = (score >= threshold).astype(int)
    alert  = np.zeros(len(binary), dtype=int)
    for i in range(win - 1, len(binary)):
        if binary[i - win + 1 : i + 1].sum() == win:
            alert[i] = 1
    return alert

def episodes_from_alerts(alerts, gap=10):
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

def find_first_alert(alerts, start, end, lookahead=200):
    window = alerts[start : min(end + lookahead, len(alerts))]
    hits = np.where(window)[0]
    return (start + int(hits[0])) if len(hits) else None

def limit_alarm_row(df_sensor, hi, lo):
    violated = (df_sensor.values > hi) | (df_sensor.values < lo)
    rows = np.where(violated.any(axis=1))[0]
    return int(rows[0]) if len(rows) else None

# 1. Load data & metadata
sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_ch = len(sensor_cols)

df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
df_imp   = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
df_gt    = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")

with open("artifacts/splits.json") as f:
    splits = json.load(f)
train_idx    = np.array(splits['train'])
cal_idx_raw  = np.array(splits['calibration'])
val_norm_raw = np.array(splits.get('validation_normal', splits.get('validation', [])))

# Scaler
qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])

df_clean_p = qp.transform_scaler(df_clean)
df_imp_p   = qp.transform_scaler(df_imp)

# Limits
hi_limits = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits = np.load(CACHE_DIR / "lo_limits.npy")

# 2. MODEL 1: GRU from cached normalized residuals
print("\nLoading GRU cached normalized residuals...")
gru_residuals_norm = np.load(CACHE_DIR / "residuals_norm.npy")  # (79968, 23)
gru_score_max = gru_residuals_norm.max(axis=1)

gru_score_all = np.full(len(df_imp), np.nan)
gru_score_all[CAL_OFFSET : CAL_OFFSET + len(gru_score_max)] = gru_score_max
gru_score_all[:CAL_OFFSET] = gru_score_all[CAL_OFFSET]
gru_score_smooth = ewma(gru_score_all, alpha=0.3)

# 3. MODEL 2: Ridge Forecaster (Primary)
print("Fitting Ridge forecaster on clean train split...")
X_sens_clean = df_clean_p[sensor_cols].fillna(0).values
X_sens_imp   = df_imp_p[sensor_cols].fillna(0).values

# Use lag-1 autoregressive features (23 inputs -> 23 outputs)
ridge = Ridge(alpha=10.0)
train_valid = train_idx[train_idx < len(X_sens_clean) - 1]
ridge.fit(X_sens_clean[train_valid], X_sens_clean[train_valid + 1])

ridge_preds_all = ridge.predict(X_sens_imp[:-1])
ridge_res_raw   = np.abs(ridge_preds_all - X_sens_imp[1:])  # length 79999

# Compute Ridge calibration P99 (s_c_ridge)
cal_idx_r = cal_idx_raw[cal_idx_raw < len(ridge_res_raw)]
s_c_ridge = np.percentile(ridge_res_raw[cal_idx_r], 99.0, axis=0)
s_c_ridge = np.where(s_c_ridge < 1e-6, 1e-6, s_c_ridge)

ridge_res_norm = ridge_res_raw / s_c_ridge
ridge_score_max = ridge_res_norm.max(axis=1)

ridge_score_all = np.full(len(df_imp), np.nan)
ridge_score_all[1 : 1 + len(ridge_score_max)] = ridge_score_max
ridge_score_all[0] = ridge_score_max[0]
ridge_score_smooth = ewma(ridge_score_all, alpha=0.3)

# 4. MODEL 3: Z-score Baseline (mode-conditioned)
print("Computing mode-conditioned Z-score baseline...")
mode_stats = {}
for m in df_clean.iloc[cal_idx_raw]['mode'].unique():
    df_m = df_clean.iloc[cal_idx_raw]
    df_m = df_m[df_m['mode'] == m][sensor_cols]
    mode_stats[m] = {
        'mean': df_m.mean().fillna(0).values,
        'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values
    }

z_all = np.zeros(len(df_imp))
modes_arr = df_imp['mode'].values
vals_arr  = df_imp[sensor_cols].ffill().fillna(0).values
for m, stats in mode_stats.items():
    idx_m = np.where(modes_arr == m)[0]
    if len(idx_m) > 0:
        diff = np.abs(vals_arr[idx_m] - stats['mean']) / stats['std']
        z_all[idx_m] = np.max(diff, axis=1)
z_score_smooth = ewma(z_all, alpha=0.3)

# 5. Fault masks for evaluation
fault_rows = set()
for _, row in df_gt.iterrows():
    fault_rows.update(range(int(row['start_row']), int(row['end_row']) + 1))

cal_days = len(cal_idx_raw) / ROWS_PER_DAY
val_norm_days = len(val_norm_raw) / ROWS_PER_DAY

# 6. Budget Curve Evaluation (0.5, 1, 2, 5 FP/day)
budgets = [0.5, 1.0, 2.0, 5.0]

def eval_budget_curve(model_name, full_scores):
    print(f"\n=======================================================")
    print(f"BUDGET CURVE: {model_name}")
    print(f"{'Budget':8} | {'Thresh':8} | {'Val FP/day':11} | {'Events Det':10} | {'Recall':8} | {'Delay':8} | {'Precision':10} | {'F1':8}")
    print("-" * 88)
    
    cal_scores = full_scores[cal_idx_raw]
    curve_records = []
    
    for b in budgets:
        # Calibrate threshold on CALIBRATION ONLY to strictly achieve <= b false episodes/day
        thresh = None
        for cand in np.percentile(cal_scores, np.arange(90, 100, 0.05)):
            al_cal = persistence_alerts(cal_scores, cand)
            eps_cal = episodes_from_alerts(al_cal)
            if len(eps_cal) / cal_days <= b:
                thresh = float(cand)
                break
        if thresh is None:
            thresh = float(np.percentile(cal_scores, 99.9))
            
        # Full alerts
        alerts_all = persistence_alerts(full_scores, thresh)
        
        # Events detected
        detected_count = 0
        delays = []
        for _, f in df_gt.iterrows():
            s_row = int(f['start_row'])
            e_row = int(f['end_row'])
            al_row = find_first_alert(alerts_all, max(0, s_row - 5), e_row)
            if al_row is not None and al_row <= e_row + 50:
                detected_count += 1
                delays.append(al_row - s_row)
                
        rec = detected_count / len(df_gt)
        mean_delay = float(np.mean(delays)) if delays else np.nan
        
        # False episodes on validation normal
        val_alerts = alerts_all[val_norm_raw]
        val_eps = episodes_from_alerts(val_alerts)
        val_fp_per_day = len(val_eps) / val_norm_days if val_norm_days > 0 else 0.0
        
        # Event Precision & F1 on validation normal
        n_fp_events = len(val_eps)
        prec = detected_count / (detected_count + n_fp_events) if (detected_count + n_fp_events) > 0 else 0.0
        f1   = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
        
        curve_records.append({
            'model': model_name, 'budget': b, 'threshold': thresh,
            'val_fp_per_day': val_fp_per_day, 'events_detected': detected_count,
            'recall': rec, 'mean_delay': mean_delay, 'precision': prec, 'f1': f1
        })
        
        print(f"{b:8.1f} | {thresh:8.4f} | {val_fp_per_day:11.3f} | {detected_count:2d}/{len(df_gt)}     | {rec:8.3f} | {mean_delay:8.1f} | {prec:10.4f} | {f1:8.4f}")
    
    return pd.DataFrame(curve_records)

df_curve_ridge = eval_budget_curve("Ridge (Primary)", ridge_score_smooth)
df_curve_gru   = eval_budget_curve("GRU (Comparison)", gru_score_smooth)
df_curve_z     = eval_budget_curve("Z-Score Baseline", z_score_smooth)

# Combine and save curve
all_curves = pd.concat([df_curve_ridge, df_curve_gru, df_curve_z], ignore_index=True)
all_curves.to_csv(REPORTS_DIR / "detection_budget_curve.csv", index=False)

# 7. Operating point = 1.0 false episode/day (fixed before looking at faults)
print("\n" + "=" * 80)
print("OPERATING POINT: 1.0 False Episode / Day on Calibration (Fixed Pre-Evaluation)")
print("=" * 80)

def run_8fault_table(model_name, full_scores):
    cal_scores = full_scores[cal_idx_raw]
    thresh_1 = None
    for cand in np.percentile(cal_scores, np.arange(90, 100, 0.05)):
        al_cal = persistence_alerts(cal_scores, cand)
        eps_cal = episodes_from_alerts(al_cal)
        if len(eps_cal) / cal_days <= 1.0:
            thresh_1 = float(cand)
            break
    if thresh_1 is None:
        thresh_1 = float(np.percentile(cal_scores, 99.9))
        
    alerts_all = persistence_alerts(full_scores, thresh_1)
    
    print(f"\n--- 8-Fault Table: {model_name} (Calibrated Threshold = {thresh_1:.5f}) ---")
    header = f"{'fault_id':8} {'fault_type':28} {'true_source':16} {'limit_alarm':12} {'alert_row':10} {'delay':9} {'lead':9} {'status':8}"
    print(header)
    print("-" * len(header))
    
    records = []
    df_raw_sensor = df_imp[sensor_cols]
    
    for _, row in df_gt.iterrows():
        fid   = row['fault_id']
        ftype = row['fault_type']
        fsrc  = row['source_subsystem']
        s_row = int(row['start_row'])
        e_row = int(row['end_row'])
        
        # Limit alarm
        w_df = df_raw_sensor.iloc[s_row : e_row + 1]
        lim_rel = limit_alarm_row(w_df, hi_limits, lo_limits)
        lim_row_abs = (s_row + lim_rel) if lim_rel is not None else None
        
        # Detector alert
        al_row = find_first_alert(alerts_all, max(0, s_row - 5), e_row)
        detected = (al_row is not None and al_row <= e_row + 50)
        delay = (al_row - s_row) if al_row is not None else None
        lead  = (lim_row_abs - al_row) if (lim_row_abs is not None and al_row is not None) else None
        
        lim_str = str(lim_row_abs) if lim_row_abs is not None else "[BAD] none"
        al_str  = str(al_row) if al_row is not None else "[BAD] miss"
        del_str = str(delay) if delay is not None else "[BAD]"
        ld_str  = str(lead)  if lead is not None  else "[BAD]"
        stat    = "DETECTED" if detected else "[BAD] MISSED"
        
        print(f"{fid:8} {ftype:28} {fsrc:16} {lim_str:12} {al_str:10} {del_str:9} {ld_str:9} {stat:8}")
        
        records.append({
            'model': model_name,
            'fault_id': fid, 'fault_type': ftype, 'true_source': fsrc,
            'limit_alarm_row': lim_row_abs, 'alert_row': al_row,
            'delay_rows': delay, 'lead_rows': lead, 'detected': detected
        })
        
    df_rec = pd.DataFrame(records)
    n_det = df_rec['detected'].sum()
    rec = n_det / len(df_rec)
    val_eps = episodes_from_alerts(alerts_all[val_norm_raw])
    prec = n_det / (n_det + len(val_eps)) if (n_det + len(val_eps)) > 0 else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
    
    print(f"\nSummary for {model_name} @ 1.0 FP/day operating point:")
    print(f"  Detected: {n_det}/{len(df_rec)} (Recall: {rec:.3f})")
    print(f"  False episodes on val_normal ({val_norm_days:.1f} days): {len(val_eps)} ({len(val_eps)/val_norm_days:.2f}/day)")
    print(f"  Event Precision: {prec:.4f}")
    print(f"  Event Recall:    {rec:.4f}")
    print(f"  Event F1-Score:  {f1:.4f}")
    
    return df_rec, thresh_1, alerts_all

df_table_ridge, thresh_ridge_1, alerts_ridge = run_8fault_table("Ridge (Primary)", ridge_score_smooth)
df_table_gru,   thresh_gru_1,   alerts_gru   = run_8fault_table("GRU (Comparison)", gru_score_smooth)
df_table_z,     thresh_z_1,     alerts_z     = run_8fault_table("Z-Score Baseline", z_score_smooth)

# Save the primary 8-fault table (Ridge) to reports/phase2_8fault_table.csv as expected
df_table_ridge.to_csv(REPORTS_DIR / "phase2_8fault_table.csv", index=False)
df_table_gru.to_csv(REPORTS_DIR / "phase2_8fault_table_gru.csv", index=False)

# Save alerts_all.npy corresponding to operating point
np.save(CACHE_DIR / "alerts_all.npy", alerts_ridge)

print("\nSaved:")
print("  - reports/detection_budget_curve.csv")
print("  - reports/phase2_8fault_table.csv (Ridge primary)")
print("  - reports/phase2_8fault_table_gru.csv (GRU comparison)")
print("  - artifacts/cache/alerts_all.npy")
print("STEP 3 COMPLETE.")
