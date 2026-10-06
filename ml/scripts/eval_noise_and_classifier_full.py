import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

from pathlib import Path
import numpy as np
import pandas as pd
import torch
from sklearn.linear_model import Ridge
from sklearn.metrics import confusion_matrix

from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440

print("================================================================================")
print("  EVALUATION: Noise Sweep on Detectors & Full Classifier Confusion Matrices")
print("================================================================================")

# 1. Load metadata & splits
sig_cat   = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
dep_graph = load_metadata_file(DATA_ROOT, "dependency_graph.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)

df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
df_imp   = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
df_gt    = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
train_idx    = np.array(splits_raw['train'])
cal_idx_raw  = np.array(splits_raw['calibration'])
val_norm_raw = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))

df_val_norm = df_clean.iloc[val_norm_raw].copy().reset_index(drop=True)
val_days = len(df_val_norm) / ROWS_PER_DAY

qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])

hi_limits = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits = np.load(CACHE_DIR / "lo_limits.npy")
s_c       = np.load(CACHE_DIR / "s_c.npy")

# Helper functions
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

# Models: Ridge and GRU
print("Fitting Ridge on train split...")
df_clean_p = qp.transform_scaler(df_clean)
X_sens_clean = df_clean_p[sensor_cols].fillna(0).values
ridge = Ridge(alpha=10.0)
train_valid = train_idx[train_idx < len(X_sens_clean) - 1]
ridge.fit(X_sens_clean[train_valid], X_sens_clean[train_valid + 1])

df_cal_p = qp.transform_scaler(df_clean.iloc[cal_idx_raw])
X_cal = df_cal_p[sensor_cols].fillna(0).values
cal_preds = ridge.predict(X_cal[:-1])
s_c_ridge = np.percentile(np.abs(cal_preds - X_cal[1:]), 99.0, axis=0)
s_c_ridge = np.where(s_c_ridge < 1e-6, 1e-6, s_c_ridge)

cal_ridge_score = ewma((np.abs(cal_preds - X_cal[1:]) / s_c_ridge).max(axis=1), alpha=0.3)
cal_days = len(cal_ridge_score) / ROWS_PER_DAY

thresh_ridge = float(np.percentile(cal_ridge_score, 99.5))
for t in np.linspace(float(np.percentile(cal_ridge_score, 98.0)), float(np.percentile(cal_ridge_score, 99.99)), 100):
    al = persistence_alerts(cal_ridge_score, t)
    if len(episodes_from_alerts(al)) / cal_days <= 1.0:
        thresh_ridge = float(t)
        break

with open("artifacts/gru_config.json") as f: cfg = json.load(f)
gru = GRUForecaster(cfg['input_dim'], cfg['hidden_dim'], cfg['num_layers'], cfg['output_dim'], dropout=0.0)
gru.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
gru.eval()
thresh_gru = 1.0519

print(f"Calibrated Operating Thresholds (@ 1.0 FP/day budget): Ridge = {thresh_ridge:.4f}, GRU = {thresh_gru:.4f}")

# PART A: Exact Noise Sweep
print("\n--- PART A: Noise Sweep on Validation Normal Telemetry ---")
np.random.seed(42)
burst_starts = np.sort(np.random.choice(range(64, len(df_val_norm) - 60), size=40, replace=False))

def run_noise_detector_eval(sigma_noise=0.0):
    df_noisy = df_val_norm.copy()
    if sigma_noise > 0.0:
        for b_start in burst_starts:
            n_ch = np.random.randint(1, 4)
            chans = np.random.choice(sensor_cols, size=n_ch, replace=False)
            dur = 30
            for c in chans:
                noise_vals = np.random.normal(0, sigma_noise * df_val_norm[c].std(), dur)
                df_noisy.loc[b_start : b_start + dur - 1, c] += noise_vals
                
    # 1. Limit Alarm detector
    df_sensor_vals = df_noisy[sensor_cols].values
    lim_violated = (df_sensor_vals > hi_limits) | (df_sensor_vals < lo_limits)
    lim_alerts = lim_violated.any(axis=1).astype(int)
    lim_fp_day = len(episodes_from_alerts(lim_alerts)) / val_days
    
    # 2. Ridge detector
    df_p = qp.transform_scaler(df_noisy)
    X_sens = df_p[sensor_cols].fillna(0).values
    ridge_preds = ridge.predict(X_sens[:-1])
    ridge_res = np.abs(ridge_preds - X_sens[1:]) / s_c_ridge
    ridge_score = ewma(ridge_res.max(axis=1), alpha=0.3)
    ridge_alerts = persistence_alerts(ridge_score, thresh_ridge)
    ridge_fp_day = len(episodes_from_alerts(ridge_alerts)) / val_days
    
    # 3. GRU detector
    mode_oh = np.zeros((len(df_p), 4))
    for j, m in enumerate(["NOMINAL", "SAFE", "HIGH_LOAD", "COMM"]):
        if 'mode' in df_p.columns:
            mode_oh[:, j] = (df_p['mode'] == m).astype(float)
    X_mask = np.zeros((len(df_p), n_sensors))
    X_full = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    X_t = torch.tensor(X_full, dtype=torch.float32)
    X_w = X_t.unfold(0, 32, 1).transpose(1, 2)[:-1]
    y_tg = torch.tensor(X_sens[32:], dtype=torch.float32)
    with torch.no_grad():
        preds = []
        for k in range(0, len(X_w), 512):
            preds.append(gru(X_w[k : k + 512]))
        preds = torch.cat(preds, dim=0)
    gru_res = torch.abs(preds - y_tg).numpy() / s_c
    gru_score = ewma(gru_res.max(axis=1), alpha=0.3)
    gru_alerts = persistence_alerts(gru_score, thresh_gru)
    gru_fp_day = len(episodes_from_alerts(gru_alerts)) / val_days
    
    return lim_fp_day, ridge_fp_day, gru_fp_day

noise_sigmas = [0.0, 0.5, 1.0, 2.0]
noise_rows = []
noise_func_str = "df[ch] += np.random.normal(0, sigma * std(ch), dur=30)"

print(f"{'Noise (sigma)':15} | {'Limit FP/day':15} | {'Ridge FP/day':15} | {'GRU FP/day':15} | {'Exact Noise Function'}")
print("-" * 105)

for sig in noise_sigmas:
    l_fp, r_fp, g_fp = run_noise_detector_eval(sig)
    print(f"{sig:15.1f} | {l_fp:15.3f} | {r_fp:15.3f} | {g_fp:15.3f} | {noise_func_str}")
    noise_rows.append({
        "noise_sigma": sig,
        "limit_fp_day": round(l_fp, 3),
        "ridge_fp_day": round(r_fp, 3),
        "gru_fp_day": round(g_fp, 3),
        "noise_injection_function": noise_func_str
    })

df_noise = pd.DataFrame(noise_rows)
out_noise_csv = REPORTS_DIR / "noise_sweep_detectors.csv"
df_noise.to_csv(out_noise_csv, index=False)
print(f"Saved noise sweep to {out_noise_csv}")

# PART B: Classifier Confusion Matrices
print("\n--- PART B: Classifier Confusion Matrices ---")

# Rule classifier function
def rule_classify(flagged_channels, dur, n_flagged):
    if dur <= 36 and n_flagged <= 1:
        return "noise"
    elif n_flagged <= 1:
        return "sensor_fault"
    else:
        return "subsystem_fault"

# 1. Held-out Injected Events (Test set: 48 events)
inj_cache = np.load(CACHE_DIR / "injected_residuals_cache.npz")
df_inj_gt = pd.read_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv")
valid_types = ['subsystem_fault', 'sensor_fault', 'noise']
df_events = df_inj_gt[df_inj_gt['fault_type'].isin(valid_types)].copy().reset_index(drop=True)

test_events = df_events.iloc[112:].copy().reset_index(drop=True)  # held-out 30% (48 events)
y_true_inj = []
y_pred_inj = []

for idx, ev in test_events.iterrows():
    fid   = ev['fault_id']
    ftype = ev['fault_type']
    s_row = int(ev['start_row'])
    e_row = int(ev['end_row'])
    dur   = e_row - s_row
    
    res_norm = inj_cache[fid]
    f_start_local = 32
    f_end_local   = 32 + dur
    win_res = res_norm[max(0, f_start_local - 10) : min(len(res_norm), f_end_local + 10)]
    
    flagged = []
    for c_idx in range(n_sensors):
        above = (win_res[:, c_idx] >= 1.0).astype(int)
        if len(above) >= 3 and any(above[k:k+3].sum() == 3 for k in range(len(above)-2)):
            flagged.append(sensor_cols[c_idx])
            
    pred_type = rule_classify(flagged, dur, len(flagged))
    y_true_inj.append(ftype)
    y_pred_inj.append(pred_type)

classes = ['noise', 'sensor_fault', 'subsystem_fault']
cm_inj = confusion_matrix(y_true_inj, y_pred_inj, labels=classes)
df_cm_inj = pd.DataFrame(cm_inj, index=[f"True_{c}" for c in classes], columns=[f"Pred_{c}" for c in classes])
print("\nHeld-out Injected Events Confusion Matrix (N=48):")
print(df_cm_inj)

cm_out_csv = REPORTS_DIR / "classifier_confusion_matrix.csv"
df_cm_inj.to_csv(cm_out_csv)
print(f"Saved held-out classifier confusion matrix to {cm_out_csv}")

# 2. 8 Real Faults Classification
residuals_norm = np.load(CACHE_DIR / "residuals_norm.npy")
real_records = []
y_true_real = []
y_pred_real = []

for idx, r in df_gt.iterrows():
    fid   = r['fault_id']
    ftype = r['fault_type']
    s_row = int(r['start_row'])
    e_row = int(r['end_row'])
    dur   = e_row - s_row
    
    # Ground truth mapping: F007 is sensor_fault, other 7 are subsystem_fault
    true_class = "sensor_fault" if fid == "F007" else "subsystem_fault"
    
    # Residual window around fault
    w_start = max(0, s_row - 32 - 10)
    w_end   = min(len(residuals_norm), e_row - 32 + 10)
    win_res = residuals_norm[w_start : w_end]
    
    flagged = []
    for c_idx in range(n_sensors):
        above = (win_res[:, c_idx] >= 1.0).astype(int)
        if len(above) >= 3 and any(above[k:k+3].sum() == 3 for k in range(len(above)-2)):
            flagged.append(sensor_cols[c_idx])
            
    pred_class = rule_classify(flagged, dur, len(flagged))
    match = (pred_class == true_class)
    
    y_true_real.append(true_class)
    y_pred_real.append(pred_class)
    
    real_records.append({
        "fault_id": fid,
        "fault_description": ftype,
        "true_class": true_class,
        "predicted_class": pred_class,
        "flagged_channels_count": len(flagged),
        "duration_rows": dur,
        "correct": match
    })

df_real_clf = pd.DataFrame(real_records)
print("\n8 Real Faults Classification:")
print(df_real_clf[["fault_id", "true_class", "predicted_class", "flagged_channels_count", "correct"]].to_string())

real_classes = ['sensor_fault', 'subsystem_fault']
cm_real = confusion_matrix(y_true_real, y_pred_real, labels=real_classes)
df_cm_real = pd.DataFrame(cm_real, index=[f"True_{c}" for c in real_classes], columns=[f"Pred_{c}" for c in real_classes])
print("\n8 Real Faults Confusion Matrix:")
print(df_cm_real)

out_real_csv = REPORTS_DIR / "real_faults_classification.csv"
df_real_clf.to_csv(out_real_csv, index=False)
print(f"Saved real faults classification to {out_real_csv}")
