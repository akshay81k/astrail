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
