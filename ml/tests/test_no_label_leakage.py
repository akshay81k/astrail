import ast
import os
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

from spacecraft_rca.data.quality import TelemetryQualityProcessor

FORBIDDEN_LABEL_COLUMNS = [
    "anomaly_label",
    "source_subsystem",
    "primary_affected_subsystem",
    "severity",
    "risk_level",
    "affected_signals",
    "start_row",
    "end_row",
    "fault_id",
    "fault_type",
    "is_fault",
    "ground_truth"
]

def test_ast_no_label_in_inference_code():
    """
    AST inspection asserting that no inference code in src/spacecraft_rca/ reads,
    subscripts, or attributes any ground-truth fault label column.
    """
    src_dir = Path("src/spacecraft_rca")
    inference_dirs = ["models", "api", "classify", "detect", "explain", "rca", "respond"]
    inference_files = []
    for idir in inference_dirs:
        dir_path = src_dir / idir
        if dir_path.exists():
            inference_files.extend(list(dir_path.glob("**/*.py")))
    if (src_dir / "data" / "quality.py").exists():
        inference_files.append(src_dir / "data" / "quality.py")
    
    forbidden_set = set(FORBIDDEN_LABEL_COLUMNS)
    
    for py_file in inference_files:
        with open(py_file, "r", encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=str(py_file))
                
            for node in ast.walk(tree):
                # Check for Subscript access: df['col'], row['col']
                if isinstance(node, ast.Subscript):
                    slice_node = node.slice
                    if isinstance(slice_node, ast.Constant) and isinstance(slice_node.value, str):
                        val = slice_node.value
                        assert val not in forbidden_set, (
                            f"Forbidden label column '{val}' indexed in {py_file} at line {node.lineno}"
                        )
                # Check for Call to .get('col')
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Attribute) and node.func.attr == "get":
                        if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                            val = node.args[0].value
                            assert val not in forbidden_set, (
                                f"Forbidden label column '{val}' read via .get() in {py_file} at line {node.lineno}"
                            )
                # Check for Compare equality: df['col'] == 'val'
                elif isinstance(node, ast.Compare):
                    for comparator in node.comparators:
                        if isinstance(comparator, ast.Constant) and isinstance(comparator.value, str):
                            val = comparator.value
                            assert val not in forbidden_set, (
                                f"Forbidden label column '{val}' compared in {py_file} at line {node.lineno}"
                            )

def test_dynamic_inference_invariance_to_labels():
    """
    Dynamic test asserting that feeding data containing all forbidden label columns
    yields 100% identical predictions and transformations to clean data.
    """
    sensor_cols = [
        "power_bus_voltage_V", "power_bus_current_A", "battery_temperature_C"
    ]
    np.random.seed(42)
    clean_data = pd.DataFrame(np.random.randn(50, 3), columns=sensor_cols)
    
    # Injected with all forbidden labels
    tainted_data = clean_data.copy()
    for col in FORBIDDEN_LABEL_COLUMNS:
        tainted_data[col] = f"TAINT_{col}"
    
    qp = TelemetryQualityProcessor("1min", max_gap_limit=2)
    qp.sensor_cols = sensor_cols
    qp.fit_scaler(clean_data)
    
    res_clean = qp.transform_scaler(clean_data)
    res_tainted = qp.transform_scaler(tainted_data)
    
    # Assert values for all sensor columns match exactly
    for c in sensor_cols:
        np.testing.assert_allclose(res_clean[c].values, res_tainted[c].values)
