import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import json
import time
import ast
from pathlib import Path
from sklearn.linear_model import Ridge
from torch.utils.data import TensorDataset, DataLoader
from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.gru_forecaster import GRUForecaster
from spacecraft_rca.utils import set_global_seed

data_root = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
splits = json.load(open("artifacts/splits.json"))
modes = ["NOMINAL", "SAFE", "HIGH_LOAD", "COMM"]

torch.set_num_threads(4)
set_global_seed(42)

def make_windows(X, y, window_size=32):
    X_t = torch.tensor(X, dtype=torch.float32)
    y_t = torch.tensor(y, dtype=torch.float32)
    if len(X_t) <= window_size:
        return torch.empty(0), torch.empty(0)
    X_windows = X_t.unfold(0, window_size, 1).transpose(1, 2)
    X_w = X_windows[:-1].contiguous()
    y_targ = y_t[window_size:].contiguous()
    return X_w, y_targ

def ewma(arr, alpha=0.3):
    if len(arr) == 0: return np.array([])
    return pd.Series(arr).ewm(alpha=alpha, adjust=False).mean().values

def get_episodes(alerts):
    episodes = []
    start = -1
    for i, a in enumerate(alerts):
        if a == 1 and start == -1:
            start = i
        elif a == 0 and start != -1:
            episodes.append((start, i-1))
            start = -1
    if start != -1:
        episodes.append((start, len(alerts)-1))
    return episodes

def apply_persistence(scores, thresh, N=3):
    alerts = (scores > thresh).astype(float)
    if len(alerts) < N: return np.zeros_like(alerts)
    if N == 3:
        persist = (alerts + np.roll(alerts, 1) + np.roll(alerts, 2) >= 3).astype(float)
        persist[:2] = 0.0
        return persist
    # Fallback for arbitrary N using pandas rolling
    s = pd.Series(alerts)
    persist = (s.rolling(window=N, min_periods=N).sum() >= N).astype(float)
    return persist.fillna(0).values

def calibrate_threshold(scores_calib, target_far=0.005, N=3):
    # binary search for threshold
    low, high = 0.0, 50.0
    best_t = high
    for _ in range(50):
        mid = (low + high) / 2
        p = apply_persistence(scores_calib, mid, N)
        far = np.mean(p)
        if far <= target_far:
            best_t = mid
            high = mid
        else:
            low = mid
    return best_t

def run():
    print("Loading data...")
    df_clean = pd.read_csv(data_root / "data" / "synthetic_telemetry_clean.csv")
    df_imp = pd.read_csv(data_root / "data" / "synthetic_telemetry_imperfect.csv")
    faults = pd.read_csv(data_root / "data" / "fault_events_ground_truth.csv")
    
    sensor_cols = [c for c in df_clean.select_dtypes(include=[np.number]).columns if c not in ('timestamp', 'dq_score')]
    
    df_tr_raw = df_clean.iloc[splits["train"]].copy()
    df_ca_raw = df_clean.iloc[splits["calibration"]].copy()
    df_va_raw = df_clean.iloc[splits["validation_normal"]].copy()
    
    # Fit scaler on train split
    processor = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
    processor.sensor_cols = sensor_cols
    processor.fit_scaler(df_tr_raw)
    
    # Scale dataframes
    df_tr = processor.transform_scaler(df_tr_raw)
    df_ca = processor.transform_scaler(df_ca_raw)
    df_va = processor.transform_scaler(df_va_raw)
    
    # Process imperfect dataset (with mask columns but preserving length)
    df_imp_proc = df_imp.copy()
    for c in sensor_cols:
        df_imp_proc[f"{c}_is_missing"] = df_imp_proc[c].isna()
        df_imp_proc[c] = df_imp_proc[c].ffill(limit=2)
    df_imp_proc = processor.transform_scaler(df_imp_proc)
    
    def prep_array(df):
        X_sens = df[sensor_cols].fillna(0).values
        y = X_sens.copy()
        mode_oh = np.zeros((len(df), 4))
        for i, m in enumerate(modes):
            mode_oh[:, i] = (df['mode'] == m).astype(float)
        missing_cols = [f"{c}_is_missing" for c in sensor_cols]
        X_mask = np.zeros((len(df), 23))
        for i, mc in enumerate(missing_cols):
            if mc in df.columns: X_mask[:, i] = df[mc].astype(float)
        X = np.concatenate([X_sens, mode_oh, X_mask], axis=1)
        return X, y
        
    X_tr, y_tr = prep_array(df_tr)
    X_ca, y_ca = prep_array(df_ca)
    X_va, y_va = prep_array(df_va)
    X_imp, y_imp = prep_array(df_imp_proc)
    
    Xw_tr, yw_tr = make_windows(X_tr, y_tr)
    Xw_ca, yw_ca = make_windows(X_ca, y_ca)
    Xw_va, yw_va = make_windows(X_va, y_va)
    Xw_imp, yw_imp = make_windows(X_imp, y_imp)
    
    train_ds = TensorDataset(Xw_tr, yw_tr)
    train_loader = DataLoader(train_ds, batch_size=256, shuffle=True, num_workers=0)
    
    model = GRUForecaster(input_dim=50, hidden_dim=64, num_layers=2, output_dim=23, dropout=0.2)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.MSELoss()
    
    print("Training GRU...")
    epochs = 20
    for epoch in range(epochs):
        model.train()
        for bx, by in train_loader:
            mask = torch.rand(bx.shape[0], 23) < 0.1
            if mask.any():
                mask_exp = mask.unsqueeze(1).expand(-1, 32, -1)
                bx[:, :, :23][mask_exp] = 0.0
                bx[:, :, 27:50][mask_exp] = 1.0
            optimizer.zero_grad()
            loss = criterion(model(bx), by)
            loss.backward()
            optimizer.step()
            
    print("Training Ridge Baseline (sag solver)...")
    ridge = Ridge(alpha=1.0, solver='sag', max_iter=20)
    Xw_tr_flat = Xw_tr.reshape(Xw_tr.shape[0], -1).numpy()
    ridge.fit(Xw_tr_flat, yw_tr.numpy())
    print("Ridge fit finished.")
    
    def get_res_gru(Xw, yw, mask_cols=None):
        print(f"Running get_res_gru for len={len(Xw)}, mask={bool(mask_cols)}")
        model.eval()
        X_test = Xw.clone()
        if mask_cols:
            for c in mask_cols:
                idx = sensor_cols.index(c)
                X_test[:, :, idx] = 0.0
                X_test[:, :, 27 + idx] = 1.0
        preds = []
        batch_size = 256
        with torch.no_grad():
            for i in range(0, len(X_test), batch_size):
                if i % 10240 == 0: print(f"  Batch {i}/{len(X_test)}")
                preds.append(model(X_test[i:i+batch_size]))
        preds = torch.cat(preds, dim=0)
        return torch.abs(preds - yw).numpy()
        
    def get_res_ridge(Xw, yw, mask_cols=None):
        X_test = Xw.clone()
        if mask_cols:
            for c in mask_cols:
                idx = sensor_cols.index(c)
                X_test[:, :, idx] = 0.0
                X_test[:, :, 27 + idx] = 1.0
        X_test_flat = X_test.reshape(X_test.shape[0], -1).numpy()
        preds = []
        batch_size = 2048
        for i in range(0, len(X_test_flat), batch_size):
            preds.append(ridge.predict(X_test_flat[i:i+batch_size]))
        preds = np.concatenate(preds, axis=0)
        return np.abs(preds - yw.numpy())
        
    res_ca_gru = get_res_gru(Xw_ca, yw_ca)
    res_va_gru = get_res_gru(Xw_va, yw_va)
    
    res_ca_rdg = get_res_ridge(Xw_ca, yw_ca)
    res_va_rdg = get_res_ridge(Xw_va, yw_va)
    
    s_c_gru = np.percentile(res_ca_gru, 99, axis=0)
    s_c_rdg = np.percentile(res_ca_rdg, 99, axis=0)
    
    sm_ca_gru, _ = combine_and_thresh(res_ca_gru, s_c_gru)
    sm_va_gru, _ = combine_and_thresh(res_va_gru, s_c_gru)
    
    sm_ca_rdg, _ = combine_and_thresh(res_ca_rdg, s_c_rdg)
    sm_va_rdg, _ = combine_and_thresh(res_va_rdg, s_c_rdg)
    
    print("\n2. Residuals identically computed for Calib and Val-Normal")
    print("GRU Combined Score (Calib vs Val):")
    print(f"  Mean: {np.mean(sm_ca_gru):.4f} vs {np.mean(sm_va_gru):.4f}")
    print(f"  Std:  {np.std(sm_ca_gru):.4f} vs {np.std(sm_va_gru):.4f}")
    print(f"  P99:  {np.percentile(sm_ca_gru, 99):.4f} vs {np.percentile(sm_va_gru, 99):.4f}")
    
    thresh_gru = calibrate_threshold(sm_ca_gru, target_far=0.005)
    thresh_rdg = calibrate_threshold(sm_ca_rdg, target_far=0.005)
    print(f"\n3. Calibrated Thresholds: GRU={thresh_gru:.4f}, Ridge={thresh_rdg:.4f}")
    
    # 4. Z-score on raw values
    z_stats = {}
    for m in df_ca_raw['mode'].unique():
        df_m = df_ca_raw[df_ca_raw['mode'] == m][sensor_cols]
        z_stats[m] = {'mean': df_m.mean().fillna(0).values, 'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values}
        
    def eval_zscore(df_raw, win_offset=0):
        z_alerts = np.zeros(len(df_raw))
        z_raw = df_raw[sensor_cols].ffill().fillna(0).values
        modes_arr = df_raw['mode'].values
        
        means = np.zeros((len(df_raw), len(sensor_cols)))
        stds = np.ones((len(df_raw), len(sensor_cols)))
        
        for m, stats in z_stats.items():
            mask = (modes_arr == m)
            if np.any(mask):
                means[mask] = stats['mean']
                stds[mask] = stats['std']
                
        z = np.abs(z_raw - means) / stds
        z_alerts = (np.max(z, axis=1) > 3.0).astype(float)
        return z_alerts[win_offset:]
        
    z_alerts_va = eval_zscore(df_va_raw, 32)
    p_va_gru = apply_persistence(sm_va_gru, thresh_gru)
    p_va_rdg = apply_persistence(sm_va_rdg, thresh_rdg)
    
    def print_far(name, alerts):
        days = len(alerts) / 1440.0
        far_row = np.mean(alerts)
        eps = len(get_episodes(alerts))
        print(f"{name}: Row FAR={far_row:.6f}, Episodes/Day={eps/days:.2f} ({eps} total in {days:.2f} days)")
        
    print("\n4. Val-Normal False Alerts:")
    print_far("Z-score", z_alerts_va)
    print_far("GRU    ", p_va_gru)
    print_far("Ridge  ", p_va_rdg)
    
    # 5. Full 80k Detection
    res_imp_gru = get_res_gru(Xw_imp, yw_imp)
    sm_imp_gru, rc_imp_gru = combine_and_thresh(res_imp_gru, s_c_gru)
    p_imp_gru = apply_persistence(sm_imp_gru, thresh_gru)
    
    res_imp_rdg = get_res_ridge(Xw_imp, yw_imp)
    sm_imp_rdg, rc_imp_rdg = combine_and_thresh(res_imp_rdg, s_c_rdg)
    p_imp_rdg = apply_persistence(sm_imp_rdg, thresh_rdg)
    
    z_alerts_imp = eval_zscore(df_imp, 32)
    
    def evaluate_detection(alerts, rc_imp):
        eps = get_episodes(alerts)
        detected_delays = []
        top_channels = []
        overlaps = []
        false_eps = 0
        
        # fault window ranges (in window indices: original_row - 32)
        fw_ranges = []
        for _, f in faults.iterrows():
            fw_ranges.append((f['start_row'] - 32, f['end_row'] - 32, f['affected_signals']))
            
        for ep_start, ep_end in eps:
            is_fault = False
            for f_idx, (f_s, f_e, aff_sig_str) in enumerate(fw_ranges):
                if f_s <= ep_start <= f_e:
                    # check no alert in 30 rows prior
                    prior_start = max(0, ep_start - 30)
                    if not np.any(alerts[prior_start:ep_start]):
                        is_fault = True
                        if len(detected_delays) == f_idx:
                            detected_delays.append(ep_start - f_s)
                            rc = rc_imp[ep_start]
                            top3_idx = np.argsort(rc)[::-1][:3]
                            top3 = [sensor_cols[i] for i in top3_idx]
                            top_channels.append(top3)
                            
                            if pd.isna(aff_sig_str): aff = []
                            else: aff = str(aff_sig_str).split(';')
                            ov = len(set(top3).intersection(aff))
                            overlaps.append(ov)
                        break
            if not is_fault:
                false_eps += 1
                
        return detected_delays, top_channels, overlaps, false_eps
        
    def print_det(name, alerts, rc):
        d, t, o, fe = evaluate_detection(alerts, rc)
        print(f"\n{name} Full 80k Detection:")
        print(f"False Alert Episodes outside faults: {fe}")
        for i in range(len(faults)):
            if i < len(d):
                print(f"F{i+1}: Delay={d[i]:2d} | Overlap={o[i]}/3 | Top: {t[i]}")
            else:
                print(f"F{i+1}: Missed")
        if o: print(f"Mean Overlap: {np.mean(o):.2f}")
        
    print_det("GRU", p_imp_gru, rc_imp_gru)
    
    # Masking check
    np.random.seed(42)
    random_mask = np.random.choice(sensor_cols, size=int(0.2*23), replace=False).tolist()
    print(f"\n7. Masking 20% random channels at inference: {random_mask}")
    
    res_mask_gru = get_res_gru(Xw_imp, yw_imp, random_mask)
    # Exclude masked channels from score and attribution
    for c in random_mask:
        res_mask_gru[:, sensor_cols.index(c)] = 0.0
    sm_mask_gru, rc_mask_gru = combine_and_thresh(res_mask_gru, s_c_gru)
    p_mask_gru = apply_persistence(sm_mask_gru, thresh_gru)
    
    print_det("GRU (20% Masked)", p_mask_gru, rc_mask_gru)

    print("\nTargeted Masking of #1 channel for Fault 1...")
    # Get F1 top channel from unmasked
    d, t, o, _ = evaluate_detection(p_imp_gru, rc_imp_gru)
    f1_top = [t[0][0]]
    res_f1_mask = get_res_gru(Xw_imp, yw_imp, f1_top)
    res_f1_mask[:, sensor_cols.index(f1_top[0])] = 0.0
    sm_f1_mask, rc_f1_mask = combine_and_thresh(res_f1_mask, s_c_gru)
    p_f1_mask = apply_persistence(sm_f1_mask, thresh_gru)
    print_det(f"GRU (Masked {f1_top})", p_f1_mask, rc_f1_mask)

def combine_and_thresh(res, s_c):
    s_c = np.where(s_c < 1e-6, 1e-6, s_c)
    r_c = res / s_c
    score = np.max(r_c, axis=1)
    return ewma(score, alpha=0.3), r_c

if __name__ == '__main__':
    run()
