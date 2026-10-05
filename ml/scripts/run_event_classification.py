import os
import json
import torch
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.linear_model import Ridge
import sys
from scipy.ndimage import maximum_filter1d
from sklearn.metrics import confusion_matrix

sys.path.append(os.path.abspath('src'))
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster
from spacecraft_rca.classify.fault_type import NeighborPredictor

data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
df_imp = pd.read_csv(data_root / "data" / "synthetic_telemetry_imperfect.csv")
faults = pd.read_csv(data_root / "data" / "fault_events_ground_truth.csv")
dep_graph = pd.read_csv(data_root / "metadata" / "dependency_graph.csv")
sig_cat = pd.read_csv(data_root / "metadata" / "signal_catalog.csv")
sensor_cols = [c for c in sig_cat['signal'].values]

with open("artifacts/splits.json", "r") as f:
    splits = json.load(f)

train_idx = splits['train']
ca_idx = splits['calibration']
va_idx = splits['validation-normal']

df_tr_raw = df_clean.iloc[train_idx].copy()
df_ca_raw = df_clean.iloc[ca_idx].copy()
df_va_raw = df_clean.iloc[va_idx].copy()

qp = TelemetryQualityProcessor(mode_method='none')
qp.fit(df_tr_raw)
df_ca = qp.transform(df_ca_raw)
df_imp_proc = qp.transform(df_imp)

def create_windows(df, win_size=32):
    X = df[sensor_cols].values
    X_t = torch.tensor(X, dtype=torch.float32)
    X_w = X_t.unfold(0, win_size, 1).transpose(1, 2)
    y_targ = X_t[win_size:]
    return X_w[:-1], y_targ

Xw_ca, yw_ca = create_windows(df_ca)
Xw_imp, yw_imp = create_windows(df_imp_proc)

model = GRUForecaster(input_dim=len(sensor_cols)*2, hidden_dim=64)
model.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
model.eval()

def get_res_gru(Xw, yw):
    X_test = Xw.clone()
    preds = []
    with torch.no_grad():
        for i in range(0, len(X_test), 512):
            preds.append(model(X_test[i:i+512]))
    preds = torch.cat(preds, dim=0)
    return torch.abs(preds - yw).numpy()

print("Running GRU Inference...")
res_ca = get_res_gru(Xw_ca, yw_ca)
res_imp = get_res_gru(Xw_imp, yw_imp)

cal_p99 = np.percentile(res_ca, 99, axis=0)
cal_p99[cal_p99 == 0] = 1e-6
rc_imp = res_imp / cal_p99
score_imp = np.max(rc_imp, axis=1)
score_imp = pd.Series(score_imp).ewm(alpha=0.3, adjust=False).mean().values
threshold = np.percentile(pd.Series(np.max(res_ca / cal_p99, axis=1)).ewm(alpha=0.3, adjust=False).mean().values, 99.5)

alerts_imp = (score_imp > threshold).astype(float)
alerts_imp = maximum_filter1d(alerts_imp, size=3) == 1

alerts_full = np.zeros(len(df_imp))
alerts_full[32:] = alerts_imp

# 1. Limit checking baseline
print("\n--- 1. Limit Checking Baseline ---")
df_tr = df_clean.iloc[train_idx]
means = df_tr[sensor_cols].mean()
stds = df_tr[sensor_cols].std().replace(0, 1e-6)
limit_alarms = (np.abs(df_imp[sensor_cols] - means) > 4 * stds).any(axis=1).values

limit_alarms_va = (np.abs(df_va_raw[sensor_cols] - means) > 4 * stds).any(axis=1).values
print(f"Limit false alarm rows on val-normal: {np.sum(limit_alarms_va)}")

for _, f in faults.iterrows():
    s = f['start_row']
    e = f['end_row']
    lim_idx = np.where(limit_alarms[s:e])[0]
    lim_row = s + lim_idx[0] if len(lim_idx) > 0 else -1
    
    gru_idx = np.where(alerts_full[s:e])[0]
    gru_row = s + gru_idx[0] if len(gru_idx) > 0 else -1
    
    if lim_row != -1 and gru_row != -1:
        lead = lim_row - gru_row
    else:
        lead = "N/A"
    print(f"Fault {f['fault_id']}: Limit Row = {lim_row}, GRU Row = {gru_row}, Lead Time (Limit - GRU) = {lead}")


# 2 & 3. Event Table and Labels
print("\n--- 2 & 3. Event Table and Labels ---")
np_pred = NeighborPredictor(dep_graph, sig_cat)
np_pred.fit(df_tr)

def get_episodes(arr):
    diff = np.diff(np.concatenate(([0], arr, [0])))
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    return list(zip(starts, ends))

episodes = get_episodes(alerts_full)
event_features = []

gt_mask = np.zeros(len(df_imp), dtype=bool)
for _, f in faults.iterrows():
    gt_mask[f['start_row']:f['end_row']] = True

df_inj = df_imp.copy()
np.random.seed(42)
inj_starts = []
normal_idx = np.where(~gt_mask)[0]
normal_idx = normal_idx[32:-300]
for _ in range(50):
    start = np.random.choice(normal_idx)
    ch = np.random.choice(sensor_cols)
    df_inj.loc[start:start+10, ch] += 6 * stds[ch]
    inj_starts.append((start, start+10, ch))

Xw_inj, yw_inj = create_windows(qp.transform(df_inj))
res_inj = get_res_gru(Xw_inj, yw_inj)
rc_inj = res_inj / cal_p99
score_inj = np.max(rc_inj, axis=1)
score_inj = pd.Series(score_inj).ewm(alpha=0.3, adjust=False).mean().values
alerts_inj = maximum_filter1d((score_inj > threshold).astype(float), size=3) == 1
alerts_full_inj = np.zeros(len(df_inj))
alerts_full_inj[32:] = alerts_inj
inj_episodes = get_episodes(alerts_full_inj)

for s, e in episodes:
    is_gt = np.any(gt_mask[s:e])
    if is_gt: label = "subsystem_fault"
    else: label = "noise"
    
    ep_rc = rc_imp[max(0, s-32):e-32] if s >= 32 else rc_imp[0:1]
    if len(ep_rc) == 0: ep_rc = np.zeros((1, 23))
    max_rc = np.max(ep_rc, axis=0)
    flagged = [sensor_cols[i] for i in np.where(max_rc > 1.0)[0]]
    n_flag = len(flagged)
    
    agreements = []
    for ch in flagged:
        agr = np_pred.get_agreement(df_imp.iloc[s:e], ch)
        agreements.append(agr)
    min_agr = min(agreements) if agreements else 0.0
    
    event_features.append({
        'n_channels_flagged': n_flag,
        'duration': e - s,
        'max_residual': np.max(max_rc),
        'neighbor_agreement': min_agr,
        'label': label
    })

for s, e in inj_episodes:
    is_inj = any(i_s <= e and i_e >= s for i_s, i_e, _ in inj_starts)
    if is_inj and not np.any(gt_mask[s:e]):
        ep_rc = rc_inj[max(0, s-32):e-32] if s >= 32 else rc_inj[0:1]
        if len(ep_rc) == 0: ep_rc = np.zeros((1, 23))
        max_rc = np.max(ep_rc, axis=0)
        flagged = [sensor_cols[i] for i in np.where(max_rc > 1.0)[0]]
        n_flag = len(flagged)
        
        agreements = []
        for ch in flagged:
            agr = np_pred.get_agreement(df_inj.iloc[s:e], ch)
            agreements.append(agr)
        min_agr = min(agreements) if agreements else 0.0
        
        event_features.append({
            'n_channels_flagged': n_flag,
            'duration': e - s,
            'max_residual': np.max(max_rc),
            'neighbor_agreement': min_agr,
            'label': "sensor_fault"
        })

df_events = pd.DataFrame(event_features)
print(df_events['label'].value_counts())

for label, count in df_events['label'].value_counts().items():
    if count < 20:
        print(f"FLAG: Class {label} has fewer than 20 examples ({count}).")

# 4. Classifier
print("\n--- 4. Classifier ---")
def rule_based(row):
    if row['duration'] <= 3 and row['n_channels_flagged'] >= 3 and row['max_residual'] > 3.0:
        return "noise", "Rule 1"
    if row['n_channels_flagged'] == 1 and row['neighbor_agreement'] < 0.2:
        return "sensor_fault", "Rule 2"
    return None, ""

df_events['rule_pred'] = df_events.apply(lambda r: rule_based(r)[0], axis=1)
unclassified = df_events[df_events['rule_pred'].isnull()]

dt = DecisionTreeClassifier(max_depth=4, random_state=42)
features = ['n_channels_flagged', 'duration', 'max_residual', 'neighbor_agreement']
if len(unclassified) > 0:
    dt.fit(unclassified[features], unclassified['label'])
    print("Decision Tree Rules:")
    print(export_text(dt, feature_names=features))
    
    preds = dt.predict(df_events[features])
    df_events['final_pred'] = df_events['rule_pred'].fillna(pd.Series(preds))
else:
    df_events['final_pred'] = df_events['rule_pred']

print("Confusion Matrix (True vs Pred):")
print("Labels: subsystem_fault, sensor_fault, noise")
print(confusion_matrix(df_events['label'], df_events['final_pred'], labels=["subsystem_fault", "sensor_fault", "noise"]))

print("\nExample 3 event classifications:")
print(df_events[['label', 'final_pred', 'n_channels_flagged', 'duration', 'neighbor_agreement']].head(3))

# 5. Headline Table
print("\n--- 5. Headline Table ---")
limit_far = np.sum(limit_alarms[~gt_mask])
gru_ep_far = len(df_events[df_events['label'] == 'noise'])
gru_clf_ep_far = len(df_events[(df_events['label'] == 'noise') & (df_events['final_pred'] != 'noise')])

print(f"Limit Checker FA: {limit_far} rows")
print(f"GRU Alone FA Episodes: {gru_ep_far}")
print(f"GRU + Classifier FA Episodes: {gru_clf_ep_far}")
