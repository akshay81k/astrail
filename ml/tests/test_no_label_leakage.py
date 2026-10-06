import os
import re
from pathlib import Path
import pytest
import pandas as pd
import numpy as np
import torch

from spacecraft_rca.data.quality import TelemetryQualityProcessor
from spacecraft_rca.models.root_cause import RootCauseEngine
from spacecraft_rca.models.time_to_limit import TimeToLimitProjector

LABEL_COLUMNS = [
    "fault_id", "fault_type", "is_fault", "ground_truth", 
    "label", "injection_pattern", "propagation_model"
]

def test_static_no_label_in_inference_code():
    """
    Assert that no inference code in src/spacecraft_rca/ reads or references any fault label columns.
    Excludes test or evaluation benchmark scripts.
    """
    src_dir = Path("src/spacecraft_rca")
    inference_dirs = ["models", "data", "api"]
    
    for idir in inference_dirs:
        dir_path = src_dir / idir
        if not dir_path.exists():
            continue
        for py_file in dir_path.glob("**/*.py"):
            with open(py_file, "r", encoding="utf-8") as f:
                content = f.read()
                
            for label_col in LABEL_COLUMNS:
                # Check for dataframe indexing like df['fault_id'], df.get('fault_id'), row['fault_id']
                patterns = [
                    rf"\[['\"]{label_col}['\"]\]",
                    rf"\.get\(['\"]{label_col}['\"]\)",
                    rf"==\s*['\"]{label_col}['\"]"
                ]
                for p in patterns:
                    matches = re.findall(p, content)
                    assert not matches, f"Label column '{label_col}' was referenced in inference file: {py_file}"

def test_dynamic_inference_invariance_to_labels():
    """
    Assert that feeding data containing label columns yields identical outputs to clean data.
    """
    sensor_cols = [
        "power_bus_voltage_V", "power_bus_current_A", "battery_temperature_C"
    ]
    np.random.seed(42)
    clean_data = pd.DataFrame(np.random.randn(50, 3), columns=sensor_cols)
    
    # Injected with arbitrary labels
    tainted_data = clean_data.copy()
    tainted_data["fault_id"] = "F999"
    tainted_data["fault_type"] = "MALICIOUS_LEAK"
    tainted_data["is_fault"] = 1
    tainted_data["ground_truth"] = "FAIL"
    
    qp = TelemetryQualityProcessor("1min", max_gap_limit=2)
    qp.sensor_cols = sensor_cols
    qp.fit_scaler(clean_data)
    
    res_clean = qp.transform_scaler(clean_data)
    res_tainted = qp.transform_scaler(tainted_data)
    
    # Assert values for all sensor columns match exactly
    for c in sensor_cols:
        np.testing.assert_allclose(res_clean[c].values, res_tainted[c].values)
