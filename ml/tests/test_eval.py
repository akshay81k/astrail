import pytest
import numpy as np
import pandas as pd
import json
from pathlib import Path

def test_zscore_baseline_far():
    data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
    splits = json.load(open("artifacts/splits.json"))
    df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
    
    sensor_cols = [c for c in df_clean.select_dtypes(include=[np.number]).columns if c not in ('timestamp', 'dq_score')]
    
    df_ca_raw = df_clean.iloc[splits["calibration"]].copy()
    df_va_raw = df_clean.iloc[splits["validation_normal"]].copy()
    
    z_stats = {}
    for m in df_ca_raw['mode'].unique():
        df_m = df_ca_raw[df_ca_raw['mode'] == m][sensor_cols]
        z_stats[m] = {'mean': df_m.mean().fillna(0).values, 'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values}
        
    z_alerts = np.zeros(len(df_va_raw))
    z_raw = df_va_raw[sensor_cols].ffill().fillna(0).values
    modes_arr = df_va_raw['mode'].values
    
    for i in range(len(df_va_raw)):
        m = modes_arr[i]
        if m in z_stats:
            z = np.abs(z_raw[i] - z_stats[m]['mean']) / z_stats[m]['std']
            if np.max(z) > 3.0:
                z_alerts[i] = 1
                
    far = np.mean(z_alerts[32:])
    assert 0.004 <= far <= 0.009, f"Z-score FAR {far:.6f} is outside expected range 0.004-0.009"
