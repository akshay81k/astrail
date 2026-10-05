import json
import numpy as np
import pandas as pd
from pathlib import Path
from spacecraft_rca.data.splits import generate_splits
from spacecraft_rca.utils import load_artifact

data_root = Path("c:/Users/HP/OneDrive/Desktop/College/Extra/astrail/INITIUM_TECHFEST_2026_27_DATA_PACK/data")
ml_root = Path("c:/Users/HP/OneDrive/Desktop/College/Extra/astrail/ml")

def main():
    print("\n" + "="*50)
    print("1. RUN SPLITS & MODE DISTRIBUTION")
    print("="*50)
    splits = generate_splits(data_root.parent, buffer=100)
    
    # Reload from save_artifact if we want, but splits is returned
    df_clean = pd.read_csv(data_root / "synthetic_telemetry_clean.csv")
    
    for s_name, indices in splits.items():
        modes = df_clean.iloc[indices]['mode'].value_counts().to_dict()
        print(f"Split '{s_name}': {len(indices)} rows")
        print(f"  Modes: {modes}")
        
    print("\n" + "="*50)
    print("2. FAULT ROW OVERLAP (TRAIN/CALIBRATION)")
    print("="*50)
    faults = pd.read_csv(data_root / "fault_events_ground_truth.csv")
    fault_rows = set()
    buffer = 100
    for _, f in faults.iterrows():
        fault_rows.update(range(max(0, f['start_row'] - buffer), f['end_row'] + buffer + 1))
        
    train_overlap = len(fault_rows.intersection(set(splits["train"])))
    calib_overlap = len(fault_rows.intersection(set(splits["calibration"])))
    print(f"Fault window rows (w/ buffer) in Train: {train_overlap}")
    print(f"Fault window rows (w/ buffer) in Calibration: {calib_overlap}")
    
    print("\n" + "="*50)
    print("3. LAG-1 AUTOCORRELATION ON TRAIN NORMAL ROWS")
    print("="*50)
    signals = [
        "battery_temperature_C", "solar_array_current_A",
        "cpu_utilization_pct", "reaction_wheel_speed_rpm", "comm_rx_dbm"
    ]
    df_train = df_clean.iloc[splits["train"]]
    
    for mode in df_train['mode'].unique():
        print(f"\nMode: {mode}")
        df_mode = df_train[df_train['mode'] == mode]
        for sig in signals:
            if sig in df_mode.columns:
                series = df_mode[sig]
                ac = series.autocorr(lag=1)
                print(f"  {sig}: {ac:.4f}")
                
    print("\n" + "="*50)
    print("4. FAULT WINDOW ALIGNMENT WITH 720-ROW BLOCKS")
    print("="*50)
    for _, f in faults.iterrows():
        start = f['start_row']
        end = f['end_row']
        s_offset = start % 720
        e_offset = end % 720
        print(f"Fault {f['fault_id']} ({f['fault_type']}): Rows {start}-{end}")
        print(f"  Start offset from block begin: {s_offset}")
        print(f"  End offset from block begin: {e_offset}")
        if s_offset < 20 or s_offset > 700:
            print("  --> Starts very close to a mode transition!")
        if e_offset < 20 or e_offset > 700:
            print("  --> Ends very close to a mode transition!")
            
    print("\n" + "="*50)
    print("5. Z-SCORE BASELINE (Thresholds from Calibration)")
    print("="*50)
    df_calib = df_clean.iloc[splits["calibration"]]
    sensor_cols = [c for c in df_clean.select_dtypes(include=[np.number]).columns if c not in ('timestamp', 'dq_score')]
    
    # Fit mode stats
    mode_stats = {}
    for mode in df_calib['mode'].unique():
        df_m = df_calib[df_calib['mode'] == mode][sensor_cols]
        mode_stats[mode] = {
            'mean': df_m.mean().fillna(0).values,
            'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values
        }
        
    # Evaluate FAR on Validation-Normal
    df_val = df_clean.iloc[splits["validation_normal"]]
    val_alerts = []
    
    for mode in df_val['mode'].unique():
        df_v = df_val[df_val['mode'] == mode][sensor_cols]
        if not df_v.empty:
            z = np.abs(df_v.values - mode_stats[mode]['mean']) / mode_stats[mode]['std']
            max_z = np.max(z, axis=1)
            alerts = (max_z > 3.0).astype(int) # 3-sigma rule
            val_alerts.extend(alerts)
            
    far = np.mean(val_alerts)
    print(f"False Alerts on validation-normal: {sum(val_alerts)} out of {len(val_alerts)} rows")
    print(f"False Alert Rate (per timestep): {far:.6f}")
    
    # Evaluate Detection / Lead time on imperfect (with faults)
    df_imperfect = pd.read_csv(data_root / "synthetic_telemetry_imperfect.csv")
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
            total_lead_time += alert_idx[0] # Rows from start
            
    mean_lt = total_lead_time / detected if detected > 0 else 0
    print(f"Events Detected (out of 8 ground truth): {detected}")
    print(f"Mean Lead Time (rows elapsed from fault injection to detection): {mean_lt:.1f}")
    print("\n" + "="*50)

if __name__ == "__main__":
    main()
