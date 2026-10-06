import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from scipy.special import softmax

from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440

print("================================================================================")
print("  EVALUATION: Channel Masking Sweep with RIDGE (0%, 10%, 20%, 30%, 40%)")
print("================================================================================")

# 1. Load data
sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors = len(sensor_cols)
subsystems = sorted(sig_cat['subsystem'].unique().tolist())
sub_to_sigs = {sub: sig_cat[sig_cat['subsystem'] == sub]['signal'].tolist() for sub in subsystems}

df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
df_imp   = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
df_gt    = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
train_idx    = np.array(splits_raw['train'])
cal_idx_raw  = np.array(splits_raw['calibration'])
val_norm_raw = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))

qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])

# Fit primary Ridge on clean training data
print("Fitting Ridge forecaster on clean train split...")
df_clean_p = qp.transform_scaler(df_clean)
X_sens_clean = df_clean_p[sensor_cols].fillna(0).values

ridge = Ridge(alpha=10.0)
train_valid = train_idx[train_idx < len(X_sens_clean) - 1]
ridge.fit(X_sens_clean[train_valid], X_sens_clean[train_valid + 1])

# Calibrate s_c_ridge and threshold at 1.0 FP/day budget on calibration split
df_cal_clean = df_clean.iloc[cal_idx_raw].copy().reset_index(drop=True)
df_cal_p = qp.transform_scaler(df_cal_clean)
X_cal = df_cal_p[sensor_cols].fillna(0).values
cal_preds = ridge.predict(X_cal[:-1])
cal_res_raw = np.abs(cal_preds - X_cal[1:])

s_c_ridge = np.percentile(cal_res_raw, 99.0, axis=0)
s_c_ridge = np.where(s_c_ridge < 1e-6, 1e-6, s_c_ridge)
cal_res_norm = cal_res_raw / s_c_ridge
cal_scores = cal_res_norm.max(axis=1)

# Helper: EWMA and persistence
def ewma(arr, alpha=0.3):
    out = np.empty_like(arr, dtype=float)
    out[0] = float(arr[0])
    for i in range(1, len(arr)):
        out[i] = alpha * float(arr[i]) + (1.0 - alpha) * out[i-1]
    return out

def persistence_alerts(score, threshold, win=3):
    binary = (score >= threshold).astype(int)
    alert = np.zeros(len(binary), dtype=int)
    for i in range(win - 1, len(binary)):
        if binary[i - win + 1 : i + 1].sum() == win:
            alert[i] = 1
    return alert

def episodes_from_alerts(alerts, gap=10):
    eps = []
    in_ep = False; s = None
    for i, a in enumerate(alerts):
        if a and not in_ep: in_ep = True; s = i
        elif not a and in_ep:
            if not eps or (s - eps[-1][1]) > gap: eps.append((s, i-1))
            else: eps[-1] = (eps[-1][0], i-1)
            in_ep = False
    if in_ep: eps.append((s, len(alerts)-1))
    return eps

cal_scores_smooth = ewma(cal_scores, alpha=0.3)
cal_days = len(cal_scores) / ROWS_PER_DAY

# Target threshold for ~1.0 FP/day on calibration
best_thresh = float(np.percentile(cal_scores_smooth, 99.5))
for t in np.linspace(float(np.percentile(cal_scores_smooth, 98.0)), float(np.percentile(cal_scores_smooth, 99.99)), 100):
    al = persistence_alerts(cal_scores_smooth, t)
    ep = episodes_from_alerts(al)
    fp_day = len(ep) / cal_days
    if fp_day <= 1.0:
        best_thresh = float(t)
        break

print(f"Ridge Calibrated Threshold (@ 1.0 FP/day budget): {best_thresh:.4f}")

# RCA Engine v2 ranking helper
def rca_rank_window(res_window):
    scores = {}
    onsets = {}
    for c in range(res_window.shape[1]):
        col = res_window[:, c]
        above = (col >= 1.0).astype(int)
        for i in range(len(above) - 2):
            if above[i : i + 3].sum() == 3:
                onsets[c] = i
                break
    min_onset = min(onsets.values()) if onsets else 0
    w_len = len(res_window)
    
    for sub in subsystems:
        ch_indices = [sensor_cols.index(s) for s in sub_to_sigs[sub] if s in sensor_cols]
        if not ch_indices:
            scores[sub] = 0.0
            continue
        ch_peaks = [float(res_window[:, c].max()) for c in ch_indices]
        ch_peaks.sort(reverse=True)
        top2_sum = sum(ch_peaks[:2])
        sub_onsets = [onsets[c] for c in ch_indices if c in onsets]
        if sub_onsets:
            earliness = max(0.0, 1.0 - (min(sub_onsets) - min_onset) / (w_len + 1e-6))
            bonus = 1.5 * earliness
        else:
            bonus = 0.0
        scores[sub] = top2_sum + bonus
    
    sorted_subs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    ranked_names = [s[0] for s in sorted_subs]
    score_vals = np.array([s[1] for s in sorted_subs])
    # Softmax confidence with T=0.20
    probs = softmax(score_vals / 0.20)
    top1_conf = float(probs[0])
    return ranked_names, top1_conf

masking_levels = [0.0, 0.10, 0.20, 0.30, 0.40]
results = []
np.random.seed(42)

for m_pct in masking_levels:
    n_mask = int(round(m_pct * n_sensors))
    
    # 1. Evaluate false episodes/day on validation-normal
    df_val_raw = df_clean.iloc[val_norm_raw].copy().reset_index(drop=True)
    if n_mask > 0:
        mask_chans = np.random.choice(sensor_cols, size=n_mask, replace=False)
        for mc in mask_chans:
            # Impute via forward-fill as quality layer does
            df_val_raw.loc[:, mc] = np.nan
            df_val_raw[mc] = df_val_raw[mc].ffill().bfill()
            
    df_val_p = qp.transform_scaler(df_val_raw)
    X_val = df_val_p[sensor_cols].fillna(0).values
    val_preds = ridge.predict(X_val[:-1])
    val_res = np.abs(val_preds - X_val[1:]) / s_c_ridge
    val_score = ewma(val_res.max(axis=1), alpha=0.3)
    val_alerts = persistence_alerts(val_score, best_thresh)
    val_eps = episodes_from_alerts(val_alerts)
    val_days = len(val_score) / ROWS_PER_DAY
    fp_per_day = len(val_eps) / val_days
    
    # 2. Evaluate recall, RCA top-1, top-3, and mean confidence on 8 real faults
    df_imp_masked = df_imp.copy()
    if n_mask > 0:
        mask_chans_fault = np.random.choice(sensor_cols, size=n_mask, replace=False)
        for mc in mask_chans_fault:
            df_imp_masked.loc[:, mc] = np.nan
            df_imp_masked[mc] = df_imp_masked[mc].ffill().bfill()
            
    df_imp_p = qp.transform_scaler(df_imp_masked)
    X_imp = df_imp_p[sensor_cols].fillna(0).values
    imp_preds = ridge.predict(X_imp[:-1])
    imp_res = np.abs(imp_preds - X_imp[1:]) / s_c_ridge
    imp_score = np.full(len(df_imp), np.nan)
    imp_score[1:] = imp_res.max(axis=1)
    imp_score[0] = imp_score[1]
    imp_score_smooth = ewma(imp_score, alpha=0.3)
    
    imp_alerts = persistence_alerts(imp_score_smooth, best_thresh)
    
    detected_count = 0
    top1_matches = 0
    top3_matches = 0
    conf_list = []
    
    for _, row in df_gt.iterrows():
        s_row = int(row['start_row'])
        e_row = int(row['end_row'])
        true_sub = row['source_subsystem']
        
        # Check if alert occurs in window [s_row, e_row + 200]
        w_al = imp_alerts[s_row : min(len(imp_alerts), e_row + 200)]
        hits = np.where(w_al)[0]
        if len(hits) > 0:
            detected_count += 1
            al_idx = s_row + int(hits[0])
            
            # RCA window
            w_start = max(0, al_idx - 10)
            w_end   = min(len(imp_res), al_idx + 60)
            res_win = imp_res[w_start : w_end]
            
            ranked, conf = rca_rank_window(res_win)
            conf_list.append(conf)
            if ranked and ranked[0] == true_sub:
                top1_matches += 1
            if true_sub in ranked[:3]:
                top3_matches += 1
                
    recall = detected_count / len(df_gt)
    rca_t1 = (top1_matches / detected_count) if detected_count > 0 else 0.0
    rca_t3 = (top3_matches / detected_count) if detected_count > 0 else 0.0
    mean_conf = float(np.mean(conf_list)) if conf_list else 0.0
    
    rec = {
        "masking_pct": int(m_pct * 100),
        "recall": round(recall, 3),
        "false_episodes_day": round(fp_per_day, 3),
        "rca_top1": round(rca_t1, 3),
        "rca_top3": round(rca_t3, 3),
        "mean_confidence": round(mean_conf, 3)
    }
    results.append(rec)
    print(f"Masking {rec['masking_pct']:2d}% -> Recall: {rec['recall']:.3f} | FP/day: {rec['false_episodes_day']:.3f} | RCA Top-1: {rec['rca_top1']:.3f} | RCA Top-3: {rec['rca_top3']:.3f} | Mean Conf: {rec['mean_confidence']:.3f}")

df_out = pd.DataFrame(results)
out_csv = REPORTS_DIR / "masking_sweep_ridge.csv"
df_out.to_csv(out_csv, index=False)
print(f"\nSaved results to {out_csv}")
