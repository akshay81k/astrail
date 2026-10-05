import numpy as np
import pandas as pd
import pytest

from spacecraft_rca.data.quality import TelemetryQualityProcessor


@pytest.fixture
def sample_clean_df():
    dates = pd.date_range("2026-01-01 00:00:00", periods=5, freq="1min")
    return pd.DataFrame({
        "timestamp": dates,
        "sensor_a": [1.0, 2.0, 3.0, 4.0, 5.0],
        "sensor_b": [10.0, 20.0, 30.0, 40.0, 50.0]
    })

@pytest.fixture
def sample_faulty_df():
    # Includes out of order, duplicates, and missing values
    return pd.DataFrame({
        "timestamp": [
            "2026-01-01 00:00:00",
            "2026-01-01 00:02:00", # Gap of 1 min
            "2026-01-01 00:01:00", # Out of order
            "2026-01-01 00:02:00", # Duplicate
            "2026-01-01 00:05:00"  # Large gap
        ],
        "sensor_a": [1.0, 3.0, 2.0, 3.0, np.nan],
        "sensor_b": [10.0, 30.0, 20.0, 30.0, 50.0]
    })

def test_leakage_scaler(sample_clean_df, sample_faulty_df):
    """Ensure the scaler never sees fault/test rows during fit."""
    processor = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
    
    # Train only on clean
    processed_train = processor.process(sample_clean_df, is_train=True)
    
    # Scale test/faulty data
    processed_test = processor.process(sample_faulty_df, is_train=False)
    
    assert processor.is_fitted, "Scaler should be fitted on train data."
    # We check if scaling happened without refitting
    assert 'sensor_a' in processed_test.columns
    # Scaler was trained on min=1, max=5, median=3.0.
    # We expect test data to be scaled against median=3.0, IQR=2.0.
    # The value 3.0 should scale to 0.0
    val = processed_test.loc[processed_test['timestamp'] == pd.to_datetime("2026-01-01 00:02:00"), 'sensor_a'].values[0]
    assert np.isclose(val, 0.0), "Leakage detected! Scaler was influenced by test data."

def test_mask_correctness(sample_faulty_df):
    """Verify that boolean missing masks are correctly tracking missing inputs."""
    processor = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
    df = processor.process(sample_faulty_df, is_train=False)
    
    # At 00:03:00, there was no original row, so it should be missing (masked = True)
    # At 00:04:00, no original row, masked = True
    mask_03 = df.loc[df['timestamp'] == pd.to_datetime("2026-01-01 00:03:00"), 'sensor_a_is_missing'].values[0]
    assert mask_03 == True, "Mask failed to identify missing original row."
    
    # Check that ffill worked (limit=2). 00:03, 00:04 should be ffilled from 00:02.
    # At 00:02:00, sensor_a was 3.0 (from faulty df)
    val_03 = df.loc[df['timestamp'] == pd.to_datetime("2026-01-01 00:03:00"), 'sensor_a'].values[0]
    assert val_03 == 3.0, "Forward fill did not work correctly."

def test_idempotence(sample_clean_df):
    """Ensure running the process multiple times yields the same result."""
    processor = TelemetryQualityProcessor(time_grid_freq="1min", max_gap_limit=2)
    
    df_first = processor.process(sample_clean_df, is_train=True)
    df_second = processor.process(sample_clean_df.copy(), is_train=False)
    
    # The timestamps should remain the same and not duplicate further.
    assert len(df_first) == len(df_second)
    # The dq_score should be 1.0 for clean data both times.
    assert all(df_second['dq_score'] == 1.0)
