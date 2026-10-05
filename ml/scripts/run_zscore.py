import json
import numpy as np
import pandas as pd
from pathlib import Path
from spacecraft_rca.data.splits import generate_splits

data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
ml_root = Path(".")

def run():
    print("Generating splits...")
    splits = generate_splits(data_root, buffer=100)
    
    print("Loading telemetry data...")
    df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
    df_calib = df_clean.iloc[splits["calibration"]]
    sensor_cols = [c for c in df_clean.select_dtypes(include=[np.number]).columns if c not in ('timestamp', 'dq_score')]
    
    mode_stats = {}
    for mode in df_calib['mode'].unique():
        df_m = df_calib[df_calib['mode'] == mode][sensor_cols]
        mode_stats[mode] = {
            'mean': df_m.mean().fillna(0).values,
            'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values
        }
        
    df_val = df_clean.iloc[splits["validation_normal"]]
    val_alerts = []
    
    for mode in df_val['mode'].unique():
        df_v = df_val[df_val['mode'] == mode][sensor_cols]
        if not df_v.empty:
            z = np.abs(df_v.values - mode_stats[mode]['mean']) / mode_stats[mode]['std']
            max_z = np.max(z, axis=1)
            alerts = (max_z > 3.0).astype(int) 
            val_alerts.extend(alerts)
            
    far = np.mean(val_alerts)
    print(f"\n--- Z-SCORE BASELINE EVALUATION ---")
    print(f"False Alerts on validation-normal: {sum(val_alerts)} / {len(val_alerts)}")
    print(f"False Alert Rate (per timestep): {far:.6f}")
    
    df_imperfect = pd.read_csv(data_root / "data" / "synthetic_telemetry_imperfect.csv")
    faults = pd.read_csv(data_root / "data" / "fault_events_ground_truth.csv")
    detected = 0
    total_lead_time = 0.0
    
    for _, f in faults.iterrows():
        start = f['start_row']
        end = f['end_row']
        
        df_event = df_imperfect.iloc[start:end]
        event_alerts = np.zeros(len(df_event))
        
        for mode in df_event['mode'].unique():
            idx = df_event['mode'] == mode
            if not any(idx): continue
            
            df_m = df_event[idx][sensor_cols].fillna(0)
            if mode in mode_stats:
                z = np.abs(df_m.values - mode_stats[mode]['mean']) / mode_stats[mode]['std']
                max_z = np.max(z, axis=1)
                event_alerts[idx] = (max_z > 3.0).astype(int)
                
        alert_idx = np.where(event_alerts == 1)[0]
        if len(alert_idx) > 0:
            detected += 1
            total_lead_time += alert_idx[0]
            
    mean_lt = total_lead_time / detected if detected > 0 else 0
    print(f"Events Detected (out of 8 ground truth): {detected}")
    print(f"Mean Lead Time (rows elapsed from fault injection to detection): {mean_lt:.1f}")

if __name__ == "__main__":
    run()
