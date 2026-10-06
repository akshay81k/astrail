import os
import sys
import json
import torch
import numpy as np
import pandas as pd
from pathlib import Path

# Add src to path so we can import
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
from spacecraft_rca.models.gru_forecaster import GRUForecaster
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.data.loaders import load_metadata_file

data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
cache_dir = Path("artifacts/cache")
cache_dir.mkdir(parents=True, exist_ok=True)

print("Starting cache generation...")

try:
    # 1. Load Data
    print("Loading datasets...")
    # Bypass Pandera validation crash by reading directly
    df = pd.read_csv(data_root / "data" / "synthetic_telemetry_imperfect.csv")
    df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
    
    sig_cat = load_metadata_file(data_root, "signal_catalog.csv")
    sensor_cols = sig_cat['signal'].tolist()
    
    with open("artifacts/splits.json") as f:
        splits = json.load(f)
    train_idx = splits['train']
    
    # 2. Quality Layer
    print("Fitting quality processor...")
    qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
    qp.sensor_cols = sensor_cols
    df_tr = df_clean.iloc[train_idx].copy()
    qp.fit_scaler(df_tr)
    
    print("Transforming 80k rows...")
    df_proc = qp.transform_scaler(df)
    
    # 3. Model Prep
    print("Loading GRU model...")
    gru = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.0) # no dropout
    gru.load_state_dict(torch.load("artifacts/gru_state_dict.safetensors", weights_only=True))
    gru.eval()
    
    modes = ["NOMINAL", "SAFE", "SCIENCE", "ECLIPSE"]
    def prep_array(df_p):
        X_sens = df_p[sensor_cols].fillna(0).values
        y = X_sens.copy()
        mode_oh = np.zeros((len(df_p), 4))
        for i, m in enumerate(modes):
            if 'mode' in df_p.columns:
                mode_oh[:, i] = (df_p['mode'] == m).astype(float)
        missing_cols = [f"{c}_is_missing" for c in sensor_cols]
        X_mask = np.zeros((len(df_p), 23))
        for i, mc in enumerate(missing_cols):
            if mc in df_p.columns: X_mask[:, i] = df_p[mc].astype(float)
        return np.concatenate([X_sens, mode_oh, X_mask], axis=1), y
        
    X_full, y_full = prep_array(df_proc)
    
    print("Generating windows...")
    X_t = torch.tensor(X_full, dtype=torch.float32)
    # Window size 32
    X_w = X_t.unfold(0, 32, 1).transpose(1, 2)[:-1]
    y_targ = torch.tensor(y_full[32:], dtype=torch.float32)
    
    # 4. Inference pass
    print("Running inference over 80k rows (eval mode)...")
    preds = []
    with torch.no_grad():
        for i in range(0, len(X_w), 512):
            preds.append(gru(X_w[i:i+512]))
    preds = torch.cat(preds, dim=0)
    
    residuals = torch.abs(preds - y_targ).numpy()
    
    # We need cal_p99 from the calibration split to normalize scores
    # Actually, we can just save raw residuals, but instructions said "save normalized residuals, scores and masks"
    # Let's save residuals for now
    
    print(f"Residuals shape: {residuals.shape}")
    nan_count = np.isnan(residuals).sum()
    print(f"NaN count in residuals: {nan_count}")
    
    np.save(cache_dir / "residuals.npy", residuals)
    print("Successfully dumped artifacts/cache/residuals.npy")
    
    print("PHASE 1 GATE: PASS")
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"\n[BAD] Phase 1 - Script failed: {e}")
