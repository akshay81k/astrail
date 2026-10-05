import random
from pathlib import Path

import numpy as np
import pandas as pd

from ..data.loaders import load_telemetry_data
from ..utils import get_logger, load_artifact, set_global_seed

logger = get_logger(__name__)

class FaultInjector:
    def __init__(self, data_root: str | Path, seed: int = 42):
        self.data_root = Path(data_root)
        self.seed = seed
        set_global_seed(seed)
        
        self.patterns = [
            'gradual_rise', 'voltage_sag', 'speed_jitter', 
            'signal_drop', 'cpu_spike', 'power_ramp', 
            'bias_shift', 'oscillation'
        ]
        
        self.subsystems = [
            'THERMAL', 'POWER', 'ATTITUDE', 'COMMUNICATIONS', 
            'RADIATION', 'COMPUTE', 'PAYLOAD'
        ]
        
        self.severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
        
    def _apply_pattern(self, df: pd.DataFrame, pattern: str, channels: list[str], start: int, end: int, lag: int = 0) -> None:
        """Injects a specific fault pattern into the target channels over the window [start, end]."""
        duration = end - start
        x = np.linspace(0, 1, duration)
        
        for i, ch in enumerate(channels):
            if ch not in df.columns:
                continue
                
            # Apply lag for propagation (source changes immediately, dependents lag)
            ch_start = min(end - 1, start + (i * lag))
            ch_duration = end - ch_start
            if ch_duration <= 0:
                continue
                
            ch_x = np.linspace(0, 1, ch_duration)
            base_std = df[ch].std() if df[ch].std() > 1e-3 else 1.0
            
            # Injection logic
            if pattern == 'gradual_rise':
                df.loc[ch_start:end-1, ch] += ch_x * base_std * 5
            elif pattern == 'voltage_sag':
                df.loc[ch_start:end-1, ch] -= (np.sin(ch_x * np.pi) * base_std * 4)
            elif pattern == 'speed_jitter':
                df.loc[ch_start:end-1, ch] += np.random.normal(0, base_std * 3, ch_duration)
            elif pattern == 'signal_drop':
                df.loc[ch_start:end-1, ch] -= base_std * 6
            elif pattern == 'cpu_spike':
                spike_idx = np.random.choice(range(ch_start, end), size=int(ch_duration*0.2), replace=False)
                df.loc[spike_idx, ch] += base_std * 8
            elif pattern == 'power_ramp':
                df.loc[ch_start:end-1, ch] += (ch_x**2) * base_std * 6
            elif pattern == 'bias_shift':
                df.loc[ch_start:end-1, ch] += base_std * 3
            elif pattern == 'oscillation':
                df.loc[ch_start:end-1, ch] += np.sin(ch_x * 10 * np.pi) * base_std * 4
                
            # Extra unmodeled coupling: occasionally perturb a random unmodeled channel
            if random.random() < 0.2:
                numeric_cols = df.select_dtypes(include=[np.number]).columns
                unmodeled_ch = random.choice([c for c in numeric_cols if c not in channels and c != 'timestamp'])
                df.loc[ch_start:end-1, unmodeled_ch] += np.random.normal(0, df[unmodeled_ch].std() * 0.5, ch_duration)

    def create_eval_scenarios(self, n_scenarios: int = 60, min_duration: int = 30, max_duration: int = 200) -> tuple[pd.DataFrame, pd.DataFrame]:
        """
        Injects N scenarios into the validation-normal slice of the clean dataset.
        Returns the modified telemetry dataframe and the new ground truth dataframe.
        """
        logger.info(f"Creating {n_scenarios} new fault scenarios for evaluation...")
        
        # Load clean data and splits
        df_clean = load_telemetry_data(self.data_root, dataset_type="clean")
        try:
            splits = load_artifact("splits.json", artifact_type="json")
            val_idx = splits["validation_normal"]
        except FileNotFoundError:
            # Fallback if splits not generated yet
            val_idx = list(range(int(0.8 * len(df_clean)), len(df_clean)))
            
        # We must place faults inside val_idx, ensuring they don't overlap with each other
        val_start = min(val_idx)
        val_end = max(val_idx)
        available_range = val_end - val_start
        
        if n_scenarios * max_duration * 2 > available_range:
            logger.warning("Requested too many scenarios for the validation space. They might overlap.")
            
        df_injected = df_clean.copy()
        numeric_cols = [c for c in df_clean.select_dtypes(include=[np.number]).columns if c not in ('timestamp', 'dq_score')]
        
        new_faults = []
        current_row = val_start + 100 # buffer
        
        for i in range(n_scenarios):
            duration = random.randint(min_duration, max_duration)
            start_row = current_row
            end_row = start_row + duration
            
            if end_row >= val_end:
                logger.warning("Ran out of validation space. Stopping injection early.")
                break
                
            pattern = random.choice(self.patterns)
            source_sub = random.choice(self.subsystems)
            target_sub = random.choice([s for s in self.subsystems if s != source_sub])
            severity = random.choice(self.severities)
            
            # Select 2-5 channels affected
            n_affected = random.randint(2, 5)
            affected_channels = random.sample(numeric_cols, n_affected)
            
            # Unmodeled lag between source and dependents to differentiate from basic pack
            lag = random.randint(1, 5)
            
            self._apply_pattern(df_injected, pattern, affected_channels, start_row, end_row, lag=lag)
            
            new_faults.append({
                "fault_id": f"EVAL_F{i+1:03d}",
                "fault_type": f"synthetic_{pattern}",
                "source_subsystem": source_sub,
                "primary_affected_subsystem": target_sub,
                "start_row": start_row,
                "end_row": end_row,
                "duration_rows": duration,
                "injection_pattern": pattern,
                "severity": severity,
                "affected_signals": ";".join(affected_channels),
                "propagation_model": f"lag_{lag}_unmodeled_coupling"
            })
            
            current_row = end_row + random.randint(100, 500) # Gap between faults
            
        df_faults = pd.DataFrame(new_faults)
        logger.info(f"Successfully generated {len(df_faults)} evaluation fault scenarios.")
        
        # Save artifacts
        # We can dump this to a CSV so it can be re-loaded as an external testing dataset.
        out_dir = Path(self.data_root) / "data" / "eval"
        out_dir.mkdir(parents=True, exist_ok=True)
        
        df_injected.to_csv(out_dir / "synthetic_telemetry_eval.csv", index=False)
        df_faults.to_csv(out_dir / "eval_fault_events_ground_truth.csv", index=False)
        
        return df_injected, df_faults
