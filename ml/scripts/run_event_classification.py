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
va_idx = splits['validation_normal']

df_tr_raw = df_clean.iloc[train_idx].copy()
df_ca_raw = df_clean.iloc[ca_idx].copy()
df_va_raw = df_clean.iloc[va_idx].copy()

qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_tr_raw)
df_ca = qp.transform_scaler(df_ca_raw)

df_imp_proc = df_imp.copy()
for c in sensor_cols:
    df_imp_proc[f"{c}_is_missing"] = df_imp_proc[c].isna()
    df_imp_proc[c] = df_imp_proc[c].ffill(limit=2)
df_imp_proc = qp.transform_scaler(df_imp_proc)

modes = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]

def prep_array(df):
    X_sens = df[sensor_cols].fillna(0).values
    y = X_sens.copy()
    mode_oh = np.zeros((len(df), 4))
    for i, m in enumerate(modes):
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
X_imp, y_imp = prep_array(df_imp_proc)
Xw_imp, yw_imp = make_windows(X_imp, y_imp)

model = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.2)
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

alerts_imp = (score_imp > 1.1342).astype(float)
alerts_imp = (pd.Series(alerts_imp).rolling(3).sum() == 3).values

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
    
    # Find gru alert overlapping [s-30, e]
    gru_idx = np.where(alerts_full[max(0, s-30):e])[0]
    if len(gru_idx) > 0:
        gru_row = max(0, s-30) + gru_idx[0]
        gru_delay = gru_row - s
    else:
        gru_row = -1
        gru_delay = "N/A"
        
    if lim_row != -1 and gru_row != -1:
        lead = lim_row - gru_row
    else:
        lead = "N/A"
    print(f"Fault {f['fault_id']}: Limit Row = {lim_row}, GRU Row = {gru_row} (Delay: {gru_delay}), Lead Time (Limit - GRU) = {lead}")


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

df_inj_proc = df_inj.copy()
for c in sensor_cols:
    df_inj_proc[f"{c}_is_missing"] = df_inj_proc[c].isna()
    df_inj_proc[c] = df_inj_proc[c].ffill(limit=2)
df_inj_proc = qp.transform_scaler(df_inj_proc)
X_inj, y_inj = prep_array(df_inj_proc)
Xw_inj, yw_inj = make_windows(X_inj, y_inj)
res_inj = get_res_gru(Xw_inj, yw_inj)
rc_inj = res_inj / cal_p99
score_inj = np.max(rc_inj, axis=1)
score_inj = pd.Series(score_inj).ewm(alpha=0.3, adjust=False).mean().values
alerts_inj = (pd.Series((score_inj > 1.1342).astype(float)).rolling(3).sum() == 3).values
alerts_full_inj = np.zeros(len(df_inj))
alerts_full_inj[32:] = alerts_inj
inj_episodes = get_episodes(alerts_full_inj)

# Custom Neighbor Agreement
train_vars = df_tr[sensor_cols].var().to_dict()

def get_custom_agreement(df_event, ch):
    if ch not in np_pred.models or not np_pred.neighbors[ch]:
        return 0.0
    model = np_pred.models[ch]
    X = df_event[np_pred.neighbors[ch]].fillna(0).values
    y_true = df_event[ch].fillna(0).values
    if len(y_true) == 0: return 0.0
    y_pred = model.predict(X)
    mse = np.mean((y_true - y_pred)**2)
    var = max(train_vars.get(ch, 1e-6), 1e-6)
    return max(0.0, 1.0 - (mse / var))

episodes = get_episodes(alerts_full)
event_features = []
for s, e in episodes:
    is_gt = np.any(gt_mask[s:e])
    if is_gt: label = "subsystem_fault"
    else: label = "noise"
    ep_rc = rc_imp[max(0, s-32):e-32] if s >= 32 else rc_imp[0:1]
    if len(ep_rc) == 0: ep_rc = np.zeros((1, 23))
    max_rc = np.max(ep_rc, axis=0)
    flagged = [sensor_cols[i] for i in np.where(max_rc > 1.0)[0]]
    n_flag = len(flagged)
    
    agreements = [get_custom_agreement(df_imp.iloc[s:e], ch) for ch in flagged]
    min_agr = min(agreements) if agreements else 0.0
    event_features.append({
        'start': s,
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
        
        agreements = [get_custom_agreement(df_inj.iloc[s:e], ch) for ch in flagged]
        min_agr = min(agreements) if agreements else 0.0
        event_features.append({
            'start': s,
            'n_channels_flagged': n_flag,
            'duration': e - s,
            'max_residual': np.max(max_rc),
            'neighbor_agreement': min_agr,
            'label': "sensor_fault"
        })

df_events = pd.DataFrame(event_features)

print("\n--- 4. Classifier ---")
print("Mean Agreement:")
print(df_events.groupby('label')['neighbor_agreement'].mean())

def rule_based(row):
    if row['n_channels_flagged'] == 1 and row['duration'] <= 3 and row['neighbor_agreement'] > 0.8:
        return "noise", "Rule 1"
    if row['n_channels_flagged'] == 1 and row['duration'] > 3 and row['neighbor_agreement'] < 0.2:
        return "sensor_fault", "Rule 2"
    if row['n_channels_flagged'] > 1:
        return "subsystem_fault", "Rule 3"
    return None, ""

df_events['rule_pred'] = df_events.apply(lambda r: rule_based(r)[0], axis=1)
rule_acc = (df_events['rule_pred'] == df_events['label']).mean()
print(f"Rule Accuracy (before tree): {rule_acc:.2%}")

# Train-test split by time (episode start)
df_events = df_events.sort_values('start').reset_index(drop=True)
split_idx = int(len(df_events) * 0.6)
train_df = df_events.iloc[:split_idx]
test_df = df_events.iloc[split_idx:]

features = ['n_channels_flagged', 'duration', 'max_residual', 'neighbor_agreement']
dt = DecisionTreeClassifier(max_depth=3, min_samples_leaf=5, random_state=42)
dt.fit(train_df[features], train_df['label'])

preds = dt.predict(test_df[features])
test_df = test_df.copy()
test_df['final_pred'] = preds
df_events.loc[test_df.index, 'final_pred'] = preds
df_events['final_pred'] = df_events['final_pred'].fillna(df_events['rule_pred'])

print("Decision Tree Rules:")
print(export_text(dt, feature_names=features))

from sklearn.metrics import confusion_matrix, recall_score, classification_report
cm = confusion_matrix(test_df['label'], test_df['final_pred'], labels=["subsystem_fault", "sensor_fault", "noise"])
print("Confusion Matrix on Test Set:")
print(cm)
print("\nClassification Report (Accuracy, Precision, Recall, F1):")
print(classification_report(test_df['label'], test_df['final_pred'], labels=["subsystem_fault", "sensor_fault", "noise"], zero_division=0))

for label, count in df_events['label'].value_counts().items():
    if count < 20: print(f"FLAG: Class {label} has fewer than 20 examples ({count}).")

# 5. Headline table: 3 noise levels
print("\n--- 5. Headline Table ---")
noise_levels = [0.5, 1.0, 2.0]
results = []
for nl in noise_levels:
    df_n = df_va_raw.copy()
    for c in sensor_cols:
        df_n[c] += np.random.normal(0, nl * stds[c], len(df_n))
        
    df_n_proc = qp.process(df_n)
    limit_far = np.sum((np.abs(df_n[sensor_cols] - means) > 4 * stds).any(axis=1))
    
    X_n, y_n = prep_array(df_n_proc)
    Xw_n, yw_n = make_windows(X_n, y_n)
    res_n = get_res_gru(Xw_n, yw_n)
    score_n = pd.Series(np.max(res_n / cal_p99, axis=1)).ewm(alpha=0.3, adjust=False).mean().values
    al_n = (pd.Series((score_n > 1.1342).astype(float)).rolling(3).sum() == 3).values
    al_full = np.zeros(len(df_n_proc))
    al_full[32:] = al_n
    ep_n = get_episodes(al_full)
    
    gru_fa = len(ep_n)
    
    clf_fa = 0
    for s, e in ep_n:
        ep_rc = res_n[max(0, s-32):e-32] / cal_p99 if s >= 32 else (res_n[0:1] / cal_p99)
        if len(ep_rc) == 0: ep_rc = np.zeros((1, 23))
        max_rc = np.max(ep_rc, axis=0)
        flagged = [sensor_cols[i] for i in np.where(max_rc > 1.0)[0]]
        agr = [get_custom_agreement(df_n.iloc[s:e], c) for c in flagged]
        
        feat = pd.DataFrame([{
            'n_channels_flagged': len(flagged),
            'duration': e - s,
            'max_residual': np.max(max_rc),
            'neighbor_agreement': min(agr) if agr else 0.0
        }])
        if dt.predict(feat)[0] != 'noise':
            clf_fa += 1
            
    days = len(df_n) / 1440.0
    results.append({
        'Noise': nl,
        'Limit Check FA/day': limit_far / days,
        'GRU Alone FA/day': gru_fa / days,
        'GRU+Clf FA/day': clf_fa / days
    })

print(pd.DataFrame(results).to_string(index=False))
