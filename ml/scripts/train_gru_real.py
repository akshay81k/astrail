import numpy as np
import pandas as pd
import torch
import json
import hashlib
from pathlib import Path
from spacecraft_rca.data.splits import generate_splits
from spacecraft_rca.models.gru_forecaster import GRUForecaster, TelemetryWindowDataset, train_model
from spacecraft_rca.utils import save_artifact, load_artifact, get_logger, set_global_seed

data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
splits = json.load(open("artifacts/splits.json"))
df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
sensor_cols = [c for c in df_clean.select_dtypes(include=[np.number]).columns if c not in ('timestamp', 'dq_score')]
modes = ["NOMINAL", "SAFE", "HIGH_LOAD", "COMM"]

def prep_data(df):
    X_sens = df[sensor_cols].fillna(0).values
    y = X_sens.copy()
    mode_oh = np.zeros((len(df), 4))
    for i, m in enumerate(modes):
        mode_oh[:, i] = (df['mode'] == m).astype(float)
    X_mask = np.zeros_like(X_sens)
    X = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
    return X, y

def get_residuals(model, X, y, mask_prob=0.0):
    model.eval()
    X_copy = X.copy()
    if mask_prob > 0:
        mask = np.random.rand(*X_copy[:, :23].shape) < mask_prob
        X_copy[:, :23][mask] = 0.0
        X_copy[:, 27:50][mask] = 1.0
    
    dataset = TelemetryWindowDataset(X_copy, y, window_size=32, augment=False)
    loader = torch.utils.data.DataLoader(dataset, batch_size=512, shuffle=False)
    all_preds, all_targets = [], []
    with torch.no_grad():
        for bx, by in loader:
            preds = model(bx)
            all_preds.append(preds.numpy())
            all_targets.append(by.numpy())
    all_preds = np.concatenate(all_preds, axis=0)
    all_targets = np.concatenate(all_targets, axis=0)
    res = np.abs(all_preds - all_targets)
    return res

def ewma(arr, alpha=0.1):
    res = np.zeros_like(arr)
    res[0] = arr[0]
    for i in range(1, len(arr)):
        res[i] = alpha * arr[i] + (1 - alpha) * res[i-1]
    return res

def run():
    set_global_seed(42)
    print("Preparing data...")
    X_train, y_train = prep_data(df_clean.iloc[splits["train"]])
    X_calib, y_calib = prep_data(df_clean.iloc[splits["calibration"]])
    X_val, y_val = prep_data(df_clean.iloc[splits["validation_normal"]])
    
    train_ds = TelemetryWindowDataset(X_train, y_train, window_size=32, augment=True, drop_prob=0.1)
    val_ds = TelemetryWindowDataset(X_val, y_val, window_size=32, augment=False)
    train_loader = torch.utils.data.DataLoader(train_ds, batch_size=512, shuffle=True)
    val_loader = torch.utils.data.DataLoader(val_ds, batch_size=512, shuffle=False)
    
    model = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.2)
    print("Training GRU...")
    history = train_model(model, train_loader, val_loader, epochs=4, patience=2, lr=1e-3, device="cpu")
    
    print("\n1. Loss curve and val RMSE:")
    print(f"Train loss: {history['train_loss']}")
    print(f"Val loss: {history['val_loss']}")
    print(f"Val RMSE per channel: {history['val_rmse_per_channel']}")
    
    print("\n2. Conformal Thresholds (alpha=0.01):")
    res_calib = get_residuals(model, X_calib, y_calib)
    conformal_thresholds = np.percentile(res_calib, 99, axis=0)
    # prevent zero division
    conformal_thresholds = np.where(conformal_thresholds < 1e-6, 1e-6, conformal_thresholds)
    print(conformal_thresholds)
    
    print("\n3. FAR on validation-normal:")
    res_val = get_residuals(model, X_val, y_val)
    
    # Z-Score baseline
    df_calib = df_clean.iloc[splits["calibration"]]
    mode_stats = {}
    for m in df_calib['mode'].unique():
        df_m = df_calib[df_calib['mode'] == m][sensor_cols]
        mode_stats[m] = {'mean': df_m.mean().fillna(0).values, 'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values}
    
    df_val = df_clean.iloc[splits["validation_normal"]]
    val_modes = df_val['mode'].values[32:] 
    z = np.zeros_like(res_val)
    for i, m in enumerate(val_modes):
        if m in mode_stats:
            z[i] = np.abs(X_val[i+32, :23] - mode_stats[m]['mean']) / mode_stats[m]['std']
    z_alerts = (np.max(z, axis=1) > 3.0).astype(int)
    
    # GRU + Conformal
    gru_conf_alerts = (res_val > conformal_thresholds).any(axis=1).astype(int)
    
    # GRU + Conformal + EWMA + Persistence=3
    norm_res = res_val / conformal_thresholds
    comb_res = np.max(norm_res, axis=1)
    ewma_res = ewma(comb_res, alpha=0.3)
    persist = np.zeros_like(ewma_res)
    count = 0
    for i in range(len(ewma_res)):
        if ewma_res[i] > 1.0: count += 1
        else: count = 0
        if count >= 3: persist[i] = 1
            
    days = len(z_alerts) / 86400.0
    print(f"Z-score baseline: FAR={z_alerts.mean():.6f} per row | {z_alerts.sum()/days:.1f} per day")
    print(f"GRU + Conformal: FAR={gru_conf_alerts.mean():.6f} per row | {gru_conf_alerts.sum()/days:.1f} per day")
    print(f"GRU+Conf+Persist: FAR={persist.mean():.6f} per row | {persist.sum()/days:.1f} per day")
    
    def eval_faults(mask_prob=0.0):
        df_imp = pd.read_csv(data_root / "data" / "synthetic_telemetry_imperfect.csv")
        faults = pd.read_csv(data_root / "data" / "fault_events_ground_truth.csv")
        detected = 0
        delays = []
        top_channels = []
        
        for _, f in faults.iterrows():
            start = f['start_row'] - 32
            end = f['end_row']
            df_event = df_imp.iloc[start:end]
            X_ev, y_ev = prep_data(df_event)
            res = get_residuals(model, X_ev, y_ev, mask_prob)
            norm_res = res / conformal_thresholds
            comb = np.max(norm_res, axis=1)
            sm = ewma(comb, 0.3)
            
            p_alerts = np.zeros_like(sm)
            c = 0
            for i in range(len(sm)):
                if sm[i] > 1.0: c += 1
                else: c = 0
                if c >= 3: p_alerts[i] = 1
                
            idx = np.where(p_alerts == 1)[0]
            if len(idx) > 0:
                detected += 1
                delay = idx[0]
                delays.append(delay)
                res_at_det = norm_res[idx[0]]
                top_idx = np.argsort(res_at_det)[::-1][:3]
                top_channels.append([sensor_cols[i] for i in top_idx])
            else:
                delays.append(-1)
                top_channels.append([])
                
        return detected, delays, top_channels

    print("\n4. Evaluate 8 Fault Events (No mask):")
    d, l, t = eval_faults(0.0)
    for i in range(8):
        print(f"Fault {i+1}: detected={'Yes' if l[i] >=0 else 'No'}, delay={l[i]}, top_channels={t[i]}")
        
    print("\n5. Evaluate 8 Fault Events (20% Mask):")
    dm, lm, tm = eval_faults(0.2)
    for i in range(8):
        print(f"Fault {i+1}: detected={'Yes' if lm[i] >=0 else 'No'}, delay={lm[i]}, top_channels={tm[i]}")
        
    # Write report
    Path("reports").mkdir(exist_ok=True)
    with open("reports/gru_results.md", "w") as f:
        f.write("# GRU Forecaster Results\n\n")
        f.write("## 1. Loss Curve & Val RMSE\n")
        f.write(f"- Train Loss: {history['train_loss']}\n")
        f.write(f"- Val Loss: {history['val_loss']}\n")
        f.write(f"- Val RMSE per channel: {history['val_rmse_per_channel']}\n\n")
        
        f.write("## 2. Conformal Thresholds\n")
        f.write(f"- Thresholds (alpha=0.01): {conformal_thresholds.tolist()}\n\n")
        
        f.write("## 3. False Alert Rates\n")
        f.write(f"- Z-score baseline: {z_alerts.mean():.6f} per row ({z_alerts.sum()/days:.1f}/day)\n")
        f.write(f"- GRU + Conformal: {gru_conf_alerts.mean():.6f} per row ({gru_conf_alerts.sum()/days:.1f}/day)\n")
        f.write(f"- GRU + Conformal + Persist: {persist.mean():.6f} per row ({persist.sum()/days:.1f}/day)\n\n")
        
        f.write("## 4. Fault Detection (No mask)\n")
        f.write(f"**Detected:** {d}/8\n\n")
        f.write("| Fault | Detected | Delay (rows) | Top 3 Channels (by residual share) |\n")
        f.write("|---|---|---|---|\n")
        for i in range(8):
            stat = "Yes" if l[i] >=0 else "No"
            f.write(f"| {i+1} | {stat} | {l[i]} | {', '.join(t[i])} |\n")
            
        f.write("\n## 5. Fault Detection (20% mask)\n")
        f.write(f"**Detected:** {dm}/8\n\n")
        f.write("| Fault | Detected | Delay (rows) | Top 3 Channels |\n")
        f.write("|---|---|---|---|\n")
        for i in range(8):
            stat = "Yes" if lm[i] >=0 else "No"
            f.write(f"| {i+1} | {stat} | {lm[i]} | {', '.join(tm[i])} |\n")

if __name__ == '__main__':
    run()
