import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
os.environ["DISABLE_PANDERA_IMPORT_WARNING"] = "True"

import numpy as np
import pandas as pd
from pathlib import Path
from scipy.stats import theilslopes
from spacecraft_rca.data.loaders import load_metadata_file
from spacecraft_rca.models.time_to_limit import TimeToLimitProjector

DATA_ROOT    = Path("../INITIUM_TECHFEST_2026_27_DATA_PACK")
CACHE_DIR    = Path("artifacts/cache")
REPORTS_DIR  = Path("reports"); REPORTS_DIR.mkdir(exist_ok=True)
CONTEXT_PRE  = 64

print("================================================================================")
print("  STEP 8: Offline Lead Time Evaluation (8 Real Faults + Gradual / Drift Set)")
print("================================================================================")

# 1. Load metadata & caches
sig_cat = load_metadata_file(DATA_ROOT, "signal_catalog.csv")
sensor_cols = sig_cat['signal'].tolist()
n_sensors   = len(sensor_cols)
sig_to_idx  = {s: i for i, s in enumerate(sensor_cols)}

hi_limits = np.load(CACHE_DIR / "hi_limits.npy")
lo_limits = np.load(CACHE_DIR / "lo_limits.npy")

df_imp = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_imperfect.csv")
df_gt  = pd.read_csv(DATA_ROOT / "data" / "fault_events_ground_truth.csv")
df_p2  = pd.read_csv(REPORTS_DIR / "phase2_8fault_table.csv")
df_p2_gru = pd.read_csv(REPORTS_DIR / "phase2_8fault_table_gru.csv") if (REPORTS_DIR / "phase2_8fault_table_gru.csv").exists() else None

# Map alert rows from primary (Ridge) and comparison (GRU)
alert_map_ridge = dict(zip(df_p2['fault_id'], df_p2['alert_row']))
limit_alarm_map = dict(zip(df_p2['fault_id'], df_p2['limit_alarm_row']))
if df_p2_gru is not None:
    alert_map_gru = dict(zip(df_p2_gru['fault_id'], df_p2_gru['alert_row']))
else:
    alert_map_gru = {}

# 2. Compute first row where ANY affected signal crosses hard limit
print("\n--- 8 Real Faults: Lead Time Table ---")
header = f"{'fault_id':8} {'fault_type':26} {'limit_alarm_row':16} {'our_alert_row':14} {'lead_rows':11} {'first_aff_limit_cross':23} {'lead_vs_hazard':14}"
print(header)
print("-" * len(header))

fault_records = []
for _, r in df_gt.iterrows():
    fid   = r['fault_id']
    ftype = r['fault_type']
    s_row = int(r['start_row'])
    e_row = int(r['end_row'])
    
    # Affected signals (semicolon-separated)
    aff_sigs = [s.strip() for s in r['affected_signals'].replace(',', ';').split(';') if s.strip()]
    
    # Search for first crossing of affected signals from start_row onwards
    first_aff_cross = None
    first_aff_sig = None
    search_end = min(len(df_imp), e_row + 500)
    for row_idx in range(s_row, search_end):
        for s in aff_sigs:
            if s not in sig_to_idx:
                continue
            idx = sig_to_idx[s]
            val = df_imp.at[row_idx, s]
            if pd.isna(val):
                continue
            if val > hi_limits[idx] or val < lo_limits[idx]:
                first_aff_cross = row_idx
                first_aff_sig = s
                break
        if first_aff_cross is not None:
            break
            
    lim_alarm_val = limit_alarm_map.get(fid)
    if pd.isna(lim_alarm_val) or lim_alarm_val == "" or lim_alarm_val is None:
        lim_alarm_str = "none"
        lim_alarm_num = None
    else:
        lim_alarm_num = int(float(lim_alarm_val))
        lim_alarm_str = str(lim_alarm_num)
        
    al_row = alert_map_ridge.get(fid)
    if al_row is not None and not pd.isna(al_row):
        al_row = int(al_row)
        al_str = str(al_row)
    else:
        al_row = None
        al_str = "miss"
        
    # Lead rows = limit_alarm_row - alert_row (reported as positive and negative as they are)
    if lim_alarm_num is not None and al_row is not None:
        lead_val = lim_alarm_num - al_row
        lead_str = f"{lead_val:+d}"
    else:
        lead_val = None
        lead_str = "never"
        
    # First affected limit cross string
    if first_aff_cross is not None:
        aff_cross_str = f"{first_aff_cross} ({first_aff_sig})"
        hazard_row = first_aff_cross
    else:
        aff_cross_str = "never"
        hazard_row = None
        
    # Lead vs hazard time
    if hazard_row is not None and al_row is not None:
        lead_hazard = hazard_row - al_row
        lead_hazard_str = f"{lead_hazard:+d} rows"
    else:
        lead_hazard = None
        lead_hazard_str = "never"
        
    print(f"{fid:8} {ftype:26} {lim_alarm_str:16} {al_str:14} {lead_str:11} {aff_cross_str:23} {lead_hazard_str:14}")
    
    fault_records.append({
        "fault_id": fid,
        "fault_type": ftype,
        "limit_alarm_row": lim_alarm_str,
        "our_alert_row": al_str,
        "lead_rows": lead_str,
        "first_aff_limit_cross": aff_cross_str,
        "lead_vs_hazard": lead_hazard_str
    })

# 3. Gradual Faults Analysis (F001, F006, and Drift Set)
print("\n" + "=" * 80)
print("  STEP 9: TIME-TO-LIMIT (Theil-Sen Robust Projection on Last 30 Rows)")
print("================================================================================")

ttl_projector = TimeToLimitProjector(hi_limits, lo_limits, sensor_cols)

print("\n--- Gradual Real Faults Evaluation ---")
gradual_faults = ["F001", "F006"]
for fid in gradual_faults:
    row_gt = df_gt[df_gt['fault_id'] == fid].iloc[0]
    al_row = int(alert_map_ridge[fid]) if alert_map_ridge.get(fid) else int(row_gt['start_row'] + 30)
    aff_sigs = [s.strip() for s in row_gt['affected_signals'].replace(',', ';').split(';') if s.strip()]
    
    # Top residual channels from the fault window
    w_df = df_imp.iloc[al_row - 29 : al_row + 1]
    
    # Run TTL projector on affected signals
    ttl_res = ttl_projector.evaluate(w_df, aff_sigs, alpha=0.80)
    
    # True hazard time (first hard limit crossing)
    hazard_info = [r for r in fault_records if r['fault_id'] == fid][0]
    first_cross = hazard_info['first_aff_limit_cross']
    
    print(f"\nFault {fid} ({row_gt['fault_type']}): Alert Row = {al_row}")
    print(f"  Top Channels Evaluated: {aff_sigs[:3]}")
    print(f"  Actual Hard Limit Crossing: {first_cross}")
    
    if ttl_res['status'] == "PROJECTED":
        proj_cross = al_row + ttl_res['median_rows']
        range_rows = [al_row + ttl_res['range_80'][0], al_row + ttl_res['range_80'][1]]
        print(f"  TTL Projection: {ttl_res['median_rows']:.1f} rows (Projected Crossing: {proj_cross:.1f})")
        print(f"  80% Range: [{range_rows[0]:.1f}, {range_rows[1]:.1f}] rows (Channel: {ttl_res['critical_channel']})")
        if first_cross != "never":
            actual_row = int(first_cross.split()[0])
            err = abs(proj_cross - actual_row)
            true_lead = actual_row - al_row
            print(f"  Absolute Error: {err:.1f} rows | True Lead: {true_lead} rows")
            if err > true_lead:
                print(f"  [NOTE] Error ({err:.1f}) is LARGER than true lead ({true_lead}).")
            else:
                print(f"  [NOTE] Error ({err:.1f}) is SMALLER than true lead ({true_lead}).")
    else:
        print(f"  TTL Projection: no crossing projected (slope is not significant or stationary)")
        print(f"  True Hazard Crossing: {first_cross}")

# 4. Slow Drift Set Evaluation
print("\n--- Slow Drift Benchmark (Theil-Sen TTL Evaluation) ---")
with open("artifacts/splits.json") as f: splits = json.load(f)
val_norm_raw = np.array(splits.get('validation_normal', splits.get('validation', [])))
df_clean = pd.read_csv(DATA_ROOT / "data" / "synthetic_telemetry_clean.csv")
df_normal = df_clean.iloc[val_norm_raw].copy().reset_index(drop=True)

df_inj_gt = pd.read_csv(REPORTS_DIR / "phase3_injected_ground_truth.csv")
drift_events = df_inj_gt[df_inj_gt['fault_type'] == 'slow_drift'].copy().reset_index(drop=True)
violators = {'INJ_DRIFT_005', 'INJ_DRIFT_006', 'INJ_DRIFT_012'}
drift_events = drift_events[~drift_events['fault_id'].isin(violators)].reset_index(drop=True)

drift_ttl_records = []
drift_hazard_records = []

for idx, ev in drift_events.iterrows():
    fid   = ev['fault_id']
    s_row = int(ev['start_row'])
    e_row = int(ev['end_row'])
    sig   = ev['affected_signals']
    peak_delta = float(ev['peak_delta'])
    sig_idx = sig_to_idx[sig]
    hi = hi_limits[sig_idx]
    lo = lo_limits[sig_idx]
    
    dur = e_row - s_row
    slope_true = peak_delta / dur
    target_lim = hi if slope_true > 0 else lo
    
    # Construct slice with extended continuation ramp to find true limit crossing row
    df_slice = df_normal.iloc[s_row - 64 : e_row + 1500].copy().reset_index(drop=True)
    ramp_len = len(df_slice) - 64
    ramp = np.arange(ramp_len) * slope_true
    df_slice.loc[64:, sig] += ramp
    
    vals = df_slice[sig].values[64:]
    if slope_true > 0:
        crossings = np.where(vals > hi)[0]
    else:
        crossings = np.where(vals < lo)[0]
        
    true_cross_rel = int(crossings[0]) if len(crossings) else None
    
    # Alert row: alert occurs during the drift ramp (e.g. at 40% of duration or minimum 30 steps)
    alert_rel = min(dur - 10, max(30, int(dur * 0.45)))
    alert_abs = s_row + alert_rel
    
    # Fit Theil-Sen on the last 30 rows ending at alert_rel
    w_vals = vals[alert_rel - 29 : alert_rel + 1]
    res = theilslopes(w_vals, np.arange(30), alpha=0.80)
    
    # Check slope significance
    sig_is_sig = (res.low_slope > 0) if slope_true > 0 else (res.high_slope < 0)
    
    if sig_is_sig and res.slope != 0:
        if slope_true > 0:
            ttl_med = (hi - w_vals[-1]) / res.slope
            ttl_min = (hi - w_vals[-1]) / res.high_slope
            ttl_max = (hi - w_vals[-1]) / res.low_slope
        else:
            ttl_med = (lo - w_vals[-1]) / res.slope
            ttl_min = (lo - w_vals[-1]) / res.high_slope
            ttl_max = (lo - w_vals[-1]) / res.low_slope
            
        proj_cross_rel = alert_rel + ttl_med
        range_min_rel = alert_rel + ttl_min
        range_max_rel = alert_rel + ttl_max
        if range_min_rel > range_max_rel:
            range_min_rel, range_max_rel = range_max_rel, range_min_rel
            
        err = abs(proj_cross_rel - true_cross_rel) if true_cross_rel else None
        in_range = (range_min_rel <= true_cross_rel <= range_max_rel) if true_cross_rel else False
        true_lead = (true_cross_rel - alert_rel) if true_cross_rel else None
        err_larger = (err > true_lead) if (err is not None and true_lead is not None) else False
        
        drift_ttl_records.append({
            'fault_id': fid, 'signal': sig, 'alert_rel': alert_rel,
            'true_cross_rel': true_cross_rel, 'proj_cross_rel': round(proj_cross_rel, 1),
            'err_rows': round(err, 1) if err is not None else None,
            'in_80_range': in_range,
            'range_80': [round(range_min_rel, 1), round(range_max_rel, 1)],
            'true_lead_rows': true_lead,
            'err_larger_than_lead': err_larger
        })
        
    drift_hazard_records.append({
        'fault_id': fid, 'hazard_time_rel': true_cross_rel,
        'alert_time_rel': alert_rel, 'lead_vs_hazard': (true_cross_rel - alert_rel) if true_cross_rel else "never"
    })

df_drift_ttl = pd.DataFrame(drift_ttl_records)
print(f"\nEvaluated {len(df_drift_ttl)} / {len(drift_events)} slow-drift series with statistically significant slope:")
print(f"  • Median Absolute Error: {df_drift_ttl['err_rows'].median():.1f} rows")
print(f"  • Crossings Inside 80% Range: {df_drift_ttl['in_80_range'].mean() * 100:.1f}% ({df_drift_ttl['in_80_range'].sum()}/{len(df_drift_ttl)})")
larger_count = df_drift_ttl['err_larger_than_lead'].sum()
print(f"  • Events where Error > True Lead: {larger_count} / {len(df_drift_ttl)} ({larger_count / len(df_drift_ttl) * 100:.1f}%)")

# Save outputs
df_out = pd.DataFrame(fault_records)
df_out.to_csv(REPORTS_DIR / "lead_time_8fault_table.csv", index=False)
df_drift_ttl.to_csv(REPORTS_DIR / "time_to_limit_drift_evaluation.csv", index=False)
print(f"\nSaved reports to {REPORTS_DIR / 'lead_time_8fault_table.csv'} and {REPORTS_DIR / 'time_to_limit_drift_evaluation.csv'}")
