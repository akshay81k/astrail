import os
import json
import torch
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import confusion_matrix, recall_score
import warnings
warnings.filterwarnings('ignore')

import sys
sys.path.append(os.path.abspath('src'))
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster
from spacecraft_rca.eval.fault_injector import generate_subsystem_faults, generate_sensor_faults

data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
df_imp = pd.read_csv(data_root / "data" / "synthetic_telemetry_imperfect.csv")
sig_cat = pd.read_csv(data_root / "metadata" / "signal_catalog.csv")
dep_graph = pd.read_csv(data_root / "metadata" / "dependency_graph.csv")

sensor_cols = sig_cat['signal'].tolist()
means = df_clean[sensor_cols].mean()
stds = df_clean[sensor_cols].std()

with open(data_root / "data" / "fault_events_ground_truth.csv") as f:
    import pandas as pd
    gt = pd.read_csv(f)

# Split by time
with open("artifacts/splits.json") as f:
    splits = json.load(f)
train_idx = splits['train']
ca_idx = splits['calibration']
va_idx = splits['validation_normal']

df_tr_raw = df_clean.iloc[train_idx].copy().reset_index(drop=True)
df_ca_raw = df_clean.iloc[ca_idx].copy().reset_index(drop=True)
df_va_raw = df_clean.iloc[va_idx].copy().reset_index(drop=True)

qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_tr_raw)
df_ca = qp.transform_scaler(df_ca_raw)

modes = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]

def prep_array(df):
    X_sens = df[sensor_cols].fillna(0).values
    y = X_sens.copy()
    mode_oh = np.zeros((len(df), 4))
    for i, m in enumerate(modes):
        if 'mode' in df.columns:
            mode_oh[:, i] = (df['mode'] == m).astype(float)
    missing_cols = [f"{c}_is_missing" for c in sensor_cols]
    X_mask = np.zeros((len(df), 23))
    for i, mc in enumerate(missing_cols):
        if mc in df.columns: X_mask[:, i] = df[mc].astype(float)
    X = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    return X, y

def make_windows(X, y, win_size=32):
    X_t = torch.tensor(X, dtype=torch.float32)
    X_w = X_t.unfold(0, win_size, 1).transpose(1, 2)
    y_targ = torch.tensor(y[win_size:], dtype=torch.float32)
    return X_w[:-1], y_targ

X_ca, y_ca = prep_array(df_ca)
Xw_ca, yw_ca = make_windows(X_ca, y_ca)

model = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.2)
model.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
model.eval()

def get_res_gru(Xw, yw, mask_cols=None):
    X_test = Xw.clone()
    if mask_cols:
        for c in mask_cols:
            idx = sensor_cols.index(c)
            X_test[:, :, idx] = 0.0
            X_test[:, :, 27 + idx] = 1.0
    preds = []
    batch_size = 512
    with torch.no_grad():
        for i in range(0, len(X_test), batch_size):
            preds.append(model(X_test[i:i+batch_size]))
    preds = torch.cat(preds, dim=0)
    return torch.abs(preds - yw).numpy()

res_ca = get_res_gru(Xw_ca, yw_ca)
cal_p99 = np.percentile(res_ca, 99.9, axis=0)
cal_p99 = np.maximum(cal_p99, 1e-4)

# 1. Recalibrate threshold on CALIBRATION to get <= 0.5 FA/day
score_ca = np.max(res_ca / cal_p99, axis=1)
score_ca_ewma = pd.Series(score_ca).ewm(alpha=0.3, adjust=False).mean().values

ca_days = len(df_ca) / 1440.0
target_fa = 0.5 * ca_days
thresh_cands = np.linspace(0.8, 3.0, 100)
best_thresh = 1.5
for t in thresh_cands:
    al = (pd.Series((score_ca_ewma > t).astype(float)).rolling(3).sum() == 3).values
    from scipy.ndimage import label
    episodes, _ = label(al)
    if np.max(episodes) <= target_fa:
        best_thresh = t
        break

print(f"Recalibrated threshold: {best_thresh:.3f} (for <= 0.5 FA/day on Calibration)")

def get_episodes(arr):
    from scipy.ndimage import label, find_objects
    labeled, num = label(arr)
    slices = find_objects(labeled)
    return [(s[0].start, s[0].stop) for s in slices if s is not None]

# 2. Inject faults on held-out df_va_raw
df_inj_sub, sub_gt = generate_subsystem_faults(df_va_raw, sig_cat, n=60, seed=42)
df_inj_sens, sens_gt = generate_sensor_faults(df_va_raw, sig_cat, n=60, seed=142)

df_inj = df_va_raw.copy()
# Overlay both (assuming starts don't strictly clash, or just evaluate separately. Let's do separately for pure stats).
def run_detector(df, gt_df):
    df_proc = df.copy()
    for c in sensor_cols:
        df_proc[f"{c}_is_missing"] = df_proc[c].isna()
        df_proc[c] = df_proc[c].ffill(limit=2)
    df_proc = qp.transform_scaler(df_proc)
    X, y = prep_array(df_proc)
    Xw, yw = make_windows(X, y)
    res = get_res_gru(Xw, yw)
    score = np.max(res / cal_p99, axis=1)
    score_ewma = pd.Series(score).ewm(alpha=0.3, adjust=False).mean().values
    al = (pd.Series((score_ewma > best_thresh).astype(float)).rolling(3).sum() == 3).values
    al_full = np.zeros(len(df))
    al_full[32:] = al
    return al_full, res

print("\n--- Running Subsystem Faults ---")
al_sub, res_sub = run_detector(df_inj_sub, sub_gt)
det_sub = 0
for idx, r in sub_gt.iterrows():
    if np.any(al_sub[r['start_row']:r['end_row']]): det_sub += 1
print(f"Detected {det_sub}/{len(sub_gt)} Subsystem faults.")

print("\n--- Running Sensor Faults ---")
al_sens, res_sens = run_detector(df_inj_sens, sens_gt)
det_sens = 0
for idx, r in sens_gt.iterrows():
    if np.any(al_sens[r['start_row']:r['end_row']]): det_sens += 1
print(f"Detected {det_sens}/{len(sens_gt)} Sensor faults.")

# 3. Neighbor Flagged Fraction
# Create neighbors map
neighbors = {}
for _, row in dep_graph.iterrows():
    src_sys, tgt_sys = row['source_subsystem'], row['target_subsystem']
    src_sigs = sig_cat[sig_cat['subsystem'] == src_sys]['signal'].tolist()
    tgt_sigs = sig_cat[sig_cat['subsystem'] == tgt_sys]['signal'].tolist()
    for ss in src_sigs:
        neighbors.setdefault(ss, set()).update(tgt_sigs)
    for ts in tgt_sigs:
        neighbors.setdefault(ts, set()).update(src_sigs)

def get_neighbor_fraction(alerts_matrix, start, end, flagged_ch):
    fracs = []
    win_start, win_end = max(0, start-10), end+10
    if win_end > len(alerts_matrix): win_end = len(alerts_matrix)
    for ch in flagged_ch:
        neighs = neighbors.get(ch, set())
        if not neighs: 
            fracs.append(0.0)
            continue
        neigh_idx = [sensor_cols.index(n) for n in neighs if n in sensor_cols]
        # did any neighbor flag in this window?
        n_flagged = 0
        for n_i in neigh_idx:
            if np.any(alerts_matrix[win_start:win_end, n_i]):
                n_flagged += 1
        fracs.append(n_flagged / len(neigh_idx))
    return np.mean(fracs) if fracs else 0.0

# 5. Noise table and NaN checks
print("\n--- 5. Noise Table ---")
for nl in [0.0, 0.5, 1.0, 2.0]:
    df_n = df_va_raw.copy()
    if nl > 0:
        for c in sensor_cols:
            df_n[c] += np.random.normal(0, nl * stds[c], len(df_n))
            
    df_n_proc = df_n.copy()
    for c in sensor_cols:
        df_n_proc[f"{c}_is_missing"] = df_n_proc[c].isna()
        df_n_proc[c] = df_n_proc[c].ffill(limit=2)
    df_n_proc = qp.transform_scaler(df_n_proc)
    
    X_n, y_n = prep_array(df_n_proc)
    nan_in = np.isnan(X_n).sum()
    Xw_n, yw_n = make_windows(X_n, y_n)
    res_n = get_res_gru(Xw_n, yw_n)
    nan_res = np.isnan(res_n).sum()
    
    score_n = np.max(res_n / cal_p99, axis=1)
    score_n = pd.Series(score_n).ewm(alpha=0.3, adjust=False).mean().values
    al_n = (pd.Series((score_n > best_thresh).astype(float)).rolling(3).sum() == 3).values
    
    al_full = np.zeros(len(df_n))
    al_full[32:] = al_n
    
    eps = get_episodes(al_full)
    days = len(df_n) / 1440.0
    print(f"Noise {nl}σ: {len(eps)/days:.2f} FA/day. (NaNs in={nan_in}, NaNs res={nan_res})")
