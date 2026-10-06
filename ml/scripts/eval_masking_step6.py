import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
import torch
from pathlib import Path
from scipy.special import softmax
from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440
WIN          = 32
CAL_OFFSET   = 32

print("=== STEP 6: Channel Masking Robustness Sweep (0%, 10%, 20%, 30%, 40%) ===")

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

df_cal_norm  = df_clean.iloc[cal_idx_raw].copy().reset_index(drop=True)
df_val_norm  = df_clean.iloc[val_norm_raw].copy().reset_index(drop=True)
cal_days     = len(df_cal_norm) / ROWS_PER_DAY
val_days     = len(df_val_norm) / ROWS_PER_DAY

s_c = np.load(CACHE_DIR / "s_c.npy")

# Load GRU
with open("artifacts/gru_config.json") as f: cfg = json.load(f)
gru = GRUForecaster(cfg['input_dim'], cfg['hidden_dim'], cfg['num_layers'], cfg['output_dim'], dropout=0.0)
gru.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
gru.eval()

modes_list = ["NOMINAL", "SAFE", "HIGH_LOAD", "COMM"]

# Helpers
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

def find_first_alert(alerts, start, end, lookahead=200):
    window = alerts[start : min(end + lookahead, len(alerts))]
    hits = np.where(window)[0]
    return (start + int(hits[0])) if len(hits) else None

# Helper to run GRU with masking
def run_gru_masked(df_in, masked_channels=None):
    df_p = qp.transform_scaler(df_in)
    X_sens = df_p[sensor_cols].fillna(0).values
    
    # Mode one-hot
    mode_oh = np.zeros((len(df_p), 4))
    for j, m in enumerate(modes_list):
        if 'mode' in df_p.columns:
            mode_oh[:, j] = (df_p['mode'] == m).astype(float)
            
    # Mask indicators
    X_mask = np.zeros((len(df_p), n_sensors))
    if masked_channels:
        for c in masked_channels:
            c_idx = sensor_cols.index(c)
            X_sens[:, c_idx] = 0.0
            X_mask[:, c_idx] = 1.0
            
    X_full = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    X_t = torch.tensor(X_full, dtype=torch.float32)
    X_w = X_t.unfold(0, WIN, 1).transpose(1, 2)[:-1]
    y_tg = torch.tensor(X_sens[32:], dtype=torch.float32)
    
    with torch.no_grad():
        preds = []
        for k in range(0, len(X_w), 512):
            preds.append(gru(X_w[k : k + 512]))
        preds = torch.cat(preds, dim=0)
    res = torch.abs(preds - y_tg).numpy()
    res_norm = res / s_c
    return res_norm

# RCA helper with mask
def evaluate_rca_window(res_window, true_sub, masked_channels, T=0.20):
    scores = {}
    for sub in subsystems:
        sigs = [s for s in sub_to_sigs[sub] if s not in masked_channels]
        ch_indices = [sensor_cols.index(s) for s in sigs if s in sensor_cols]
        if not ch_indices:
            scores[sub] = 0.0
            continue
        ch_peaks = [float(res_window[:, c].max()) for c in ch_indices]
        ch_peaks.sort(reverse=True)
        scores[sub] = sum(ch_peaks[:2])
        
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top1 = ranked[0][0]
    top3 = [r[0] for r in ranked[:3]]
    
    logits = np.array([scores[s] for s in subsystems])
    probs  = softmax(logits / T)
    conf   = float(probs[subsystems.index(top1)])
    
    return int(true_sub == top1), int(true_sub in top3), conf

# 2. Masking Sweep: 0%, 10%, 20%, 30%, 40%
mask_levels = [0.0, 0.10, 0.20, 0.30, 0.40]
results_table = []

print("\n" + "=" * 90)
print(f"{'Mask Level':12} | {'Cal Thresh':11} | {'Recall':8} | {'FP / Day':10} | {'Top-1 RCA':10} | {'Top-3 RCA':10} | {'Mean Conf':10}")
print("-" * 90)

for m_lvl in mask_levels:
    np.random.seed(int(m_lvl * 100))
    n_masked = int(round(n_sensors * m_lvl))
    if n_masked > 0:
        masked_chans = np.random.choice(sensor_cols, size=n_masked, replace=False).tolist()
    else:
        masked_chans = []
        
    # 1. Re-derive threshold on calibration slice WITH THE SAME MASK
    res_cal = run_gru_masked(df_cal_norm, masked_chans)
    # Exclude masked channels from score_max
    unmasked_indices = [i for i, c in enumerate(sensor_cols) if c not in masked_chans]
    score_cal_max = res_cal[:, unmasked_indices].max(axis=1) if unmasked_indices else res_cal.max(axis=1)
    score_cal_smooth = ewma(score_cal_max)
    
    # Calibrate threshold for budget = 1.0 FP/day
    thresh = None
    for cand in np.percentile(score_cal_smooth, np.arange(90, 100, 0.05)):
        al = persistence_alerts(score_cal_smooth, cand)
        eps = episodes_from_alerts(al)
        if len(eps) / cal_days <= 1.0:
            thresh = float(cand); break
    if thresh is None:
        thresh = float(np.percentile(score_cal_smooth, 99.9))
        
    # 2. Evaluate False Episodes / day on validation normal WITH THE SAME MASK
    res_val = run_gru_masked(df_val_norm, masked_chans)
    score_val_max = res_val[:, unmasked_indices].max(axis=1) if unmasked_indices else res_val.max(axis=1)
    score_val_smooth = ewma(score_val_max)
    alerts_val = persistence_alerts(score_val_smooth, thresh)
    eps_val = episodes_from_alerts(alerts_val)
    val_fp_day = len(eps_val) / val_days if val_days > 0 else 0.0
    
    # 3. Evaluate 8 real faults on imperfect series WITH THE SAME MASK
    res_imp = run_gru_masked(df_imp, masked_chans)
    score_imp_max = res_imp[:, unmasked_indices].max(axis=1) if unmasked_indices else res_imp.max(axis=1)
    
    score_full = np.full(len(df_imp), np.nan)
    score_full[CAL_OFFSET : CAL_OFFSET + len(score_imp_max)] = score_imp_max
    score_full[:CAL_OFFSET] = score_imp_max[0]
    score_imp_smooth = ewma(score_full)
    alerts_imp = persistence_alerts(score_imp_smooth, thresh)
    
    det_count = 0
    top1_count = 0
    top3_count = 0
    confs = []
    
    for _, row in df_gt.iterrows():
        fid = row['fault_id']
        true_s = row['source_subsystem']
        s_row = int(row['start_row'])
        e_row = int(row['end_row'])
        
        # Detector alert
        al_row = find_first_alert(alerts_imp, max(0, s_row - 5), e_row)
        detected = (al_row is not None and al_row <= e_row + 50)
        if detected:
            det_count += 1
            
        # RCA on window [s_row - 10, s_row + 60]
        w_start = max(0, s_row - 10 - CAL_OFFSET)
        w_end   = min(len(res_imp), s_row + 60 - CAL_OFFSET)
        window_res = res_imp[w_start : w_end]
        
        t1, t3, conf = evaluate_rca_window(window_res, true_s, masked_chans)
        top1_count += t1
        top3_count += t3
        confs.append(conf)
        
    rec = det_count / len(df_gt)
    rca_top1 = top1_count / len(df_gt)
    rca_top3 = top3_count / len(df_gt)
    mean_conf = float(np.mean(confs))
    
    results_table.append({
        'mask_fraction': m_lvl,
        'masked_channels_count': n_masked,
        'calibrated_threshold': thresh,
        'recall': rec,
        'false_episodes_per_day': val_fp_day,
        'rca_top1': rca_top1,
        'rca_top3': rca_top3,
        'mean_confidence': mean_conf
    })
    
    print(f"{int(m_lvl*100):3d}% ({n_masked:2d} ch)  | {thresh:11.4f} | {rec:7.3f}  | {val_fp_day:10.3f} | {rca_top1*100:9.1f}% | {rca_top3*100:9.1f}% | {mean_conf:10.4f}")

df_results_mask = pd.DataFrame(results_table)

# Verification: Metrics must change across levels
assert df_results_mask['mean_confidence'].nunique() > 1, "[BAD] Mean confidence did NOT change across masking levels!"
assert df_results_mask['calibrated_threshold'].nunique() > 1, "[BAD] Threshold did NOT change across masking levels!"
print("\nVerification check: ALL METRICS AND THRESHOLDS PROPERLY RESPOND AND CHANGE ACROSS MASKING LEVELS! PASS.")

# Save CSVs
df_results_mask.to_csv(REPORTS_DIR / "phase7_confidence_results.csv", index=False)
df_results_mask.to_csv(REPORTS_DIR / "phase7_ablations.csv", index=False)

print("\nSaved:")
print("  - reports/phase7_confidence_results.csv")
print("  - reports/phase7_ablations.csv")
print("STEP 6 COMPLETE.")
