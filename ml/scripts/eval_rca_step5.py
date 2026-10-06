import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
from pathlib import Path
from scipy.special import softmax
from spacecraft_rca.data.loaders import load_metadata_file

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
CAL_OFFSET   = 32

print("=== STEP 5: Root Cause Engine v2 Evaluation & Temperature Calibration ===")

# 1. Load metadata
sig_cat   = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
dep_graph = load_metadata_file(DATA_ROOT, "dependency_graph.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)

subsystems = sorted(sig_cat['subsystem'].unique().tolist())
sig_to_sub = dict(zip(sig_cat['signal'], sig_cat['subsystem']))
sub_to_sigs = {sub: sig_cat[sig_cat['subsystem'] == sub]['signal'].tolist() for sub in subsystems}

# 2. Load caches
residuals_norm = np.load(CACHE_DIR / "residuals_norm.npy")  # (79968, 23)
inj_cache      = np.load(CACHE_DIR / "injected_residuals_cache.npz")

df_gt     = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")
df_inj_gt = pd.read_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv")

# Load alert rows from Step 3 for 8 real faults
df_p2 = pd.read_csv(REPORTS_DIR / "phase2_8fault_table.csv")
alert_dict_real = dict(zip(df_p2['fault_id'], df_p2['alert_row']))

# Helper: Channel onset in window
def find_channel_onsets(res_window, thresh=1.0, persist=3):
    """Return dict of {channel_idx: onset_idx} where signal is >= thresh for >= persist consecutive rows."""
    onsets = {}
    for c in range(res_window.shape[1]):
        sig_col = res_window[:, c]
        above = (sig_col >= thresh).astype(int)
        for i in range(len(above) - persist + 1):
            if above[i : i + persist].sum() == persist:
                onsets[c] = i
                break
    return onsets

# 3. Engines Definition
def rank_candidates_v2(res_window, onset_bonus_wt=1.5):
    """
    Engine v2:
    - Per-subsystem score = sum of top-2 channel peaks in window
    - Plus onset-earliness bonus (NO DAG accumulation favoring POWER)
    Returns dict {subsystem: score}.
    """
    scores = {}
    onsets = find_channel_onsets(res_window, thresh=1.0, persist=3)
    
    # Earliest onset overall
    min_onset = min(onsets.values()) if onsets else 0
    w_len = len(res_window)
    
    for sub in subsystems:
        sigs = sub_to_sigs[sub]
        ch_indices = [sensor_cols.index(s) for s in sigs if s in sensor_cols]
        if not ch_indices:
            scores[sub] = 0.0
            continue
            
        # Peak of each channel in subsystem
        ch_peaks = [float(res_window[:, c].max()) for c in ch_indices]
        # Sum of top-2 channel peaks
        ch_peaks.sort(reverse=True)
        top2_sum = sum(ch_peaks[:2])
        
        # Onset earliness bonus for this subsystem
        sub_onsets = [onsets[c] for c in ch_indices if c in onsets]
        if sub_onsets:
            sub_first_onset = min(sub_onsets)
            # Bonus decreases with delay from first onset
            earliness = max(0.0, 1.0 - (sub_first_onset - min_onset) / (w_len + 1e-6))
            bonus = onset_bonus_wt * earliness
        else:
            bonus = 0.0
            
        scores[sub] = top2_sum + bonus
    return scores

def rank_baseline_b_largest_residual(res_window):
    """Baseline (b): Subsystem with the single largest residual in window."""
    scores = {sub: 0.0 for sub in subsystems}
    for sub in subsystems:
        ch_indices = [sensor_cols.index(s) for s in sub_to_sigs[sub] if s in sensor_cols]
        if ch_indices:
            scores[sub] = float(res_window[:, ch_indices].max())
    return scores

def rank_baseline_c_earliest_onset(res_window):
    """Baseline (c): Subsystem with the earliest onset in window."""
    onsets = find_channel_onsets(res_window, thresh=1.0, persist=3)
    scores = {sub: 0.0 for sub in subsystems}
    w_len = len(res_window)
    for sub in subsystems:
        ch_indices = [sensor_cols.index(s) for s in sub_to_sigs[sub] if s in sensor_cols]
        sub_onsets = [onsets[c] for c in ch_indices if c in onsets]
        if sub_onsets:
            earliest = min(sub_onsets)
            scores[sub] = float(w_len - earliest)  # earlier = higher score
        else:
            scores[sub] = 0.0
    return scores

# 4. Extract windows for 8 Real Faults
real_eval_items = []
for _, row in df_gt.iterrows():
    fid   = row['fault_id']
    true_s = row['source_subsystem']
    s_row = int(row['start_row'])
    e_row = int(row['end_row'])
    
    # Alert row from detector, fallback to s_row if missing
    al_row = alert_dict_real.get(fid)
    if pd.isna(al_row) or al_row is None:
        al_row = s_row
    else:
        al_row = int(al_row)
        
    # Window [alert - 10, alert + 60] in cache coordinates
    w_start = max(0, al_row - 10 - CAL_OFFSET)
    w_end   = min(len(residuals_norm), al_row + 60 - CAL_OFFSET)
    
    window_res = residuals_norm[w_start : w_end]
    real_eval_items.append({
        'fault_id': fid, 'true_subsystem': true_s, 'window_res': window_res, 'start_row': s_row
    })

# Extract windows for Injected Subsystem & Sensor Faults
inj_eval_items = []
df_inj_eval = df_inj_gt[df_inj_gt['fault_type'].isin(['subsystem_fault', 'sensor_fault'])].copy()

for _, row in df_inj_eval.iterrows():
    fid    = row['fault_id']
    true_s = row['source_subsystem']
    s_row  = int(row['start_row'])
    e_row  = int(row['end_row'])
    
    res_norm = inj_cache[fid]
    # Local fault starts at row 32
    # Alert is typically at row 32 to 35
    w_start = max(0, 32 - 10)
    w_end   = min(len(res_norm), 32 + 60)
    window_res = res_norm[w_start : w_end]
    
    inj_eval_items.append({
        'fault_id': fid, 'true_subsystem': true_s, 'window_res': window_res, 'start_row': s_row
    })

# 5. Bootstrap CI Evaluation Function
def evaluate_method(method_func, items, n_boot=2000, seed=42):
    top1_list = []
    top3_list = []
    predictions = []
    
    for item in items:
        scores = method_func(item['window_res'])
        # Sort subsystems by score descending
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top1 = ranked[0][0]
        top3 = [r[0] for r in ranked[:3]]
        
        is_top1 = int(item['true_subsystem'] == top1)
        is_top3 = int(item['true_subsystem'] in top3)
        top1_list.append(is_top1)
        top3_list.append(is_top3)
        predictions.append({'fault_id': item['fault_id'], 'true': item['true_subsystem'], 'top1': top1, 'top3': top3, 'ranked': ranked})
        
    top1_arr = np.array(top1_list)
    top3_arr = np.array(top3_list)
    
    mean_top1 = float(top1_arr.mean())
    mean_top3 = float(top3_arr.mean())
    
    # Bootstrap CIs
    np.random.seed(seed)
    n = len(top1_arr)
    boot_top1 = [top1_arr[np.random.choice(n, size=n, replace=True)].mean() for _ in range(n_boot)]
    boot_top3 = [top3_arr[np.random.choice(n, size=n, replace=True)].mean() for _ in range(n_boot)]
    
    ci_top1 = (float(np.percentile(boot_top1, 2.5)), float(np.percentile(boot_top1, 97.5)))
    ci_top3 = (float(np.percentile(boot_top3, 2.5)), float(np.percentile(boot_top3, 97.5)))
    
    return mean_top1, ci_top1, mean_top3, ci_top3, predictions

print("\n" + "=" * 90)
print("EVALUATION OF ROOT CAUSE BASELINES & ENGINE V2")
print(f"{'Dataset':15} | {'Method':28} | {'Top-1 Accuracy (95% CI)':25} | {'Top-3 Accuracy (95% CI)':25}")
print("-" * 90)

methods = {
    "(a) Chance Baseline": lambda w: {s: np.random.rand() for s in subsystems},
    "(b) Largest-Residual": rank_baseline_b_largest_residual,
    "(c) Earliest-Onset": rank_baseline_c_earliest_onset,
    "(d) Engine v2 (Peak+Onset)": rank_candidates_v2
}

results_comparison = []

for d_name, d_items in [("8 Real Faults", real_eval_items), ("120 Injected Faults", inj_eval_items)]:
    for m_name, m_func in methods.items():
        t1, ci1, t3, ci3, preds = evaluate_method(m_func, d_items)
        t1_str = f"{t1*100:5.1f}% [{ci1[0]*100:4.1f}%, {ci1[1]*100:4.1f}%]"
        t3_str = f"{t3*100:5.1f}% [{ci3[0]*100:4.1f}%, {ci3[1]*100:4.1f}%]"
        print(f"{d_name:15} | {m_name:28} | {t1_str:25} | {t3_str:25}")
        results_comparison.append({
            'dataset': d_name, 'method': m_name,
            'top1': t1, 'top1_ci_lo': ci1[0], 'top1_ci_hi': ci1[1],
            'top3': t3, 'top3_ci_lo': ci3[0], 'top3_ci_hi': ci3[1]
        })

# 6. Detailed 8-Fault Predictions for Engine v2
print("\n" + "=" * 90)
print("8 REAL FAULTS: Predicted Top-3 next to Ground Truth (Engine v2)")
print(f"{'Fault':6} | {'True Subsystem':16} | {'Top-1 Pred':16} | {'Top-2 Pred':16} | {'Top-3 Pred':16} | {'Match'}")
print("-" * 90)

_, _, _, _, real_preds_v2 = evaluate_method(rank_candidates_v2, real_eval_items)
all_top3_sets = []
for p in real_preds_v2:
    t = p['true']
    t1, t2, t3 = p['top3']
    match_str = "Top-1 MATCH" if t == t1 else ("Top-3 MATCH" if t in [t2, t3] else "[BAD] MISSED")
    all_top3_sets.append(tuple(p['top3']))
    print(f"{p['fault_id']:6} | {t:16} | {t1:16} | {t2:16} | {t3:16} | {match_str}")

# ASSERTION: Test that fails if all faults return the same top-3
unique_top3 = set(all_top3_sets)
assert len(unique_top3) > 1, f"[BAD] All faults returned the exact same top-3: {unique_top3}"
print(f"\n[TEST] Unique top-3 predictions across 8 faults: {len(unique_top3)} distinct combinations. PASS.")

# 7. Fit Softmax Temperature on First 70% of Injected Faults
print("\n" + "=" * 90)
print("SOFTMAX TEMPERATURE CALIBRATION & RELIABILITY BINS")
print("=" * 90)

inj_eval_items_sorted = sorted(inj_eval_items, key=lambda x: x['start_row'])
n_train_inj = int(len(inj_eval_items_sorted) * 0.70)
train_inj = inj_eval_items_sorted[:n_train_inj]
test_inj  = inj_eval_items_sorted[n_train_inj:]

print(f"Temperature Calibration Split: Train = {len(train_inj)} | Test = {len(test_inj)}")

# Optimize temperature T to minimize negative log likelihood on train_inj
def get_logits(item):
    scores = rank_candidates_v2(item['window_res'])
    return np.array([scores[s] for s in subsystems]), subsystems.index(item['true_subsystem'])

train_logits_and_labels = [get_logits(it) for it in train_inj]
test_logits_and_labels  = [get_logits(it) for it in test_inj]

best_T = 1.0
best_nll = float('inf')

for T_cand in np.arange(0.2, 5.0, 0.1):
    nll = 0.0
    for logits, y_idx in train_logits_and_labels:
        probs = softmax(logits / T_cand)
        nll -= np.log(max(1e-6, probs[y_idx]))
    if nll < best_nll:
        best_nll = nll
        best_T = float(T_cand)

print(f"Optimal Softmax Temperature fitted on Train 70%: T = {best_T:.2f}")

# Reliability bins on Test Set
conf_correct = []
conf_wrong = []
test_records = []

for logits, y_idx in test_logits_and_labels:
    probs = softmax(logits / best_T)
    pred_idx = np.argmax(probs)
    conf = float(probs[pred_idx])
    is_correct = (pred_idx == y_idx)
    
    if is_correct:
        conf_correct.append(conf)
    else:
        conf_wrong.append(conf)
        
    test_records.append({'confidence': conf, 'correct': int(is_correct)})

mean_conf_correct = float(np.mean(conf_correct)) if conf_correct else 0.0
mean_conf_wrong   = float(np.mean(conf_wrong))   if conf_wrong   else 0.0

print(f"\nConfidence Separation on Test Set:")
print(f"  Mean Confidence for CORRECT predictions: {mean_conf_correct:.4f}")
print(f"  Mean Confidence for WRONG predictions:   {mean_conf_wrong:.4f}")
print(f"  Separation (Correct - Wrong):            {mean_conf_correct - mean_conf_wrong:.4f}")

assert mean_conf_correct > mean_conf_wrong, "[BAD] Confidence for correct predictions is NOT higher than for wrong ones!"
print("Confidence Separation check: CONFIDENCE FOR CORRECT IS CLEARLY HIGHER THAN FOR WRONG! PASS.")

# Print Reliability Bins
df_bins = pd.DataFrame(test_records)
df_bins['bin'] = pd.cut(df_bins['confidence'], bins=[0.0, 0.4, 0.6, 0.8, 1.0], include_lowest=True)
print("\nReliability Bins Table (Test Set):")
print(f"{'Bin Range':15} | {'Count':6} | {'Mean Confidence':18} | {'Empirical Accuracy':20}")
print("-" * 65)
for bin_interval, grp in df_bins.groupby('bin', observed=False):
    cnt = len(grp)
    if cnt > 0:
        m_c = grp['confidence'].mean()
        acc = grp['correct'].mean()
        print(f"{str(bin_interval):15} | {cnt:6d} | {m_c:18.4f} | {acc:20.4f}")
    else:
        print(f"{str(bin_interval):15} | {cnt:6d} | {'N/A':18} | {'N/A':20}")

# Save results
rca_all_preds = []
for p in real_preds_v2:
    scores = dict(p['ranked'])
    logits = np.array([scores[s] for s in subsystems])
    probs  = softmax(logits / best_T)
    top1_sub = p['top3'][0]
    top1_conf = float(probs[subsystems.index(top1_sub)])
    rca_all_preds.append({
        'fault_id': p['fault_id'], 'true_subsystem': p['true'],
        'top1_subsystem': p['top3'][0], 'top2_subsystem': p['top3'][1], 'top3_subsystem': p['top3'][2],
        'top1_correct': int(p['true'] == p['top3'][0]),
        'top3_correct': int(p['true'] in p['top3']),
        'confidence': top1_conf
    })

pd.DataFrame(rca_all_preds).to_csv(REPORTS_DIR / "phase6_rca_results.csv", index=False)
pd.DataFrame(results_comparison).to_csv(REPORTS_DIR / "phase6_rca_comparison.csv", index=False)

print("\nSaved:")
print("  - reports/phase6_rca_results.csv")
print("  - reports/phase6_rca_comparison.csv")
print("STEP 5 COMPLETE.")
