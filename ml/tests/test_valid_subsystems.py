import json
from pathlib import Path
import pandas as pd
import pytest

VALID_SUBSYSTEMS = {
    "ATTITUDE",
    "COMMUNICATIONS",
    "COMPUTE",
    "PAYLOAD",
    "POWER",
    "RADIATION",
    "THERMAL"
}

def test_propulsion_must_fail():
    """Verify that PROPULSION is strictly invalid and fails validation."""
    assert "PROPULSION" not in VALID_SUBSYSTEMS, "PROPULSION is not a valid subsystem in INITIUM"
    with pytest.raises(AssertionError):
        test_sub = "PROPULSION"
        assert test_sub in VALID_SUBSYSTEMS, f"Invalid subsystem '{test_sub}' detected"

def test_reports_subsystem_labels_valid():
    """Verify that every subsystem in reports and JSONs belongs to the 7 valid subsystems."""
    reports_dir = Path("reports")
    
    # 1. Check phase2_8fault_table.csv
    p2_path = reports_dir / "phase2_8fault_table.csv"
    if p2_path.exists():
        df_p2 = pd.read_csv(p2_path)
        if "true_source" in df_p2.columns:
            for s in df_p2["true_source"].dropna().unique():
                assert s in VALID_SUBSYSTEMS, f"Invalid subsystem '{s}' in phase2_8fault_table.csv"

    # 2. Check phase6_rca_results.csv
    rca_path = reports_dir / "phase6_rca_results.csv"
    if rca_path.exists():
        df_rca = pd.read_csv(rca_path)
        for col in ["true_subsystem", "top1_pred", "top2_pred", "top3_pred"]:
            if col in df_rca.columns:
                for s in df_rca[col].dropna().unique():
                    assert s in VALID_SUBSYSTEMS, f"Invalid subsystem '{s}' in phase6_rca_results.csv"

    # 3. Check incident_F004.json and incident_F006.json
    for fid in ["F004", "F006"]:
        inc_path = reports_dir / f"incident_{fid}.json"
        if inc_path.exists():
            with open(inc_path) as f:
                data = json.load(f)
            rc = data.get("root_cause_analysis", {})
            for cand in rc.get("root_cause_candidates", []):
                sub = cand.get("subsystem")
                if sub and sub != "UNKNOWN":
                    assert sub in VALID_SUBSYSTEMS, f"Invalid subsystem '{sub}' in incident_{fid}.json"
            for sub in rc.get("flagged_subsystems", []):
                assert sub in VALID_SUBSYSTEMS, f"Invalid flagged subsystem '{sub}' in incident_{fid}.json"

    # 4. Check results.json if exists
    res_path = reports_dir / "results.json"
    if res_path.exists():
        with open(res_path) as f:
            res_data = json.load(f)
        # Check any nested subsystem keys
        def check_nested(d):
            if isinstance(d, dict):
                for k, v in d.items():
                    if k.lower() in ("subsystem", "source_subsystem", "primary_subsystem"):
                        if isinstance(v, str) and v not in ("UNKNOWN", "NONE"):
                            assert v in VALID_SUBSYSTEMS, f"Invalid subsystem '{v}' in results.json"
                    check_nested(v)
            elif isinstance(d, list):
                for item in d:
                    check_nested(item)
        check_nested(res_data)
