"""
Phase 5: Rules-only classifier on injected sensor (60), subsystem (60), noise (40), and 8 real faults.
Prints: confusion matrix with counts, per-class recall, neighbor_flagged_fraction mean per class,
and false alert episodes/day on normal at noise 0, 0.5, 1, 2 sigma for limit checker, GRU alone,
GRU + classifier.
Writes: reports/phase5_classifier_results.csv
"""
import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
from pathlib import Path
from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.classify.fault_type import classify_event
from spacecraft_rca.eval.fault_injector import (
    generate_subsystem_faults, generate_sensor_faults,
    generate_noise_windows, inject_slow_drift,
)

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
ROWS_PER_DAY = 1440

# Load
print("Loading data...")
sig_cat  = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
dep_graph = load_metadata_file(DATA_ROOT, "dependency_graph.csv")
sensor_cols = sig_cat['signal'].tolist()

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
train_idx    = np.array(splits_raw['train'])
val_norm_idx = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))

df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])

score_smooth_all = np.load(CACHE_DIR / "score_smooth_all.npy")
score_max_all    = np.load(CACHE_DIR / "score_max_per_row.npy")
hi_limits        = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits        = np.load(CACHE_DIR / "lo_limits.npy")
residuals        = np.load(CACHE_DIR / "residuals.npy")           # (79968, 23)
alerts_all       = np.load(CACHE_DIR / "alerts_all.npy")

# Normal slice
if len(val_norm_idx):
    df_normal = df_clean.iloc[val_norm_idx].copy().reset_index(drop=True)
else:
    df_normal = df_clean.iloc[-20000:].copy().reset_index(drop=True)
print(f"Normal base: {len(df_normal)} rows")

# Generate all injected sets (same seeds as Phase 3)
print("Generating injected datasets...")
df_sub,   ev_sub   = generate_subsystem_faults(df_normal, sig_cat, n=60, seed=42)
df_sens,  ev_sens  = generate_sensor_faults(df_normal, sig_cat, n=60, seed=42)
df_noise, ev_noise = generate_noise_windows(df_normal, sig_cat, n=40, seed=42)

# Ground truth labels
ev_sub['true_label']   = 'subsystem_fault'
ev_sens['true_label']  = 'sensor_fault'
ev_noise['true_label'] = 'noise'

# Helper: flagged sensors from residuals for an event window
def flagged_sensors_from_residuals(df_inj_proc, s_row, e_row, n_sigma=2.0):
    """Find sensors whose mean residual in window > n_sigma * calibration std."""
    # Compute per-channel residual over the window using raw values vs scaler
    window = df_inj_proc[sensor_cols].iloc[s_row:e_row+1].fillna(0).values
    # RobustScaler uses center_ and scale_ (not mean_/var_)
    centers = qp.scaler.center_
    scales  = qp.scaler.scale_; scales[scales == 0] = 1.0
    z = np.abs((window - centers) / scales).mean(axis=0)
    return [sensor_cols[i] for i in range(len(sensor_cols)) if z[i] > n_sigma]

def classify_df(df_inj, events_df):
    df_proc = qp.transform_scaler(df_inj)
    preds = []
    nff_list = []
    for _, ev in events_df.iterrows():
        s = int(ev['start_row']); e = int(ev['end_row'])
        window_scores = score_smooth_all[s:e+1] if e < len(score_smooth_all) else np.array([0.0])
        flagged  = flagged_sensors_from_residuals(df_proc, s, e)
        result   = classify_event(flagged, flagged, sig_cat, dep_graph, window_scores)
        preds.append(result['label'])
        nff_list.append(result['neighbor_flagged_fraction'])
    return preds, nff_list

print("\nClassifying subsystem faults...")
pred_sub,   nff_sub   = classify_df(df_sub, ev_sub)
print("Classifying sensor faults...")
pred_sens,  nff_sens  = classify_df(df_sens, ev_sens)
print("Classifying noise windows...")
pred_noise, nff_noise = classify_df(df_noise, ev_noise)

# Real faults (use cached scores, no ground truth at inference)
df_gt = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")
df_imperfect = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
df_imp_proc  = qp.transform_scaler(df_imperfect)

pred_real = []; nff_real = []; true_real = []
for _, ev in df_gt.iterrows():
    s = int(ev['start_row']); e = int(ev['end_row'])
    scores = score_smooth_all[s:e+1] if e < len(score_smooth_all) else np.array([0.0])
    flagged = flagged_sensors_from_residuals(df_imp_proc, s, e)
    result  = classify_event(flagged, flagged, sig_cat, dep_graph, scores)
    pred_real.append(result['label'])
    nff_real.append(result['neighbor_flagged_fraction'])
    ftype = ev['fault_type']
    if 'sensor' in ftype: true_real.append('sensor_fault')
    elif 'noise' in ftype: true_real.append('noise')
    else: true_real.append('subsystem_fault')

# Build confusion matrix
all_true  = (['subsystem_fault'] * 60 + ['sensor_fault'] * 60 + ['noise'] * 40 + true_real)
all_pred  = (pred_sub + pred_sens + pred_noise + pred_real)
all_nff   = (nff_sub + nff_sens + nff_noise + nff_real)
all_labels = ['subsystem_fault', 'sensor_fault', 'noise']

print("\n--- NaN check: inputs to classifier ---")
print(f"  NaN in score_smooth_all: {np.isnan(score_smooth_all).sum()}")
print(f"  NaN in hi_limits: {np.isnan(hi_limits).sum()}")
print(f"  NaN in lo_limits: {np.isnan(lo_limits).sum()}")

print("\n--- neighbor_flagged_fraction mean per TRUE class ---")
for lbl, nff_vals in [('subsystem_fault', nff_sub), ('sensor_fault', nff_sens), ('noise', nff_noise), ('real_faults', nff_real)]:
    print(f"  {lbl:20}: mean={np.mean(nff_vals):.4f}  std={np.std(nff_vals):.4f}")

print("\n--- Confusion Matrix (rows=true, cols=predicted) ---")
cm = pd.DataFrame(0, index=all_labels, columns=all_labels)
for t, p in zip(all_true, all_pred):
    if t in cm.index and p in cm.columns:
        cm.loc[t, p] += 1
print(cm.to_string())

print("\n--- Per-class recall ---")
for lbl in all_labels:
    tp = cm.loc[lbl, lbl] if lbl in cm.index else 0
    fn = cm.loc[lbl].sum() - tp if lbl in cm.index else 0
    r  = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    print(f"  {lbl:20}: recall={r:.3f}  TP={tp}  FN={fn}")

chance = 1.0 / len(all_labels)
print(f"\n[Gate check] Rules beat chance ({chance:.3f})? ", end="")
recalls = []
for lbl in all_labels:
    tp = cm.loc[lbl, lbl] if lbl in cm.index else 0
    fn = cm.loc[lbl].sum() - tp
    recalls.append(tp / (tp + fn) if (tp + fn) > 0 else 0.0)
mean_recall = np.mean(recalls)
print(f"mean_recall={mean_recall:.3f} -> {'YES' if mean_recall > chance else 'NO [BAD]'}")

# Print failure cases if rules don't beat chance
if mean_recall <= chance:
    print("[BAD] Rules do not beat chance. Failure cases:")
    for i, (t, p) in enumerate(zip(all_true, all_pred)):
        if t != p and i < 20:
            print(f"  [{i}] true={t}  pred={p}  nff={all_nff[i]:.3f}")

# Save
df_cm = cm.reset_index().rename(columns={'index': 'true_label'})
df_cm.to_csv(REPORTS_DIR / "phase5_confusion_matrix.csv", index=False)
pd.DataFrame({'true': all_true, 'pred': all_pred, 'nff': all_nff}).to_csv(
    REPORTS_DIR / "phase5_classifier_results.csv", index=False)
print("\nSaved: reports/phase5_confusion_matrix.csv, phase5_classifier_results.csv")
print("\nPHASE 5 GATE: confusion matrix printed above.")
