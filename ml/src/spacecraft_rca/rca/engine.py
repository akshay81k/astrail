from collections import defaultdict

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

from ..utils import get_logger

logger = get_logger(__name__)

class RootCauseEngine:
    def __init__(self, dependency_graph_df: pd.DataFrame, signal_catalog_df: pd.DataFrame, temperature: float = 1.0):
        self.temperature = temperature
        
        # Build dependency mappings
        self.downstream_map = defaultdict(list)
        if dependency_graph_df is not None:
            for _, row in dependency_graph_df.iterrows():
                self.downstream_map[row.iloc[0]].append(row.iloc[1])
                
        self.signal_to_sub = {}
        self.sub_to_signals = defaultdict(list)
        if signal_catalog_df is not None:
            for _, row in signal_catalog_df.iterrows():
                self.signal_to_sub[row['signal']] = row['subsystem']
                self.sub_to_signals[row['subsystem']].append(row['signal'])

    def _cusum_onset(self, residuals: np.ndarray, threshold: float = 3.0) -> int:
        """Calculates onset time via CUSUM on residuals. Returns -1 if no onset."""
        S = 0
        mean = np.mean(residuals[:10]) if len(residuals) > 10 else 0
        std = np.std(residuals[:10]) if len(residuals) > 10 else 1.0
        if std == 0:
            std = 1.0
            
        # Simplified CUSUM
        k = 0.5 * std
        h = threshold * std
        for i, val in enumerate(residuals):
            S = max(0, S + np.abs(val - mean) - k)
            if S > h:
                return i
        return -1

    def _lagged_cross_corr(self, x: np.ndarray, y: np.ndarray, max_lag: int = 10) -> float:
        """Returns max cross-correlation across plausible lags."""
        if len(x) == 0 or len(y) == 0 or np.std(x) == 0 or np.std(y) == 0:
            return 0.0
            
        corrs = []
        for lag in range(max_lag + 1):
            if lag == 0:
                corr = np.corrcoef(x, y)[0, 1]
            else:
                corr = np.corrcoef(x[:-lag], y[lag:])[0, 1]
            if not np.isnan(corr):
                corrs.append(corr)
        return max(corrs) if corrs else 0.0

    def _hypothesis_fit(self, df_event: pd.DataFrame, source_signal: str) -> float:
        """
        Optional hypothesis fitting: fits a parametric surrogate.
        We'll use a simple linear scaling surrogate: y_hat = a * x + b.
        Returns the fit error (MSE).
        """
        def model(params, x):
            return params[0] * x + params[1]
            
        def residuals(params, x, y):
            return model(params, x) - y
            
        y_true = df_event[source_signal].fillna(0).values
        x = np.arange(len(y_true))
        
        if len(y_true) < 2:
            return 1e6
            
        res = least_squares(residuals, x0=[0.0, y_true[0]], args=(x, y_true))
        mse = np.mean(res.fun**2)
        return float(mse)

    def analyze(self, df_event: pd.DataFrame, residuals_dict: dict[str, np.ndarray], flagged_channels: list[str]) -> dict[str, float]:
        """
        Scores each subsystem as a candidate root cause.
        """
        if not flagged_channels:
            return {}
            
        # 1. Onset time per flagged channel
        onsets = {}
        for ch in flagged_channels:
            if ch in residuals_dict:
                onset = self._cusum_onset(residuals_dict[ch])
                onsets[ch] = onset if onset != -1 else len(df_event)
            else:
                onsets[ch] = len(df_event)
                
        # Subsystem onset = min onset of its flagged signals
        sub_onsets = {}
        for sub in self.sub_to_signals:
            sub_flags = [ch for ch in self.sub_to_signals[sub] if ch in flagged_channels]
            if sub_flags:
                sub_onsets[sub] = min(onsets[ch] for ch in sub_flags)
            else:
                sub_onsets[sub] = float('inf')
                
        earliest_onset_time = min(sub_onsets.values()) if sub_onsets else 0
        
        raw_scores = {}
        # 2. Score candidate source nodes
        for candidate in self.sub_to_signals.keys():
            score = 0.0
            
            # Bonus for earliest onset
            if sub_onsets[candidate] != float('inf'):
                # Closer to earliest time -> higher bonus
                time_diff = sub_onsets[candidate] - earliest_onset_time
                onset_bonus = np.exp(-time_diff / 10.0) # Decay
                score += onset_bonus * 2.0
                
            # Fraction of downstream explained
            downstream_subs = self.downstream_map.get(candidate, [])
            explained = 0
            total_downstream = 0
            for dsub in downstream_subs:
                d_flags = [ch for ch in self.sub_to_signals[dsub] if ch in flagged_channels]
                if d_flags:
                    explained += 1
                total_downstream += 1
                
            if total_downstream > 0:
                score += (explained / total_downstream) * 1.5
                
            # Lag consistency via cross-corr for primary signal
            primary_sig = self.sub_to_signals[candidate][0] if self.sub_to_signals[candidate] else None
            if primary_sig and primary_sig in flagged_channels and primary_sig in df_event.columns:
                lag_corrs = []
                for dsub in downstream_subs:
                    d_sigs = [ch for ch in self.sub_to_signals[dsub] if ch in flagged_channels]
                    for d_sig in d_sigs:
                        if d_sig in df_event.columns:
                            corr = self._lagged_cross_corr(df_event[primary_sig].values, df_event[d_sig].values)
                            lag_corrs.append(corr)
                if lag_corrs:
                    score += np.mean(lag_corrs)
                    
            # Hypothesis fitting bonus (inverse penalty for fit error)
            if primary_sig and primary_sig in flagged_channels and primary_sig in df_event.columns:
                fit_err = self._hypothesis_fit(df_event, primary_sig)
                fit_score = np.exp(-fit_err / (np.var(df_event[primary_sig]) + 1e-6))
                score += fit_score * 0.5
                
            raw_scores[candidate] = score
            
        # 3. Softmax normalize
        candidates = list(raw_scores.keys())
        scores = np.array([raw_scores[c] for c in candidates])
        
        # Safe softmax
        scores = scores / self.temperature
        scores = scores - np.max(scores)
        exp_scores = np.exp(scores)
        probs = exp_scores / np.sum(exp_scores)
        
        ranked_probs = {c: float(p) for c, p in zip(candidates, probs)}
        return dict(sorted(ranked_probs.items(), key=lambda item: item[1], reverse=True))

def bootstrap_ci(metric_list: list[float], n_bootstraps: int = 1000, ci: float = 95) -> tuple[float, float, float]:
    """Computes mean and bootstrap CI for a metric list."""
    if not metric_list:
        return 0.0, 0.0, 0.0
    arr = np.array(metric_list)
    means = []
    for _ in range(n_bootstraps):
        sample = np.random.choice(arr, size=len(arr), replace=True)
        means.append(np.mean(sample))
    
    mean_val = np.mean(arr)
    lower = np.percentile(means, (100 - ci) / 2)
    upper = np.percentile(means, 100 - (100 - ci) / 2)
    return mean_val, lower, upper

def evaluate_rca_accuracy(engine: RootCauseEngine, eval_df: pd.DataFrame, eval_faults: pd.DataFrame, is_injected: bool = False):
    """
    Evaluates Top-1 and Top-3 accuracy on the given dataset.
    Mocks residual generation for standalone testing.
    """
    top1_list = []
    top3_list = []
    breakdown = defaultdict(lambda: {"top1": [], "top3": []})
    
    for _, fault in eval_faults.iterrows():
        # Positional access for evaluation metadata
        start = int(fault.iloc[1]) if len(fault) > 1 else 0
        end = int(fault.iloc[2]) if len(fault) > 2 else 0
        true_source = str(fault.iloc[3]) if len(fault) > 3 else ""
        f_type = str(fault.iloc[4]) if len(fault) > 4 else ""
        
        if start >= len(eval_df) or end >= len(eval_df):
            continue
            
        df_event = eval_df.iloc[start:end+50].copy()
        affected = str(fault.iloc[5]).split(';') if len(fault) > 5 else []
        
        # Real residual computation missing
        raise NotImplementedError("NOT COMPUTED")
            
        ranked_subs = list(scores.keys())
        
        is_top1 = 1.0 if ranked_subs and ranked_subs[0] == true_source else 0.0
        is_top3 = 1.0 if true_source in ranked_subs[:3] else 0.0
        
        top1_list.append(is_top1)
        top3_list.append(is_top3)
        breakdown[f_type]["top1"].append(is_top1)
        breakdown[f_type]["top3"].append(is_top3)
        
    t1_mean, t1_l, t1_u = bootstrap_ci(top1_list)
    t3_mean, t3_l, t3_u = bootstrap_ci(top3_list)
    
    group_name = "Injected Faults (N=60)" if is_injected else "Real Faults (N=8)"
    
    report = []
    report.append(f"### {group_name}")
    report.append(f"- **Top-1 Accuracy**: {t1_mean:.2%} (95% CI: {t1_l:.2%} - {t1_u:.2%})")
    report.append(f"- **Top-3 Accuracy**: {t3_mean:.2%} (95% CI: {t3_l:.2%} - {t3_u:.2%})")
    report.append("\n**Per-Fault-Type Breakdown (Mean Top-1 / Top-3):**")
    for f_type, metrics in breakdown.items():
        type_t1 = np.mean(metrics["top1"]) if metrics["top1"] else 0.0
        type_t3 = np.mean(metrics["top3"]) if metrics["top3"] else 0.0
        report.append(f"  - `{f_type}`: Top-1={type_t1:.0%}, Top-3={type_t3:.0%}")
    report.append("")
    
    return "\n".join(report)
