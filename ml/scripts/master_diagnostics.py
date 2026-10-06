"""
Master Diagnostics Script for Sections B and C
Raw output, real data from artifacts/cache, no tuning on faults, mark [BAD].
"""
import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
import torch
from pathlib import Path
from sklearn.linear_model import Ridge
from scipy.optimize import minimize_scalar

from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.data.quality import TelemetryQualityProcessor

DATA_ROOT   = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR   = Path("artifacts/cache")
REPORTS_DIR = Path("reports")
ROWS_PER_DAY = 1440

def ewma(arr, alpha=0.3):
    out = np.empty_like(arr)
    out[0] = arr[0]
    for i in range(1, len(arr)):
        out[i] = alpha * arr[i] + (1 - alpha) * out[i-1]
    return out

def persistence_alerts(score, threshold, win=3):
    binary = (score >= threshold)
    if len(binary) < win:
        return np.zeros(len(binary), dtype=int)
    alert = np.zeros(len(binary), dtype=int)
    alert[win - 1:] = (binary[2:] & binary[1:-1] & binary[:-2]).astype(int)
    return alert

def episodes_from_alerts(alerts, gap=10):
    idx = np.where(alerts > 0)[0]
    if len(idx) == 0:
        return []
    splits = np.where(np.diff(idx) > gap)[0]
    starts = np.insert(idx[splits + 1], 0, idx[0])
    ends = np.append(idx[splits], idx[-1])
    return list(zip(starts, ends))

def find_delay(alerts, start, end, lookahead=100):
    window = alerts[start : min(end + lookahead, len(alerts))]
    hits = np.where(window)[0]
    return int(hits[0]) if len(hits) else None

def cusum_onset(signal_residuals, delta=0.3, h=5.0):
    s_pos = 0.0
    for t, x in enumerate(signal_residuals):
        s_pos = max(0.0, s_pos + x - delta)
        if s_pos >= h:
            return t
    return None

def run_diagnostics():
    print("=" * 80)
    print("B. DETECTION DIAGNOSTIC (NO TUNING ON FAULTS)")
    print("=" * 80)

    # Load splits & ground truth
    with open("artifacts/splits.json") as f:
        splits = json.load(f)
    cal_idx_raw  = np.array(splits['calibration'])
    val_norm_raw = np.array(splits['validation_normal'])
    train_idx    = np.array(splits['train'])
    
    df_gt = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")
    sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
    sensor_cols = sig_cat['signal'].tolist()
    n_ch = len(sensor_cols)
    
    # Cache alignment: cache starts at row 32
    CAL_OFFSET = 32
    cal_idx = cal_idx_raw[cal_idx_raw >= CAL_OFFSET] - CAL_OFFSET
    val_idx = val_norm_raw[val_norm_raw >= CAL_OFFSET] - CAL_OFFSET
    
    residuals = np.load(CACHE_DIR / "residuals.npy")
    n_rows, _ = residuals.shape
    cal_idx = cal_idx[cal_idx < n_rows]
    val_idx = val_idx[val_idx < n_rows]
    
    # B.3 Cache Check: compare raw unnormalized vs channel-normalized
    print("\n--- B.3 Cache Check (residuals and score distributions) ---")
    cal_raw_res = residuals[cal_idx]
    val_raw_res = residuals[val_idx]
    
    raw_cal_max = cal_raw_res.max(axis=1)
    raw_val_max = val_raw_res.max(axis=1)
    print(f"Raw Max Residual in Cache:")
    print(f"  Calibration:       mean={raw_cal_max.mean():.4f}, P99={np.percentile(raw_cal_max, 99):.4f}")
    print(f"  Validation-Normal: mean={raw_val_max.mean():.4f}, P99={np.percentile(raw_val_max, 99):.4f}")
    
    # Channel normalized (P99 per-channel normalization from calibration)
    th_ch = np.percentile(cal_raw_res, 99.0, axis=0)
    th_ch = np.where(th_ch < 1e-6, 1e-6, th_ch)
    
    norm_cal_res = cal_raw_res / th_ch
    norm_val_res = val_raw_res / th_ch
    
    norm_cal_comb = norm_cal_res.max(axis=1)
    norm_val_comb = norm_val_res.max(axis=1)
    
    norm_cal_smooth = ewma(norm_cal_comb, alpha=0.3)
    norm_val_smooth = ewma(norm_val_comb, alpha=0.3)
    
    print(f"\nChannel-Normalized Scores (P99 per-channel scaled):")
    print(f"  Calibration:       mean={norm_cal_smooth.mean():.4f}, P99={np.percentile(norm_cal_smooth, 99):.4f}")
    print(f"  Validation-Normal: mean={norm_val_smooth.mean():.4f}, P99={np.percentile(norm_val_smooth, 99):.4f}")
    print("  Reference baseline: earlier reported mean 0.8631 vs 0.8687, P99 1.1054 vs 1.1234")
    diff_p99 = abs(np.percentile(norm_cal_smooth, 99) - 1.1054)
    if diff_p99 > 0.15:
        print(f"  [BAD] Cache score P99 deviates by {diff_p99:.4f} from reference due to scaler/index definition.")
    else:
        print("  Cache check: closely aligned with reference distribution.")

    # We use the normalized combined score across all 80k rows for rigorous detector evaluation
    full_norm_res = residuals / th_ch
    full_score_max = full_norm_res.max(axis=1)
    full_score_smooth = ewma(full_score_max, alpha=0.3)
    
    # B.1 8 Real Faults Diagnostics
    print("\n--- B.1 8 Real Faults Diagnostic ---")
    cal_score_dist = full_score_smooth[cal_idx]
    
    # Calibrate threshold at budget 0.5 FP/day on calibration
    cal_days = len(cal_idx) / ROWS_PER_DAY
    thresh_05 = None
    for t_cand in np.percentile(cal_score_dist, np.arange(90, 100, 0.05)):
        al = persistence_alerts(cal_score_dist, t_cand)
        if len(episodes_from_alerts(al)) / cal_days <= 0.5:
            thresh_05 = float(t_cand); break
    if thresh_05 is None:
        thresh_05 = float(np.percentile(cal_score_dist, 99.9))
        
    print(f"Calibrated Threshold (budget <= 0.5 FP/day on calibration): {thresh_05:.4f}")
    print(f"{'Fault':6} | {'Subsystem':15} | {'Row Range':15} | {'Max Score':10} | {'Thresh':8} | {'Cal Percentile':15} | {'Status'}")
    print("-" * 88)
    for _, f in df_gt.iterrows():
        fid = f['fault_id']
        sub = f['source_subsystem']
        s_raw = int(f['start_row']); e_raw = int(f['end_row'])
        s_adj = max(0, s_raw - CAL_OFFSET); e_adj = min(n_rows - 1, e_raw - CAL_OFFSET)
        
        score_win = full_score_smooth[s_adj : e_adj + 1]
        max_score = float(score_win.max()) if len(score_win) > 0 else 0.0
        pctile = float((cal_score_dist <= max_score).mean() * 100.0)
        
        detected = max_score >= thresh_05
        status_str = "DETECTED" if detected else "[BAD] MISSED"
        print(f"{fid:6} | {sub:15} | [{s_raw:5}, {e_raw:5}] | {max_score:10.4f} | {thresh_05:8.4f} | {pctile:13.2f}% | {status_str}")

    # B.2 Recall vs False-Episodes-Per-Day Curve
    print("\n--- B.2 Recall vs False-Episodes-Per-Day Curve (Budgets: 0.5, 1, 2, 5, 10) ---")
    
    # Pre-train Ridge baseline
    print("Fitting Ridge baseline on train split...")
    df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
    qp = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
    qp.sensor_cols = sensor_cols
    qp.fit_scaler(df_clean.iloc[train_idx])
    
    df_clean_proc = qp.transform_scaler(df_clean)
    df_imp = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
    df_imp_proc = qp.transform_scaler(df_imp)
    
    # Simple lag-1 features for fast Ridge
    X_sens_clean = df_clean_proc[sensor_cols].fillna(0).values
    X_sens_imp   = df_imp_proc[sensor_cols].fillna(0).values
    
    ridge = Ridge(alpha=10.0)
    train_valid = train_idx[train_idx < len(X_sens_clean) - 1]
    ridge.fit(X_sens_clean[train_valid], X_sens_clean[train_valid + 1])
    
    ridge_preds_all = ridge.predict(X_sens_imp[:-1])
    ridge_res_all   = np.abs(ridge_preds_all - X_sens_imp[1:])
    
    # Ridge cal threshold
    cal_idx_r = cal_idx_raw[cal_idx_raw < len(ridge_res_all)]
    val_idx_r = val_norm_raw[val_norm_raw < len(ridge_res_all)]
    th_ch_rdg = np.percentile(ridge_res_all[cal_idx_r], 99.0, axis=0)
    th_ch_rdg = np.where(th_ch_rdg < 1e-6, 1e-6, th_ch_rdg)
    
    ridge_score_all = ewma((ridge_res_all / th_ch_rdg).max(axis=1), alpha=0.3)
    ridge_cal_dist  = ridge_score_all[cal_idx_r]
    
    # Z-score baseline
    mode_stats = {}
    for m in df_clean.iloc[cal_idx_raw]['mode'].unique():
        df_m = df_clean.iloc[cal_idx_raw]
        df_m = df_m[df_m['mode'] == m][sensor_cols]
        mode_stats[m] = {'mean': df_m.mean().fillna(0).values, 'std': df_m.std().replace(0, 1e-6).fillna(1e-6).values}
        
    z_all = np.zeros(len(df_imp))
    modes_arr = df_imp['mode'].values
    vals_arr = df_imp[sensor_cols].ffill().fillna(0).values
    for m, stats in mode_stats.items():
        idx_m = np.where(modes_arr == m)[0]
        if len(idx_m) > 0:
            diff = np.abs(vals_arr[idx_m] - stats['mean']) / stats['std']
            z_all[idx_m] = np.max(diff, axis=1)
    z_cal_dist = z_all[cal_idx_raw]

    budgets = [0.5, 1.0, 2.0, 5.0, 10.0]
    val_days = len(val_idx) / ROWS_PER_DAY
    
    def eval_model_curve(model_name, full_scores, cal_scores, val_indices):
        print(f"\nModel: {model_name}")
        print(f"{'Budget':8} | {'Thresh':8} | {'Val FP/day':11} | {'Events Det':10} | {'Recall':8} | {'Mean Delay':10} | {'Event Precision'}")
        print("-" * 88)
        for b in budgets:
            th = None
            for cand in np.percentile(cal_scores, np.arange(90, 100, 0.1)):
                al_c = persistence_alerts(cal_scores, cand) if model_name != "Z-score" else (cal_scores >= cand).astype(int)
                if len(episodes_from_alerts(al_c)) / cal_days <= b:
                    th = float(cand); break
            if th is None:
                th = float(np.percentile(cal_scores, 99.9))
                
            # Evaluate on val-normal
            val_sc = full_scores[val_indices]
            val_al = persistence_alerts(val_sc, th) if model_name != "Z-score" else (val_sc >= th).astype(int)
            val_eps = len(episodes_from_alerts(val_al))
            actual_fp_day = val_eps / val_days
            
            # Evaluate on 8 real faults
            all_al = persistence_alerts(full_scores, th) if model_name != "Z-score" else (full_scores >= th).astype(int)
            det_count = 0
            delays = []
            for _, f in df_gt.iterrows():
                s = int(f['start_row']); e = int(f['end_row'])
                if model_name == "GRU":
                    s = max(0, s - CAL_OFFSET); e = min(len(all_al)-1, e - CAL_OFFSET)
                delay = find_delay(all_al, s, e)
                if delay is not None:
                    det_count += 1
                    delays.append(delay)
                    
            rec = det_count / 8.0
            mean_delay = float(np.mean(delays)) if delays else 0.0
            prec = det_count / (det_count + val_eps) if (det_count + val_eps) > 0 else 0.0
            
            mark = " [BAD]" if rec < 0.5 else ""
            print(f"{b:8.1f} | {th:8.4f} | {actual_fp_day:11.3f} | {det_count:2d}/8       | {rec:7.1%} | {mean_delay:10.1f} | {prec:15.3f}{mark}")

    eval_model_curve("GRU", full_score_smooth, cal_score_dist, val_idx)
    eval_model_curve("Ridge", ridge_score_all, ridge_cal_dist, val_idx_r)
    eval_model_curve("Z-score", z_all, z_cal_dist, val_norm_raw)

    print("\n" + "=" * 80)
    print("C. ROOT CAUSE FIX & REAL EVALUATION")
    print("=" * 80)
    
    # C.1 Mapping & Subsystems
    print("\n--- C.1 Subsystem Label Set & Node Mappings ---")
    dep_graph = load_metadata_file(DATA_ROOT, "dependency_graph.csv")
    dag_nodes = sorted(set(dep_graph['source_subsystem'].tolist() + dep_graph['target_subsystem'].tolist()))
    gt_sources = sorted(df_gt['source_subsystem'].unique().tolist())
    sig_subs   = sorted(sig_cat['subsystem'].unique().tolist())
    
    print(f"DAG Nodes:          {dag_nodes}")
    print(f"GT Source Labels:   {gt_sources}")
    print(f"Signal Subsystems:  {sig_subs}")
    all_same = (set(gt_sources).issubset(set(dag_nodes))) and (set(dag_nodes) == set(sig_subs))
    print(f"Consistent Label Set Check: {'PASS' if all_same else '[BAD] Mismatch'}")
    
    sig_to_sub = dict(zip(sig_cat['signal'], sig_cat['subsystem']))
    print(f"\nSignal-to-Subsystem mapping samples (23 total):")
    for s, sub in list(sig_to_sub.items())[:6]:
        print(f"  {s:28} -> {sub}")

    # Build DAG adjacency
    adj = {sub: dep_graph.loc[dep_graph['target_subsystem'] == sub, 'source_subsystem'].tolist() for sub in sig_subs}

    # Load 60 injected subsystem faults
    inj_gt = pd.read_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv")
    inj_subs = inj_gt[inj_gt['fault_type'] == 'subsystem_fault'].copy()
    inj_subs_valid = inj_subs[inj_subs['start_row'].astype(int) < n_rows].copy()
    
    # C.2 Baselines: (a) Chance/Majority, (b) Largest Residual, (c) Earliest-Onset
    print("\n--- C.2 Root Cause Baselines Evaluation ---")
    
    # (a) Majority class baseline
    majority_class_real = df_gt['source_subsystem'].mode()[0]
    maj_t1_real = (df_gt['source_subsystem'] == majority_class_real).mean()
    maj_t3_real = 3.0 / len(sig_subs)  # Top-3 fixed chance
    
    majority_class_inj = inj_subs_valid['source_subsystem'].mode()[0]
    maj_t1_inj = (inj_subs_valid['source_subsystem'] == majority_class_inj).mean()
    maj_t3_inj = 3.0 / len(sig_subs)
    
    print(f"Baseline (a) Chance / Majority:")
    print(f"  8 Real Faults:    Top-1={maj_t1_real:.3f}, Top-3={maj_t3_real:.3f} (Majority class: {majority_class_real})")
    print(f"  60 Injected Subs: Top-1={maj_t1_inj:.3f}, Top-3={maj_t3_inj:.3f} (Majority class: {majority_class_inj})")

    # (b) Largest Residual in Alert Window
    def eval_baseline_b(events_df):
        t1_list = []; t3_list = []
        for _, ev in events_df.iterrows():
            s = max(0, int(ev['start_row']) - CAL_OFFSET); e = min(n_rows - 1, int(ev['end_row']) - CAL_OFFSET)
            true_src = ev['source_subsystem']
            win = full_norm_res[s : e + 1]
            if len(win) == 0:
                t1_list.append(0); t3_list.append(0); continue
            
            # Sum or max residual per subsystem
            sub_res = {sub: 0.0 for sub in sig_subs}
            for ch_idx, col in enumerate(sensor_cols):
                sub = sig_to_sub[col]
                sub_res[sub] = max(sub_res[sub], float(win[:, ch_idx].max()))
                
            ranked = sorted(sub_res.items(), key=lambda x: x[1], reverse=True)
            top3 = [r[0] for r in ranked[:3]]
            t1_list.append(int(top3[0] == true_src))
            t3_list.append(int(true_src in top3))
        return np.mean(t1_list), np.mean(t3_list)

    b_t1_real, b_t3_real = eval_baseline_b(df_gt)
    b_t1_inj, b_t3_inj   = eval_baseline_b(inj_subs_valid)
    print(f"\nBaseline (b) Subsystem with Largest Residual:")
    print(f"  8 Real Faults:    Top-1={b_t1_real:.3f}, Top-3={b_t3_real:.3f}")
    print(f"  60 Injected Subs: Top-1={b_t1_inj:.3f}, Top-3={b_t3_inj:.3f}")

    # (c) Earliest-Onset Channel (CUSUM onset searched in [s-30, s+60])
    def eval_baseline_c(events_df):
        t1_list = []; t3_list = []
        for _, ev in events_df.iterrows():
            s = int(ev['start_row']) - CAL_OFFSET; e = int(ev['end_row']) - CAL_OFFSET
            true_src = ev['source_subsystem']
            s_srch = max(0, s - 30); e_srch = min(n_rows - 1, s + 60)
            
            sub_onsets = {}
            for ch_idx, col in enumerate(sensor_cols):
                sub = sig_to_sub[col]
                ch_win = full_norm_res[s_srch : e_srch + 1, ch_idx]
                on = cusum_onset(ch_win)
                if on is not None:
                    if sub not in sub_onsets or on < sub_onsets[sub]:
                        sub_onsets[sub] = on
                        
            if not sub_onsets:
                # Fallback to max residual
                win = full_norm_res[max(0, s):min(n_rows, e+1)]
                sub_res = {sub: float(win[:, i].max()) for i, col in enumerate(sensor_cols) for sub in [sig_to_sub[col]]}
                ranked = sorted(sub_res.items(), key=lambda x: x[1], reverse=True)
            else:
                ranked = sorted(sub_onsets.items(), key=lambda x: x[1])
                
            top3 = [r[0] for r in ranked[:3]]
            t1_list.append(int(top3[0] == true_src))
            t3_list.append(int(true_src in top3))
        return np.mean(t1_list), np.mean(t3_list)

    c_t1_real, c_t3_real = eval_baseline_c(df_gt)
    c_t1_inj, c_t3_inj   = eval_baseline_c(inj_subs_valid)
    print(f"\nBaseline (c) Earliest-Onset Channel (CUSUM):")
    print(f"  8 Real Faults:    Top-1={c_t1_real:.3f}, Top-3={c_t3_real:.3f}")
    print(f"  60 Injected Subs: Top-1={c_t1_inj:.3f}, Top-3={c_t3_inj:.3f}")

    # C.3 Final Engine: Earliest Onset + DAG Upstream Trace
    print("\n--- C.3 Final Engine (Earliest Onset + DAG Scoring) ---")
    def score_final_engine(s_raw, e_raw):
        s = max(0, s_raw - CAL_OFFSET); e = min(n_rows - 1, e_raw - CAL_OFFSET)
        s_srch = max(0, s - 30); e_srch = min(n_rows - 1, s + 60)
        
        onsets = {}
        for ch_idx, col in enumerate(sensor_cols):
            ch_win = full_norm_res[s_srch : e_srch + 1, ch_idx]
            on = cusum_onset(ch_win)
            if on is not None:
                onsets[col] = s_srch + on
                
        sub_scores = {sub: 0.0 for sub in sig_subs}
        if onsets:
            earliest_t = min(onsets.values())
            for col, t in onsets.items():
                sub = sig_to_sub[col]
                # Timing score: inverse delay from earliest
                time_weight = 1.0 / (1.0 + 0.1 * (t - earliest_t))
                sub_scores[sub] += 2.0 * time_weight
                # DAG upstream bonus: if sub is upstream of flagged channels
                for up_sub in adj.get(sub, []):
                    sub_scores[up_sub] += 1.0 * time_weight
        else:
            # Fallback to residual magnitude in window
            win = full_norm_res[s : e + 1]
            if len(win) > 0:
                for ch_idx, col in enumerate(sensor_cols):
                    sub = sig_to_sub[col]
                    sub_scores[sub] += float(win[:, ch_idx].max())
                    
        return sub_scores

    # Temperature scaling fit
    print("Fitting Softmax Temperature on Injected-Train split...")
    inj_train = inj_subs_valid[inj_subs_valid['split'] == 'injected_train']
    if len(inj_train) == 0:
        inj_train = inj_subs_valid.iloc[:30]
        
    scores_list = []
    y_true_list = []
    for _, ev in inj_train.iterrows():
        sc = score_final_engine(int(ev['start_row']), int(ev['end_row']))
        scores_arr = np.array([sc[sub] for sub in sig_subs])
        scores_list.append(scores_arr)
        y_true_list.append(sig_subs.index(ev['source_subsystem']))
        
    scores_matrix = np.array(scores_list)
    y_true_arr = np.array(y_true_list)
    
    def nll(T):
        if T <= 0.01: return 1e9
        logits = scores_matrix / T
        logits_max = logits.max(axis=1, keepdims=True)
        exp_l = np.exp(logits - logits_max)
        probs = exp_l / exp_l.sum(axis=1, keepdims=True)
        eps = 1e-12
        loss = -np.log(probs[np.arange(len(y_true_arr)), y_true_arr] + eps).mean()
        return loss

    res_opt = minimize_scalar(nll, bounds=(0.05, 10.0), method='bounded')
    T_OPT = float(res_opt.x)
    print(f"Optimal Temperature: T={T_OPT:.3f} (Min NLL: {res_opt.fun:.4f})")
    
    def predict_rca(s_raw, e_raw):
        sc = score_final_engine(s_raw, e_raw)
        raw_vals = np.array([sc[sub] for sub in sig_subs])
        logits = (raw_vals - raw_vals.max()) / T_OPT
        exp_l = np.exp(logits)
        probs = exp_l / exp_l.sum()
        ranked = sorted(zip(sig_subs, probs), key=lambda x: x[1], reverse=True)
        return ranked

    # Evaluate Final Engine
    print("\nEvaluating Final Engine vs Baselines:")
    final_real_t1 = []; final_real_t3 = []; real_preds = []
    for _, f in df_gt.iterrows():
        ranked = predict_rca(int(f['start_row']), int(f['end_row']))
        true_src = f['source_subsystem']
        t1 = int(ranked[0][0] == true_src)
        t3 = int(true_src in [r[0] for r in ranked[:3]])
        final_real_t1.append(t1)
        final_real_t3.append(t3)
        real_preds.append((f['fault_id'], true_src, ranked[:3], t1, t3))

    final_inj_t1 = []; final_inj_t3 = []
    for _, ev in inj_subs_valid.iterrows():
        ranked = predict_rca(int(ev['start_row']), int(ev['end_row']))
        true_src = ev['source_subsystem']
        final_inj_t1.append(int(ranked[0][0] == true_src))
        final_inj_t3.append(int(true_src in [r[0] for r in ranked[:3]]))

    mean_f_r1 = np.mean(final_real_t1); mean_f_r3 = np.mean(final_real_t3)
    mean_f_i1 = np.mean(final_inj_t1); mean_f_i3 = np.mean(final_inj_t3)
    
    print(f"Final Engine Results:")
    print(f"  8 Real Faults:    Top-1={mean_f_r1:.3f}, Top-3={mean_f_r3:.3f}")
    print(f"  60 Injected Subs: Top-1={mean_f_i1:.3f}, Top-3={mean_f_i3:.3f}")
    
    beats_all = (mean_f_r1 >= max(b_t1_real, c_t1_real)) and (mean_f_i1 >= max(b_t1_inj, c_t1_inj))
    if beats_all:
        print("Verdict: Final DAG Engine beats or matches all baselines.")
    else:
        print("[BAD] Final Engine does not strictly beat earlier baselines across both splits. Reporting honest numbers.")

    print("\nPer-Fault Predicted Top-3 with Scores next to True Source:")
    for fid, true_src, top3, t1, t3 in real_preds:
        top3_str = " | ".join([f"{sub}({p:.3f})" for sub, p in top3])
        match_str = "MATCH" if t1 else ("TOP3" if t3 else "[BAD] MISS")
        print(f"  {fid:6} | True: {true_src:15} | Top-3: [{top3_str}] | {match_str}")

    # C.4 Confidence & Reliability Calibration
    print("\n--- C.4 Confidence Calibration & Reliability Bins ---")
    confs_correct = []
    confs_wrong   = []
    all_top1_probs = []
    all_correctness = []
    
    # Combined Real + Injected
    all_evs = list(df_gt.iterrows()) + list(inj_subs_valid.iterrows())
    for _, ev in all_evs:
        ranked = predict_rca(int(ev['start_row']), int(ev['end_row']))
        true_src = ev['source_subsystem']
        top1_sub, top1_prob = ranked[0]
        is_corr = int(top1_sub == true_src)
        
        all_top1_probs.append(top1_prob)
        all_correctness.append(is_corr)
        if is_corr:
            confs_correct.append(top1_prob)
        else:
            confs_wrong.append(top1_prob)

    mean_c_corr = float(np.mean(confs_correct)) if confs_correct else 0.0
    mean_c_wrng = float(np.mean(confs_wrong)) if confs_wrong else 0.0
    print(f"Mean Top-1 Probability When Correct: {mean_c_corr:.4f} (n={len(confs_correct)})")
    print(f"Mean Top-1 Probability When Wrong:   {mean_c_wrng:.4f} (n={len(confs_wrong)})")
    
    print("\nReliability Bins (Top-1 Probability Bins):")
    bins = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
    p_arr = np.array(all_top1_probs)
    c_arr = np.array(all_correctness)
    print(f"{'Bin Range':15} | {'Count':6} | {'Empirical Accuracy':20}")
    print("-" * 50)
    for b_idx in range(len(bins)-1):
        lo = bins[b_idx]; hi = bins[b_idx+1]
        mask_bin = (p_arr >= lo) & (p_arr < hi if b_idx < len(bins)-2 else p_arr <= hi)
        cnt = int(mask_bin.sum())
        acc = float(c_arr[mask_bin].mean()) if cnt > 0 else 0.0
        print(f"[{lo:.1f}, {hi:.1f}]         | {cnt:6d} | {acc:20.1%}")

    # C.5 Phase 7 Gate Check
    print("\n--- C.5 Phase 7 Confidence Gate ---")
    gate_pass = (mean_c_corr > mean_c_wrng) and (mean_c_corr >= 0.3)
    if gate_pass:
        print(f"PHASE 7 GATE: PASS (Proper probability scale: Correct={mean_c_corr:.3f} > Wrong={mean_c_wrng:.3f})")
    else:
        print(f"PHASE 7 GATE: FAIL [BAD] - Confidence not well separated on probability scale.")

if __name__ == "__main__":
    run_diagnostics()
