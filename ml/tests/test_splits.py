import json

import pandas as pd
import pytest

from spacecraft_rca.data.splits import generate_splits
from spacecraft_rca.utils import load_artifact


@pytest.fixture
def mock_data_env(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    
    # Create mock clean data (1000 rows)
    dates = pd.date_range("2026-01-01", periods=1000, freq="1min")
    df_clean = pd.DataFrame({
        "timestamp": dates.astype(str),
        "spacecraft_id": "SIM-SMAP-01",
        "mode": "NOMINAL",
        "power_bus_voltage_V": 28.0,
        "power_bus_current_A": 4.5,
        "solar_array_current_A": 3.0,
        "battery_soc_pct": 80.0,
        "battery_temperature_C": 20.0,
        "eps_temperature_C": 20.0,
        "payload_temperature_C": 20.0,
        "radiator_temperature_C": 20.0,
        "imu_accel_x_mps2": 0.0,
        "imu_accel_y_mps2": 0.0,
        "imu_accel_z_mps2": 9.8,
        "gyro_x_deg_s": 0.0,
        "gyro_y_deg_s": 0.0,
        "gyro_z_deg_s": 0.0,
        "reaction_wheel_speed_rpm": 1000.0,
        "comm_rx_dbm": -80.0,
        "comm_tx_dbm": 0.0,
        "packet_loss_pct": 0.0,
        "cpu_utilization_pct": 50.0,
        "memory_utilization_pct": 50.0,
        "radiation_rate_counts_s": 10.0,
        "payload_power_W": 50.0,
        "data_queue_MB": 100.0
    })
    df_clean.to_csv(data_dir / "synthetic_telemetry_clean.csv", index=False)
    
    # Create mock faults (faults at 200-250 and 800-850)
    df_faults = pd.DataFrame({
        "fault_id": ["F1", "F2"],
        "fault_type": ["A", "B"],
        "source_subsystem": ["SYS1", "SYS2"],
        "primary_affected_subsystem": ["SYS3", "SYS4"],
        "start_row": [200, 800],
        "end_row": [250, 850],
        "duration_rows": [50, 50],
        "injection_pattern": ["X", "Y"],
        "severity": ["HIGH", "LOW"],
        "affected_signals": ["A", "B"],
        "propagation_model": ["P1", "P2"]
    })
    df_faults.to_csv(data_dir / "fault_events_ground_truth.csv", index=False)
    
    # Create fake manifest.json for testing load/save artifact
    artifact_dir = tmp_path.parent / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    with open(artifact_dir / "manifest.json", "w") as f:
        json.dump({}, f)
        
    # We must patch the utils artifacts path to point to our temp dir for tests
    return tmp_path

def test_generate_splits_no_fault_leakage(mock_data_env, monkeypatch):
    from spacecraft_rca import utils
    # Patch artifact directories for the test
    artifact_dir = mock_data_env.parent / "artifacts"
    monkeypatch.setattr(utils, "_get_manifest_path", lambda: artifact_dir / "manifest.json")
    
    splits = generate_splits(mock_data_env, buffer=10)
    
    train_idx = set(splits["train"])
    calib_idx = set(splits["calibration"])
    
    # Fault 1 is 200-250. With buffer 10, excluded range is 190-260
    fault1_range = set(range(190, 261))
    
    # Fault 2 is 800-850. With buffer 10, excluded range is 790-860
    fault2_range = set(range(790, 861))
    
    assert len(train_idx.intersection(fault1_range)) == 0, "Fault rows leaked into train set"
    assert len(train_idx.intersection(fault2_range)) == 0, "Fault rows leaked into train set"
    
    assert len(calib_idx.intersection(fault1_range)) == 0, "Fault rows leaked into calib set"
    assert len(calib_idx.intersection(fault2_range)) == 0, "Fault rows leaked into calib set"

    # Also verify it got saved properly
    saved_splits = load_artifact("splits.json", artifact_type="json")
    assert saved_splits["train"] == splits["train"]
