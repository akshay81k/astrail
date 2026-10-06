import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
import torch
from pathlib import Path
from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
WIN          = 32
CONTEXT_PRE  = 64
CONTEXT_POST = 32

print("=== Step 2: Injected Data Generation & Residual Caching ===")

# 1. Load metadata & splits
sig_cat     = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)

with open("artifacts/splits.json") as f:
    splits_raw = json.load(f)
train_idx    = np.array(splits_raw['train'])
val_norm_idx = np.array(splits_raw.get('validation_normal', splits_raw.get('validation', [])))

df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
hi_limits = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits = np.load(CACHE_DIR / "lo_limits.npy")
s_c       = np.load(CACHE_DIR / "s_c.npy")

# Fit scaler
qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
qp.sensor_cols = sensor_cols
qp.fit_scaler(df_clean.iloc[train_idx])

# Base normal series
if len(val_norm_idx) > 0:
    df_normal = df_clean.iloc[val_norm_idx].copy().reset_index(drop=True)
else:
    df_normal = df_clean.iloc[-20000:].copy().reset_index(drop=True)
print(f"Base normal series length: {len(df_normal)}")

# Load GRU model
with open("artifacts/gru_config.json") as f:
    cfg = json.load(f)
gru = GRUForecaster(
    input_dim=cfg['input_dim'], hidden_dim=cfg['hidden_dim'],
    num_layers=cfg['num_layers'], output_dim=cfg['output_dim'], dropout=0.0
)
gru.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
gru.eval()

# 2. Generate injected events with calibrated severity in normalized residual units
def generate_subsystem_faults_tuned(df_normal, signal_catalog, n=60, seed=42):
    np.random.seed(seed)
    subsystems = signal_catalog['subsystem'].unique()
    signals_by_sub = {sub: signal_catalog[signal_catalog['subsystem'] == sub]['signal'].tolist() for sub in subsystems}
    
    events = []
    max_idx = len(df_normal) - 250
    starts = np.sort(np.random.choice(range(CONTEXT_PRE, max_idx), size=n, replace=False))
    
    for i, start in enumerate(starts):
        sub = np.random.choice(subsystems)
        sigs = signals_by_sub[sub]
        dur = int(np.random.normal(50, 15))
        dur = max(20, min(120, dur))
        end = start + dur
        
        events.append({
            'fault_id': f"INJ_SUB_{i:03d}",
            'start_row': start,
            'end_row': end,
            'source_subsystem': sub,
            'fault_type': 'subsystem_fault',
            'affected_signals': ";".join(sigs),
            'severity': float(np.random.uniform(4.0, 6.5)),
            'mode': np.random.choice(['drift', 'spike'])
        })
    return pd.DataFrame(events)

def generate_sensor_faults_tuned(df_normal, signal_catalog, n=60, seed=43):
    np.random.seed(seed)
    signals = signal_catalog['signal'].tolist()
    events = []
    max_idx = len(df_normal) - 250
    starts = np.sort(np.random.choice(range(CONTEXT_PRE, max_idx), size=n, replace=False))
    
    for i, start in enumerate(starts):
        sig = np.random.choice(signals)
        dur = int(np.random.normal(40, 15))
        dur = max(15, min(100, dur))
        end = start + dur
        sub = signal_catalog[signal_catalog['signal'] == sig]['subsystem'].values[0]
        
        events.append({
            'fault_id': f"INJ_SENS_{i:03d}",
            'start_row': start,
            'end_row': end,
            'source_subsystem': sub,
            'fault_type': 'sensor_fault',
            'affected_signals': sig,
            'severity': float(np.random.uniform(3.5, 6.0)),
            'mode': np.random.choice(['spike', 'drift', 'bias'])
        })
    return pd.DataFrame(events)

def generate_noise_windows_tuned(df_normal, signal_catalog, n=40, seed=44):
    np.random.seed(seed)
    signals = signal_catalog['signal'].tolist()
    events = []
    max_idx = len(df_normal) - 250
    starts = np.sort(np.random.choice(range(CONTEXT_PRE, max_idx), size=n, replace=False))
    
    for i, start in enumerate(starts):
        n_ch = np.random.randint(1, 3)
        chans = np.random.choice(signals, size=n_ch, replace=False)
        dur = int(np.random.uniform(10, 40))
        end = start + dur
        events.append({
            'fault_id': f"INJ_NOISE_{i:03d}",
            'start_row': start,
            'end_row': end,
            'source_subsystem': 'NONE',
            'fault_type': 'noise',
            'affected_signals': ";".join(chans),
            'severity': float(np.random.uniform(0.4, 0.9)),
            'mode': 'gaussian'
        })
    return pd.DataFrame(events)

# Slow drift within limits
def generate_drift_windows_tuned(df_normal, signal_catalog, hi_limits, lo_limits, n=30, seed=45):
    np.random.seed(seed)
    signals = signal_catalog['signal'].tolist()
    events = []
    max_idx = len(df_normal) - 500
    starts = np.sort(np.random.choice(range(CONTEXT_PRE, max_idx), size=n, replace=False))
    
    for i, start in enumerate(starts):
        sig_idx = np.random.randint(0, len(signals))
        sig     = signals[sig_idx]
        dur     = int(np.random.uniform(200, 400))
        end     = start + dur
        
        col_mean = df_normal[sig].iloc[:start].mean()
        hi = hi_limits[sig_idx]
        lo = lo_limits[sig_idx]
        
        headroom_hi = 0.50 * (hi - col_mean)
        headroom_lo = 0.50 * (col_mean - lo)
        headroom    = min(headroom_hi, headroom_lo)
        if headroom <= 0:
            headroom = 0.1 * abs(col_mean) if col_mean != 0 else 0.1
            
        direction = float(np.random.choice([-1.0, 1.0]))
        peak_delta = direction * headroom
        sub = signal_catalog[signal_catalog['signal'] == sig]['subsystem'].values[0]
        
        events.append({
            'fault_id': f"INJ_DRIFT_{i:03d}",
            'start_row': start,
            'end_row': end,
            'source_subsystem': sub,
            'fault_type': 'slow_drift',
            'affected_signals': sig,
            'severity': float(headroom),
            'mode': 'ramp',
            'peak_delta': float(peak_delta),
            'hi_limit': float(hi),
            'lo_limit': float(lo)
        })
    return pd.DataFrame(events)

print("Generating tuned event manifests...")
ev_sub   = generate_subsystem_faults_tuned(df_normal, sig_cat, n=60, seed=42)
ev_sens  = generate_sensor_faults_tuned(df_normal, sig_cat, n=60, seed=43)
ev_drift = generate_drift_windows_tuned(df_normal, sig_cat, hi_limits, lo_limits, n=30, seed=45)
ev_noise = generate_noise_windows_tuned(df_normal, sig_cat, n=40, seed=44)

# 3. Model inference helper on a window
modes_list = ["NOMINAL", "SAFE", "HIGH_LOAD", "COMM"]

def run_gru_on_slice(df_slice):
    df_p = qp.transform_scaler(df_slice)
    X_sens = df_p[sensor_cols].fillna(0).values
    mode_oh = np.zeros((len(df_p), 4))
    if 'mode' in df_p.columns:
        for j, m in enumerate(modes_list):
            mode_oh[:, j] = (df_p['mode'] == m).astype(float)
    missing_cols = [f"{c}_is_missing" for c in sensor_cols]
    X_mask = np.zeros((len(df_p), n_sensors))
    for j, mc in enumerate(missing_cols):
        if mc in df_p.columns:
            X_mask[:, j] = df_p[mc].astype(float)
    X_full = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    X_t = torch.tensor(X_full, dtype=torch.float32)
    y_t = torch.tensor(X_sens, dtype=torch.float32)
    
    # unfold WIN=32
    X_w = X_t.unfold(0, WIN, 1).transpose(1, 2)[:-1]
    y_tg = y_t[WIN:]
    
    with torch.no_grad():
        preds = gru(X_w)
    res = torch.abs(preds - y_tg).numpy()
    res_norm = res / s_c
    return res_norm

# Process each event: create slice, inject fault, run GRU, store residuals
injected_residuals_cache = {}
sanity_sub_results = []

all_events_list = [ev_sub, ev_sens, ev_drift, ev_noise]
all_events_df = pd.concat(all_events_list, ignore_index=True)

print(f"Applying {len(all_events_df)} faults to actual series slices and running model...")

for idx, ev in all_events_df.iterrows():
    fid   = ev['fault_id']
    s_row = int(ev['start_row'])
    e_row = int(ev['end_row'])
    ftype = ev['fault_type']
    mode  = ev['mode']
    sev   = float(ev['severity'])
    sigs  = ev['affected_signals'].split(';')
    
    slice_start = s_row - CONTEXT_PRE
    slice_end   = e_row + CONTEXT_POST
    
    df_slice = df_normal.iloc[slice_start : slice_end].copy().reset_index(drop=True)
    
    f_start_local = CONTEXT_PRE
    f_end_local   = CONTEXT_PRE + (e_row - s_row)
    
    # Apply injection with calibrated normalized amplitude
    for sig in sigs:
        if sig not in df_slice.columns:
            continue
        sig_idx = sensor_cols.index(sig)
        scale_val = qp.scaler.scale_[sig_idx]
        sig_sc    = s_c[sig_idx]
        
        # Effective delta in raw units corresponding to `sev * s_c` in normalized residual space
        eff_delta = sev * sig_sc * scale_val
        
        if ftype == 'subsystem_fault':
            if mode == 'drift':
                ramp = np.linspace(eff_delta * 0.75, eff_delta, f_end_local - f_start_local)
                df_slice.loc[f_start_local : f_end_local - 1, sig] += ramp
            else: # spike
                df_slice.loc[f_start_local : f_end_local - 1, sig] += eff_delta
        elif ftype == 'sensor_fault':
            if mode == 'spike':
                df_slice.loc[f_start_local : f_end_local - 1, sig] += eff_delta
            elif mode == 'drift':
                ramp = np.linspace(eff_delta * 0.5, eff_delta, f_end_local - f_start_local)
                df_slice.loc[f_start_local : f_end_local - 1, sig] += ramp
            elif mode == 'bias':
                df_slice.loc[f_start_local : f_end_local - 1, sig] += eff_delta
        elif ftype == 'noise':
            # Sub-threshold Gaussian noise
            noise = np.random.normal(0, eff_delta * 0.3, f_end_local - f_start_local)
            df_slice.loc[f_start_local : f_end_local - 1, sig] += noise
        elif ftype == 'slow_drift':
            peak_delta = float(ev['peak_delta'])
            ramp = np.linspace(0, peak_delta, f_end_local - f_start_local)
            df_slice.loc[f_start_local : f_end_local - 1, sig] += ramp

    # Run model on injected slice
    res_norm = run_gru_on_slice(df_slice)
    injected_residuals_cache[fid] = res_norm
    
    # Sanity calculation for subsystem faults
    if ftype == 'subsystem_fault' and len(sanity_sub_results) < 10:
        aff_indices = [sensor_cols.index(s) for s in sigs if s in sensor_cols]
        outside_res = res_norm[:32, aff_indices]
        inside_res  = res_norm[32 : 32 + (e_row - s_row), aff_indices]
        
        mean_outside = float(np.mean(outside_res))
        mean_inside  = float(np.mean(inside_res))
        sanity_sub_results.append({
            'fault_id': fid,
            'subsystem': ev['source_subsystem'],
            'mean_outside': mean_outside,
            'mean_inside': mean_inside,
            'ratio': mean_inside / (mean_outside + 1e-6)
        })

# Save injected cache
np.savez_compressed(CACHE_DIR / "injected_residuals_cache.npz", **injected_residuals_cache)
print(f"Cached injected residuals saved to artifacts/cache/injected_residuals_cache.npz ({len(injected_residuals_cache)} entries)")

# Save updated ground truth
all_events_df['split'] = 'injected'
all_events_df.to_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv", index=False)
print("Updated reports/phase3_injected_ground_truth.csv")

# Print Sanity Table
print("\n" + "=" * 80)
print("SANITY PRINT: 10 Subsystem Faults Residuals Inside vs Outside Window")
print(f"{'Fault ID':12} | {'Subsystem':15} | {'Mean Outside (context)':24} | {'Mean Inside (fault)':20} | {'Ratio':8} | {'Status'}")
print("-" * 80)
all_well_above_1 = True
for s in sanity_sub_results:
    is_ok = s['mean_inside'] > 1.5
    if not is_ok: all_well_above_1 = False
    status = "OK (>> 1)" if is_ok else "[BAD] LOW"
    print(f"{s['fault_id']:12} | {s['subsystem']:15} | {s['mean_outside']:24.4f} | {s['mean_inside']:20.4f} | {s['ratio']:8.2f} | {status}")
print("=" * 80)

if all_well_above_1:
    print("STEP 2 SANITY CHECK: ALL 10 SUBSYSTEM FAULTS ARE WELL ABOVE 1.0! PASS.")
else:
    print("[BAD] STEP 2: One or more faults were not sufficiently visible.")
