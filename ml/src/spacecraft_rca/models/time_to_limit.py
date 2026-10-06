from typing import Dict, List, Optional
import numpy as np
import pandas as pd
from scipy.stats import theilslopes

class TimeToLimitProjector:
    """
    Fits Theil-Sen robust linear regression on the last 30 rows of the top-3 residual channels
    at the time of an alert. Projects crossing of operational hard limits and returns
    median time-to-limit (in rows) along with an 80% confidence interval range.
    """
    def __init__(self, hi_limits: np.ndarray, lo_limits: np.ndarray, sensor_cols: List[str]):
        self.hi_limits = np.array(hi_limits, dtype=float)
        self.lo_limits = np.array(lo_limits, dtype=float)
        self.sensor_cols = list(sensor_cols)
        self.col_to_idx = {c: i for i, c in enumerate(self.sensor_cols)}

    def project_channel(self, series: np.ndarray, channel_name: str, alpha: float = 0.80) -> Optional[Dict]:
        """
        Fit Theil-Sen on the last 30 rows of a single channel and project crossing of hard limit.
        Returns dict with projection if slope is significant, else None.
        """
        if len(series) < 5 or channel_name not in self.col_to_idx:
            return None

        # Take last 30 rows (or available length)
        y = np.array(series[-30:], dtype=float)
        # Drop NaNs if any
        valid_mask = ~np.isnan(y)
        if valid_mask.sum() < 5:
            return None
        y = y[valid_mask]
        x = np.arange(len(y))

        idx = self.col_to_idx[channel_name]
        hi = self.hi_limits[idx]
        lo = self.lo_limits[idx]
        y_curr = y[-1]

        # Fit Theil-Sen with specified alpha (default 0.80 for 80% CI)
        res = theilslopes(y, x, alpha=alpha)
        slope = float(res.slope)
        low_slope = float(res.low_slope)
        high_slope = float(res.high_slope)

        # Check slope significance:
        # 1. Slope > 0 and 80% CI strictly > 0 -> heading towards high limit
        # 2. Slope < 0 and 80% CI strictly < 0 -> heading towards low limit
        if slope > 0 and low_slope > 0 and y_curr < hi:
            dist = hi - y_curr
            ttl_med = max(0.0, dist / slope)
            ttl_min = max(0.0, dist / high_slope)
            ttl_max = max(0.0, dist / low_slope)
            range_80 = [round(min(ttl_min, ttl_max), 1), round(max(ttl_min, ttl_max), 1)]
            return {
                "channel": channel_name,
                "direction": "HIGH",
                "limit_value": round(float(hi), 3),
                "current_value": round(float(y_curr), 3),
                "slope": round(slope, 5),
                "median_rows": round(ttl_med, 1),
                "range_80": range_80
            }
        elif slope < 0 and high_slope < 0 and y_curr > lo:
            dist = y_curr - lo
            ttl_med = max(0.0, dist / abs(slope))
            ttl_min = max(0.0, dist / abs(low_slope))
            ttl_max = max(0.0, dist / abs(high_slope))
            range_80 = [round(min(ttl_min, ttl_max), 1), round(max(ttl_min, ttl_max), 1)]
            return {
                "channel": channel_name,
                "direction": "LOW",
                "limit_value": round(float(lo), 3),
                "current_value": round(float(y_curr), 3),
                "slope": round(slope, 5),
                "median_rows": round(ttl_med, 1),
                "range_80": range_80
            }

        return None

    def evaluate(self, window_df: pd.DataFrame, top_channels: List[str], alpha: float = 0.80) -> Dict:
        """
        Evaluate time-to-limit on top residual channels (up to 5).
        Returns aggregated earliest TTL projection or 'no crossing projected'.
        """
        projections = []
        for ch in top_channels[:5]:
            if ch in window_df.columns:
                proj = self.project_channel(window_df[ch].values, ch, alpha=alpha)
                if proj is not None:
                    projections.append(proj)

        if not projections:
            return {
                "status": "no crossing projected",
                "median_rows": None,
                "range_80": None,
                "evaluated_channels": top_channels[:5],
                "channel_projections": []
            }

        # Aggregate across significant channels
        # Take the earliest projected crossing (most critical channel)
        projections.sort(key=lambda p: p["median_rows"])
        primary_proj = projections[0]

        return {
            "status": "PROJECTED",
            "median_rows": primary_proj["median_rows"],
            "range_80": primary_proj["range_80"],
            "critical_channel": primary_proj["channel"],
            "evaluated_channels": top_channels[:5],
            "channel_projections": projections
        }
