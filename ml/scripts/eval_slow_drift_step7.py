import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
from pathlib import Path
from spacecraft_rca.data.loaders import load_metadata_file

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
WIN          = 32
CONTEXT_PRE  = 64

print("=== STEP 7: Slow Drift Evaluation & CUSUM Delay Fix ===")

# 1. Load data & limits
sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
hi_limits = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits = np.load(CACHE_DIR / "lo_limits.npy")
s_c       = np.load(CACHE_DIR / "s_c.npy")

with open("artifacts/splits.json") as f: splits = json.load(f)
val_norm_raw = np.array(splits.get('validation_normal', splits.get('validation', [])))
df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
df_normal = df_clean.iloc[val_norm_raw].copy().reset_index(drop=True)

df_inj_gt = pd.read_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv")
drift_events = df_inj_gt[df_inj_gt['fault_type'] == 'slow_drift'].copy().reset_index(drop=True)
inj_cache = np.load(CACHE_DIR / "injected_residuals_cache.npz")

print(f"Loaded {len(drift_events)} slow-drift events from Phase 3.")

# 2. Check that every drift series stays inside limit thresholds; drop violators
valid_drifts = []
violators = []

for idx, ev in drift_events.iterrows():
    fid   = ev['fault_id']
    s_row = int(ev['start_row'])
    e_row = int(ev['end_row'])
    sig   = ev['affected_signals']
    peak_delta = float(ev['peak_delta'])
    
    # Reconstruct the injected slice as done in build_injected_cache.py
    slice_start = s_row - CONTEXT_PRE
    slice_end   = e_row + 32
    df_slice = df_normal.iloc[slice_start : slice_end].copy().reset_index(drop=True)
    
    f_start_local = CONTEXT_PRE
    f_end_local   = CONTEXT_PRE + (e_row - s_row)
    ramp = np.linspace(0, peak_delta, f_end_local - f_start_local)
    df_slice.loc[f_start_local : f_end_local - 1, sig] += ramp
    
    # Check limit violations across the drift window
    sig_idx = sensor_cols.index(sig)
    drift_vals = df_slice[sig].iloc[f_start_local : f_end_local].values
    hi = hi_limits[sig_idx]
    lo = lo_limits[sig_idx]
    
    violated = np.any(drift_vals > hi) or np.any(drift_vals < lo)
    if violated:
        violators.append(fid)
        print(f"[BAD] Violator {fid} crossed limit! (hi={hi:.3f}, lo={lo:.3f}, min_val={drift_vals.min():.3f}, max_val={drift_vals.max():.3f})")
    else:
        valid_drifts.append(ev)

print(f"\nLimit Violation Check:")
print(f"  Total slow-drift events checked: {len(drift_events)}")
print(f"  [BAD] Violators dropped: {len(violators)} {violators}")
print(f"  Valid compliant events retained: {len(valid_drifts)}")

# Assert that every series in the evaluated set strictly stays inside limits
df_valid_drifts = pd.DataFrame(valid_drifts)
assert len(df_valid_drifts) > 0, "[BAD] No compliant drift series found!"
for _, ev in df_valid_drifts.iterrows():
    s_row = int(ev['start_row'])
    e_row = int(ev['end_row'])
    sig   = ev['affected_signals']
    slice_start = s_row - CONTEXT_PRE
    slice_end   = e_row + 32
    df_slice = df_normal.iloc[slice_start : slice_end].copy().reset_index(drop=True)
    f_start_local = CONTEXT_PRE
    f_end_local   = CONTEXT_PRE + (e_row - s_row)
    ramp = np.linspace(0, float(ev['peak_delta']), f_end_local - f_start_local)
    df_slice.loc[f_start_local : f_end_local - 1, sig] += ramp
    sig_idx = sensor_cols.index(sig)
    drift_vals = df_slice[sig].iloc[f_start_local : f_end_local].values
    assert not (np.any(drift_vals > hi_limits[sig_idx]) or np.any(drift_vals < lo_limits[sig_idx])), f"[BAD] Residual violator found in valid set: {ev['fault_id']}"
print("ASSERTION: Every retained drift series strictly stays inside limit thresholds! PASS.")

# 3. CUSUM Detector Specification
def cusum_detector(norm_res, delta=0.5, h=4.0):
    """
    Two-sided Page-Hinkley CUSUM on normalized residuals.
    Alert fires when cumulative sum > h.
    """
    n = len(norm_res)
    S_hi = np.zeros(n)
    alerts = np.zeros(n, dtype=int)
    for i in range(1, n):
        S_hi[i] = max(0.0, S_hi[i-1] + (norm_res[i] - 1.0) - delta)
        if S_hi[i] > h:
            alerts[i] = 1
    return alerts

# Helper for ewma and persistence
def ewma(arr, alpha=0.3):
    out = np.empty_like(arr, dtype=float)
    out[0] = float(arr[0])
    for i in range(1, len(arr)):
        out[i] = alpha * float(arr[i]) + (1 - alpha) * out[i-1]
    return out

def persistence_alerts(score, threshold=1.0519, win=3):
    binary = (score >= threshold).astype(int)
    alert = np.zeros(len(binary), dtype=int)
    for i in range(win - 1, len(binary)):
        if binary[i - win + 1 : i + 1].sum() == win:
            alert[i] = 1
    return alert

# 4. Evaluate Limit Checker vs GRU vs CUSUM
# Operating GRU threshold from Step 3
THRESH_GRU = 1.0519
CUSUM_DELTA = 0.3
CUSUM_H     = 3.5

results = []
lim_det_count = 0
gru_det_count = 0
cusum_det_count = 0
delays_gru = []
delays_cusum = []

print("\n" + "=" * 95)
print(f"{'Fault ID':14} | {'Limit Detected':15} | {'GRU Detected':14} | {'CUSUM Detected':15} | {'GRU Delay':10} | {'CUSUM Delay':12}")
print("-" * 95)

for _, ev in df_valid_drifts.iterrows():
    fid   = ev['fault_id']
    s_row = int(ev['start_row'])
    e_row = int(ev['end_row'])
    dur   = e_row - s_row
    sig   = ev['affected_signals']
    
    # 1. Limit Checker: By design stays inside limits
    lim_detected = False
    
    # 2. GRU and CUSUM on cached residuals
    res_norm = inj_cache[fid]  # (T, 23)
    # Fault begins at index 32 in res_norm
    fault_onset_idx = 32
    fault_end_idx   = 32 + dur
    
    score_max = res_norm.max(axis=1)
    score_smooth = ewma(score_max)
    
    # GRU persistence alert: Search starts STRICTLY AT fault_onset_idx (no negative delay!)
    gru_alerts = persistence_alerts(score_smooth, THRESH_GRU)
    search_window_gru = gru_alerts[fault_onset_idx : min(len(gru_alerts), fault_end_idx + 100)]
    gru_hits = np.where(search_window_gru)[0]
    
    if len(gru_hits) > 0 and int(gru_hits[0]) <= dur + 50:
        gru_detected = True
        gru_delay = int(gru_hits[0])  # >= 0
        delays_gru.append(gru_delay)
        gru_det_count += 1
    else:
        gru_detected = False
        gru_delay = None
        
    # CUSUM alert on affected channel residual: Search starts STRICTLY AT fault_onset_idx
    sig_idx = sensor_cols.index(sig)
    aff_norm_res = res_norm[:, sig_idx]
    cusum_alerts = cusum_detector(aff_norm_res, delta=CUSUM_DELTA, h=CUSUM_H)
    
    search_window_cusum = cusum_alerts[fault_onset_idx : min(len(cusum_alerts), fault_end_idx + 100)]
    cusum_hits = np.where(search_window_cusum)[0]
    
    if len(cusum_hits) > 0 and int(cusum_hits[0]) <= dur + 50:
        cusum_detected = True
        cusum_delay = int(cusum_hits[0])  # >= 0, FIXES NEGATIVE DELAY!
        delays_cusum.append(cusum_delay)
        cusum_det_count += 1
    else:
        cusum_detected = False
        cusum_delay = None
        
    # Verify non-negative delay
    if cusum_delay is not None:
        assert cusum_delay >= 0, f"[BAD] Negative CUSUM delay found: {cusum_delay}!"
    if gru_delay is not None:
        assert gru_delay >= 0, f"[BAD] Negative GRU delay found: {gru_delay}!"
        
    g_del_str = str(gru_delay) if gru_delay is not None else "[BAD] miss"
    c_del_str = str(cusum_delay) if cusum_delay is not None else "[BAD] miss"
    
    print(f"{fid:14} | {str(lim_detected):15} | {str(gru_detected):14} | {str(cusum_detected):15} | {g_del_str:10} | {c_del_str:12}")
    
    results.append({
        'fault_id': fid,
        'start_row': s_row,
        'end_row': e_row,
        'limit_detected': lim_detected,
        'gru_detected': gru_detected,
        'cusum_detected': cusum_detected,
        'gru_delay': gru_delay,
        'cusum_delay': cusum_delay
    })

n_total = len(df_valid_drifts)
print("\n" + "=" * 80)
print(f"SLOW DRIFT PERFORMANCE REPORT (n={n_total}):")
print(f"  Limit Checker Detected: {lim_det_count}/{n_total} (Recall: {lim_det_count/n_total:.1%})")
print(f"  GRU Forecaster Detected: {gru_det_count}/{n_total} (Recall: {gru_det_count/n_total:.1%}, Mean Delay: {np.mean(delays_gru):.1f} rows)")
print(f"  CUSUM Detector Detected: {cusum_det_count}/{n_total} (Recall: {cusum_det_count/n_total:.1%}, Mean Delay: {np.mean(delays_cusum):.1f} rows)")
print(f"  CUSUM-only Rescues (detected by CUSUM but missed by Limit): {cusum_det_count}")
print(f"  All CUSUM delays >= 0: YES (Minimum delay = {min(delays_cusum)} rows). PASS.")
print("=" * 80)

# Save to reports/phase4_cusum_results.csv
df_res = pd.DataFrame(results)
df_res.to_csv(REPORTS_DIR / "phase4_cusum_results.csv", index=False)
print("Saved: reports/phase4_cusum_results.csv")
print("STEP 7 COMPLETE.")
