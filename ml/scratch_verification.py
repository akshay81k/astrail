import json
from pathlib import Path

import numpy as np
import pandas as pd

data_root = Path("c:/Users/HP/OneDrive/Desktop/College/Extra/astrail/INITIUM_TECHFEST_2026_27_DATA_PACK/data")
ml_root = Path("c:/Users/HP/OneDrive/Desktop/College/Extra/astrail/ml")

def analyze_modes():
    print("=== 1. MODE ANALYSIS ===")
    df_clean = pd.read_csv(data_root / "synthetic_telemetry_clean.csv")
    
    # Run lengths
    modes = df_clean['mode'].values
    changes = np.where(modes[:-1] != modes[1:])[0]
    starts = np.concatenate(([0], changes + 1))
    ends = np.concatenate((changes, [len(modes) - 1]))
    
    print("Mode Run-Lengths (Start - End : Mode):")
    for s, e in zip(starts, ends):
        print(f"Row {s:6d} - {e:6d} : {modes[s]} (Length: {e - s + 1})")
        
    print("\nModes in Splits:")
    try:
        with open(ml_root / "artifacts" / "splits.json", "r") as f:
            splits = json.load(f)
        for split_name, indices in splits.items():
            split_modes = df_clean.iloc[indices]['mode'].unique()
            print(f"  {split_name}: {split_modes}")
    except FileNotFoundError:
        print("  splits.json not found (stubbed/skipped).")
        
    return df_clean

def analyze_autocorr(df_clean):
    print("\n=== 2. LAG-1 AUTOCORRELATION PER MODE ===")
    signals = [
        "battery_temperature_C", "solar_array_current_A",
        "cpu_utilization_pct", "reaction_wheel_speed_rpm", "comm_rx_dbm"
    ]
    
    try:
        with open(ml_root / "artifacts" / "splits.json", "r") as f:
            splits = json.load(f)
            train_idx = splits["train"]
    except FileNotFoundError:
        print("splits.json not found. Skipping autocorr on normal rows.")
        return
        
    df_train = df_clean.iloc[train_idx]
    
    for mode in df_train['mode'].unique():
        print(f"Mode: {mode}")
        df_mode = df_train[df_train['mode'] == mode]
        for sig in signals:
            if sig in df_mode.columns:
                series = df_mode[sig]
                autocorr = series.autocorr(lag=1)
                print(f"  {sig}: {autocorr:.4f}")
            else:
                print(f"  {sig}: NOT FOUND")

def analyze_imperfect():
    print("\n=== 3. IMPERFECT ENCODING ===")
    df_clean = pd.read_csv(data_root / "synthetic_telemetry_clean.csv", nrows=5)
    df_imp = pd.read_csv(data_root / "synthetic_telemetry_imperfect.csv", nrows=100)
    
    clean_cols = set(df_clean.columns)
    imp_cols = set(df_imp.columns)
    
    diff = imp_cols - clean_cols
    print(f"Columns in imperfect but NOT in clean: {diff}")
    
    print("\nChecking out-of-order and delay encoding:")
    # Check timestamp diffs to see if they are out of order
    ts = df_imp['timestamp'].values
    ts_diffs = np.diff(ts)
    out_of_order = np.where(ts_diffs < 0)[0]
    if len(out_of_order) > 0:
        print(f"Found negative timestamp diffs (out of order timestamps). Example rows: {out_of_order[:3]}")
    else:
        print("No out of order timestamps found in first 100 rows.")
        
    # See if there's a delay flag column
    for col in diff:
        print(f"Sample of {col}: {df_imp[col].unique()[:5]}")

def analyze_splits_overlap():
    print("\n=== 6. FAULT SPLITS OVERLAP VERIFICATION ===")
    faults = pd.read_csv(data_root / "fault_events_ground_truth.csv")
    try:
        with open(ml_root / "artifacts" / "splits.json", "r") as f:
            splits = json.load(f)
            
        fault_rows = set()
        buffer = 50 # Assuming buffer used in generation
        for _, f in faults.iterrows():
            fault_rows.update(range(max(0, f['start_row'] - buffer), f['end_row'] + buffer))
            
        train_overlap = len(fault_rows.intersection(set(splits["train"])))
        calib_overlap = len(fault_rows.intersection(set(splits["calibration"])))
        
        print(f"Fault rows in TRAIN: {train_overlap}")
        print(f"Fault rows in CALIBRATION: {calib_overlap}")
    except FileNotFoundError:
        print("splits.json not found (stubbed/skipped).")

if __name__ == "__main__":
    df_c = analyze_modes()
    analyze_autocorr(df_c)
    analyze_imperfect()
    analyze_splits_overlap()
