import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

from pathlib import Path
import numpy as np
import pandas as pd
from scipy.special import softmax

from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)

print("================================================================================")
print("  EVALUATION: Harder Injector (Source-Channel Ratio 1.5x - 3.0x) with RCA Baselines")
print("================================================================================")

# 1. Load metadata & data
sig_cat   = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
dep_graph = load_metadata_file(DATA_ROOT, "dependency_graph.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)
subsystems  = sorted(sig_cat['subsystem'].unique().tolist())
sub_to_sigs = {sub: sig_cat[sig_cat['subsystem'] == sub]['signal'].tolist() for sub in subsystems}

df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
val_norm_raw = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))
df_normal = df_clean.iloc[val_norm_raw].copy().reset_index(drop=True)

s_c = np.load(CACHE_DIR / "s_c.npy")

# Helper: Channel onset
def find_channel_onsets(res_window, thresh=1.0, persist=3):
    onsets = {}
    for c in range(res_window.shape[1]):
        col = res_window[:, c]
        above = (col >= thresh).astype(int)
        for i in range(len(above) - persist + 1):
            if above[i : i + persist].sum() == persist:
                onsets[c] = i
                break
    return onsets

# RCA Methods
def rank_baseline_b_largest_residual(res_window):
    scores = {sub: 0.0 for sub in subsystems}
    for sub in subsystems:
        ch_indices = [sensor_cols.index(s) for s in sub_to_sigs[sub] if s in sensor_cols]
        if ch_indices:
            scores[sub] = float(res_window[:, ch_indices].max())
    return scores

def rank_baseline_c_earliest_onset(res_window):
    onsets = find_channel_onsets(res_window, thresh=1.0, persist=3)
    scores = {sub: 0.0 for sub in subsystems}
    w_len = len(res_window)
    for sub in subsystems:
        ch_indices = [sensor_cols.index(s) for s in sub_to_sigs[sub] if s in sensor_cols]
        sub_onsets = [onsets[c] for c in ch_indices if c in onsets]
        if sub_onsets:
            earliest = min(sub_onsets)
            scores[sub] = float(w_len - earliest)
        else:
            scores[sub] = 0.0
    return scores

def rank_engine_v2(res_window, onset_bonus_wt=1.5):
    scores = {}
    onsets = find_channel_onsets(res_window, thresh=1.0, persist=3)
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
            bonus = onset_bonus_wt * earliness
        else:
            bonus = 0.0
        scores[sub] = top2_sum + bonus
    return scores

# 2. Generate 100 Harder Injected Events with Source-to-Downstream Ratio in [1.5, 3.0]
np.random.seed(42)
n_events = 100
harder_items = []

for k in range(n_events):
    true_sub = np.random.choice(subsystems)
    source_sigs = sub_to_sigs[true_sub]
    source_sig = np.random.choice(source_sigs)
    source_idx = sensor_cols.index(source_sig)
    
    # Downstream / coupled subsystems from dependency graph
    downstream_matches = dep_graph[dep_graph.iloc[:, 0] == true_sub].iloc[:, 1].tolist()
    if not downstream_matches:
        downstream_matches = [s for s in subsystems if s != true_sub]
    down_sub = np.random.choice(downstream_matches)
    down_sig = np.random.choice(sub_to_sigs[down_sub])
    down_idx = sensor_cols.index(down_sig)
    
    # Create residual window of length 50 rows
    # Background noise ~ normal with std = 0.3 * s_c
    res_window = np.abs(np.random.normal(0, 0.3, size=(50, n_sensors)))
    
    # Target source-to-downstream peak ratio between 1.5 and 3.0
    target_ratio = np.random.uniform(1.5, 3.0)
    downstream_peak = np.random.uniform(2.5, 4.0)
    source_peak = downstream_peak * target_ratio
    
    # Source onset starts at t=10 with ramp up to source_peak
    t_source_onset = 10
    res_window[t_source_onset:, source_idx] += np.linspace(1.0, source_peak, 50 - t_source_onset)
    
    # Downstream onset starts slightly later (t=14) with ramp up to downstream_peak
    t_down_onset = 14
    res_window[t_down_onset:, down_idx] += np.linspace(1.0, downstream_peak, 50 - t_down_onset)
    
    harder_items.append({
        'true_subsystem': true_sub,
        'window_res': res_window,
        'ratio': target_ratio
    })

print(f"Generated {len(harder_items)} harder injected events.")
print(f"Mean Source-to-Downstream Channel Ratio: {np.mean([item['ratio'] for item in harder_items]):.2f}x (Range: [{np.min([item['ratio'] for item in harder_items]):.2f}x, {np.max([item['ratio'] for item in harder_items]):.2f}x])")

# 3. Evaluate Methods with Bootstrap CIs
def bootstrap_eval(rank_func, items, n_boot=2000, seed=42):
    t1_flags = []
    t3_flags = []
    for it in items:
        scores = rank_func(it['window_res'])
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        ranked_subs = [r[0] for r in ranked]
        t1_flags.append(1.0 if ranked_subs and ranked_subs[0] == it['true_subsystem'] else 0.0)
        t3_flags.append(1.0 if it['true_subsystem'] in ranked_subs[:3] else 0.0)
        
    t1_flags = np.array(t1_flags)
    t3_flags = np.array(t3_flags)
    
    rng = np.random.default_rng(seed)
    boot_t1 = []
    boot_t3 = []
    for _ in range(n_boot):
        sample_idx = rng.choice(len(t1_flags), size=len(t1_flags), replace=True)
        boot_t1.append(t1_flags[sample_idx].mean())
        boot_t3.append(t3_flags[sample_idx].mean())
        
    t1_mean = float(t1_flags.mean())
    t1_lo = float(np.percentile(boot_t1, 2.5))
    t1_hi = float(np.percentile(boot_t1, 97.5))
    
    t3_mean = float(t3_flags.mean())
    t3_lo = float(np.percentile(boot_t3, 2.5))
    t3_hi = float(np.percentile(boot_t3, 97.5))
    
    return t1_mean, t1_lo, t1_hi, t3_mean, t3_lo, t3_hi

methods = [
    ("(b) Largest-Residual", rank_baseline_b_largest_residual),
    ("(c) Earliest-Onset", rank_baseline_c_earliest_onset),
    ("(v2) Engine v2 (Peak+Onset)", rank_engine_v2)
]

records = []
print("\n" + "=" * 90)
print(f"{'Method':30} | {'Top-1 Accuracy (95% CI)':26} | {'Top-3 Accuracy (95% CI)':26}")
print("-" * 90)

for name, fn in methods:
    t1_m, t1_l, t1_h, t3_m, t3_l, t3_h = bootstrap_eval(fn, harder_items)
    print(f"{name:30} | {t1_m:5.1%} [{t1_l:5.1%}, {t1_h:5.1%}]       | {t3_m:5.1%} [{t3_l:5.1%}, {t3_h:5.1%}]")
    records.append({
        "method": name,
        "top1_accuracy": round(t1_m, 4),
        "top1_ci_lower": round(t1_l, 4),
        "top1_ci_upper": round(t1_h, 4),
        "top3_accuracy": round(t3_m, 4),
        "top3_ci_lower": round(t3_l, 4),
        "top3_ci_upper": round(t3_h, 4),
    })

df_res = pd.DataFrame(records)
out_csv = REPORTS_DIR / "harder_injector_rca_comparison.csv"
df_res.to_csv(out_csv, index=False)
print("-" * 90)
print(f"Saved results to {out_csv}")
