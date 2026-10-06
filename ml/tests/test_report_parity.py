import json
import pytest
import numpy as np
import pandas as pd
from pathlib import Path

BASE_DIR    = Path(__file__).parent.parent
REPORTS_DIR = BASE_DIR / "reports"
ROOT_DIR    = BASE_DIR.parent

def test_results_json_parity_with_csvs():
    """Test that every number in results.json strictly matches the source CSVs."""
    results_path = REPORTS_DIR / "results.json"
    assert results_path.exists(), "results.json does not exist"
    
    with open(results_path, "r", encoding="utf-8") as f:
        results = json.load(f)
        
    # 1. Phase 2 8-fault table & Detection curve
    df_p2 = pd.read_csv(REPORTS_DIR / "phase2_8fault_table.csv")
    df_curve = pd.read_csv(REPORTS_DIR / "detection_budget_curve.csv")
    
    det = results["detection_evaluation"]
    ridge_op = df_curve[(df_curve['model'].str.contains('Ridge')) & (df_curve['budget'] == 1.0)].iloc[0]
    gru_op   = df_curve[(df_curve['model'].str.contains('GRU')) & (df_curve['budget'] == 1.0)].iloc[0]
    z_op     = df_curve[(df_curve['model'].str.contains('Z-Score')) & (df_curve['budget'] == 1.0)].iloc[0]
    
    # Check Ridge primary
    assert np.isclose(det["ridge_primary"]["recall"], ridge_op["recall"], atol=1e-4)
    assert np.isclose(det["ridge_primary"]["val_fp_per_day"], ridge_op["val_fp_per_day"], atol=1e-4)
    assert np.isclose(det["ridge_primary"]["precision"], ridge_op["precision"], atol=1e-4)
    assert np.isclose(det["ridge_primary"]["f1_score"], ridge_op["f1"], atol=1e-4)
    assert np.isclose(det["ridge_primary"]["mean_delay_rows"], ridge_op["mean_delay"], atol=1e-4)
    assert det["ridge_primary"]["detected_count"] == int(df_p2["detected"].sum())
    assert det["ridge_primary"]["total_faults"] == len(df_p2)
    
    # Check GRU comparison
    assert np.isclose(det["gru_comparison"]["recall"], gru_op["recall"], atol=1e-4)
    assert np.isclose(det["gru_comparison"]["val_fp_per_day"], gru_op["val_fp_per_day"], atol=1e-4)
    assert np.isclose(det["gru_comparison"]["precision"], gru_op["precision"], atol=1e-4)
    assert np.isclose(det["gru_comparison"]["f1_score"], gru_op["f1"], atol=1e-4)
    assert np.isclose(det["gru_comparison"]["mean_delay_rows"], gru_op["mean_delay"], atol=1e-4)
    
    # Check Z-score baseline
    assert np.isclose(det["z_score_baseline"]["recall"], z_op["recall"], atol=1e-4)
    assert np.isclose(det["z_score_baseline"]["val_fp_per_day"], z_op["val_fp_per_day"], atol=1e-4)
    assert np.isclose(det["z_score_baseline"]["precision"], z_op["precision"], atol=1e-4)
    assert np.isclose(det["z_score_baseline"]["f1_score"], z_op["f1"], atol=1e-4)
    
    # 2. Phase 4 Slow Drift
    df_p4 = pd.read_csv(REPORTS_DIR / "phase4_cusum_results.csv")
    drift_res = results["phase4_slow_drift"]
    assert drift_res["compliant_drifts_tested"] == len(df_p4)
    assert drift_res["limit_detected"] == int((df_p4["limit_detected"] == True).sum())
    assert drift_res["gru_detected"] == int((df_p4["gru_detected"] == True).sum())
    assert drift_res["cusum_detected"] == int((df_p4["cusum_detected"] == True).sum())
    assert np.isclose(drift_res["limit_recall"], float(df_p4["limit_detected"].mean()), atol=1e-4)
    assert np.isclose(drift_res["gru_recall"], float(df_p4["gru_detected"].mean()), atol=1e-4)
    assert np.isclose(drift_res["cusum_recall"], float(df_p4["cusum_detected"].mean()), atol=1e-4)
    delays_cus = df_p4['cusum_delay'].dropna().tolist()
    assert np.isclose(drift_res["min_cusum_delay"], float(min(delays_cus)), atol=1e-4)
    assert np.isclose(drift_res["mean_cusum_delay"], float(np.mean(delays_cus)), atol=1e-4)
    
    # 3. Phase 6 RCA
    df_p6 = pd.read_csv(REPORTS_DIR / "phase6_rca_results.csv")
    rca_res = results["phase6_rca"]
    assert rca_res["real_faults"]["total_evaluated"] == len(df_p6)
    assert np.isclose(rca_res["real_faults"]["top1_accuracy"], float(df_p6["top1_correct"].mean()), atol=1e-4)
    assert np.isclose(rca_res["real_faults"]["top3_accuracy"], float(df_p6["top3_correct"].mean()), atol=1e-4)
    
    # 4. Phase 7 Masking
    df_p7 = pd.read_csv(REPORTS_DIR / "phase7_confidence_results.csv")
    mask_res = results["phase7_masking_robustness"]
    assert len(mask_res) == len(df_p7)
    for i in range(len(df_p7)):
        assert np.isclose(mask_res[i]["mask_fraction"], df_p7.iloc[i]["mask_fraction"], atol=1e-4)
        assert np.isclose(mask_res[i]["calibrated_threshold"], df_p7.iloc[i]["calibrated_threshold"], atol=1e-4)
        assert np.isclose(mask_res[i]["recall"], df_p7.iloc[i]["recall"], atol=1e-4)
        assert np.isclose(mask_res[i]["false_episodes_per_day"], df_p7.iloc[i]["false_episodes_per_day"], atol=1e-4)
        assert np.isclose(mask_res[i]["rca_top1"], df_p7.iloc[i]["rca_top1"], atol=1e-4)
        assert np.isclose(mask_res[i]["rca_top3"], df_p7.iloc[i]["rca_top3"], atol=1e-4)
        assert np.isclose(mask_res[i]["mean_confidence"], df_p7.iloc[i]["mean_confidence"], atol=1e-4)

def test_evaluation_md_parity_with_csvs():
    """Test that numbers in EVALUATION.md strictly match the source CSVs."""
    eval_md_path = ROOT_DIR / "EVALUATION.md"
    assert eval_md_path.exists(), "EVALUATION.md does not exist"
    
    with open(eval_md_path, "r", encoding="utf-8") as f:
        md_text = f.read()
        
    df_p2 = pd.read_csv(REPORTS_DIR / "phase2_8fault_table.csv")
    df_curve = pd.read_csv(REPORTS_DIR / "detection_budget_curve.csv")
    df_p4 = pd.read_csv(REPORTS_DIR / "phase4_cusum_results.csv")
    df_p6 = pd.read_csv(REPORTS_DIR / "phase6_rca_results.csv")
    df_p7 = pd.read_csv(REPORTS_DIR / "phase7_confidence_results.csv")
    
    ridge_op = df_curve[(df_curve['model'].str.contains('Ridge')) & (df_curve['budget'] == 1.0)].iloc[0]
    
    # Check key figures are present in the markdown
    assert f"{ridge_op['recall']*100:.1f}%" in md_text
    assert f"{ridge_op['f1']:.4f}" in md_text
    assert f"{len(df_p4)}" in md_text
    assert f"{float(df_p6['top1_correct'].mean())*100:.1f}%" in md_text
    assert f"{float(df_p6['top3_correct'].mean())*100:.1f}%" in md_text
    
    # Check all 8 fault IDs are in the markdown table
    for fid in df_p2['fault_id']:
        assert f"**{fid}**" in md_text
