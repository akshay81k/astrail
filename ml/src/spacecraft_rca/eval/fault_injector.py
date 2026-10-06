import numpy as np
import pandas as pd
from pathlib import Path

def generate_subsystem_faults(df_normal, signal_catalog, n=60, seed=42):
    np.random.seed(seed)
    df_inj = df_normal.copy().reset_index(drop=True)
    
    # We group signals by subsystem
    subsystems = signal_catalog['subsystem'].unique()
    signals_by_sub = {sub: signal_catalog[signal_catalog['subsystem'] == sub]['signal'].tolist() for sub in subsystems}
    
    events = []
    
    # Pick 60 random start rows in the first 90% of the normal df
    max_idx = int(len(df_inj) * 0.9)
    starts = np.random.choice(range(32, max_idx), size=n, replace=False)
    
    for i, start in enumerate(starts):
        sub = np.random.choice(subsystems)
        sigs = signals_by_sub[sub]
        
        # severity and duration
        dur = int(np.random.normal(50, 20))
        dur = max(10, min(150, dur))
        
        end = start + dur
        if end >= len(df_inj): end = len(df_inj) - 1
        
        # Apply drift and spikes to all signals in subsystem
        affected = []
        for sig in sigs:
            if sig not in df_inj.columns: continue
            affected.append(sig)
            sev = np.random.uniform(2.0, 5.0)
            
            # 50/50 drift vs spike
            if np.random.rand() > 0.5:
                # drift
                trend = np.linspace(0, sev * df_inj[sig].std(), end - start)
                df_inj.loc[start:end-1, sig] += trend
            else:
                # spike
                df_inj.loc[start:end-1, sig] += sev * df_inj[sig].std()
                
        events.append({
            'fault_id': f"INJ_SUB_{i:03d}",
            'start_row': start,
            'end_row': end,
            'source_subsystem': sub,
            'fault_type': 'subsystem_fault',
            'affected_signals': ";".join(affected)
        })
        
    return df_inj, pd.DataFrame(events)

def generate_sensor_faults(df_normal, signal_catalog, n=60, seed=42):
    np.random.seed(seed + 1)
    df_inj = df_normal.copy().reset_index(drop=True)
    
    signals = signal_catalog['signal'].tolist()
    events = []
    
    max_idx = int(len(df_inj) * 0.9)
    starts = np.random.choice(range(32, max_idx), size=n, replace=False)
    
    for i, start in enumerate(starts):
        sig = np.random.choice(signals)
        if sig not in df_inj.columns: continue
        
        dur = int(np.random.normal(30, 15))
        dur = max(5, min(100, dur))
        end = start + dur
        if end >= len(df_inj): end = len(df_inj) - 1
        
        sev = np.random.uniform(3.0, 7.0)
        fault_modes = ["spike", "drift", "stuck", "bias"]
        mode = np.random.choice(fault_modes)
        
        std = df_inj[sig].std()
        if mode == "spike":
            df_inj.loc[start:end-1, sig] += sev * std
        elif mode == "drift":
            trend = np.linspace(0, sev * std, end - start)
            df_inj.loc[start:end-1, sig] += trend
        elif mode == "stuck":
            df_inj.loc[start:end-1, sig] = df_inj.loc[start, sig]
        elif mode == "bias":
            df_inj.loc[start:end-1, sig] += sev * std
            
        sub = signal_catalog[signal_catalog['signal'] == sig]['subsystem'].values[0]
        
        events.append({
            'fault_id': f"INJ_SENS_{i:03d}",
            'start_row': start,
            'end_row': end,
            'source_subsystem': sub,
            'fault_type': 'sensor_fault',
            'affected_signals': sig
        })
        
    return df_inj, pd.DataFrame(events)


def inject_slow_drift(df_normal, signal_catalog, hi_limits, lo_limits, n=30, seed=42):
    """
    Linear ramp faults that stay inside limit-checker thresholds for the entire run.
    Slope is chosen so that peak deviation = 0.6 * (hi_limit - train_mean) -- always sub-threshold.
    hi_limits / lo_limits are numpy arrays aligned to signal_catalog['signal'] order.
    """
    np.random.seed(seed + 2)
    signals = signal_catalog['signal'].tolist()
    df_inj  = df_normal.copy().reset_index(drop=True)
    events  = []

    max_idx = int(len(df_inj) * 0.9)
    starts  = np.random.choice(range(32, max_idx - 300), size=n, replace=False)

    for i, start in enumerate(starts):
        sig_idx = np.random.randint(0, len(signals))
        sig     = signals[sig_idx]
        if sig not in df_inj.columns:
            continue

        dur = int(np.random.uniform(200, 500))  # slow ramp needs length to be detectable
        end = min(start + dur, len(df_inj) - 1)

        col_mean = df_inj[sig].iloc[:start].mean()
        hi  = hi_limits[sig_idx]
        lo  = lo_limits[sig_idx]
        # headroom: 60% of distance to nearest limit
        headroom_hi = 0.60 * (hi - col_mean)
        headroom_lo = 0.60 * (col_mean - lo)
        headroom    = min(headroom_hi, headroom_lo)
        if headroom <= 0:
            headroom = 0.1 * abs(col_mean) if col_mean != 0 else 0.1

        direction = np.random.choice([-1, 1])
        ramp = np.linspace(0, direction * headroom, end - start)
        df_inj.loc[start : end - 1, sig] += ramp

        events.append({
            'fault_id':        f"INJ_DRIFT_{i:03d}",
            'start_row':       start,
            'end_row':         end,
            'source_subsystem': signal_catalog[signal_catalog['signal'] == sig]['subsystem'].values[0],
            'fault_type':      'slow_drift',
            'affected_signals': sig,
            'peak_delta':      float(direction * headroom),
            'hi_limit':        float(hi),
            'lo_limit':        float(lo),
        })

    return df_inj, pd.DataFrame(events)


def generate_noise_windows(df_normal, signal_catalog, n=40, seed=42):
    """
    Pure noise bursts -- no fault. Extra Gaussian noise injected on random channels.
    These are negative examples for the classifier (label = 'noise').
    """
    np.random.seed(seed + 3)
    signals = signal_catalog['signal'].tolist()
    df_inj  = df_normal.copy().reset_index(drop=True)
    events  = []

    max_idx = int(len(df_inj) * 0.9)
    starts  = np.random.choice(range(32, max_idx), size=n, replace=False)

    for i, start in enumerate(starts):
        n_ch  = np.random.randint(1, 4)
        chans = np.random.choice(signals, size=n_ch, replace=False)
        dur   = int(np.random.uniform(10, 60))
        end   = min(start + dur, len(df_inj) - 1)
        noise_scale = np.random.uniform(0.5, 1.5)  # 0.5–1.5 sigma; intentionally sub-fault

        affected = []
        for sig in chans:
            if sig not in df_inj.columns:
                continue
            std = df_inj[sig].std()
            noise = np.random.normal(0, noise_scale * std, end - start)
            df_inj.loc[start : end - 1, sig] += noise
            affected.append(sig)

        events.append({
            'fault_id':        f"INJ_NOISE_{i:03d}",
            'start_row':       start,
            'end_row':         end,
            'source_subsystem': 'NONE',
            'fault_type':      'noise',
            'affected_signals': ";".join(affected),
        })

    return df_inj, pd.DataFrame(events)
