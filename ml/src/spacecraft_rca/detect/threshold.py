
import numpy as np
import pandas as pd

from ..utils import get_logger

logger = get_logger(__name__)

class ConformalAnomalyDetector:
    def __init__(self, alpha: float = 0.05, persistence_n: int = 5, ewma_span: int = 10, combine_method: str = "max"):
        self.alpha = alpha
        self.persistence_n = persistence_n
        self.ewma_span = ewma_span
        self.combine_method = combine_method
        self.thresholds: np.ndarray = None
        self.is_fitted = False
        
    def _compute_smoothed_residuals(self, y: np.ndarray, y_hat: np.ndarray, scales: np.ndarray = None) -> np.ndarray:
        """
        Calculates |y - y_hat| / scale and smooths with EWMA.
        """
        res = np.abs(y - y_hat)
        if scales is not None:
            # avoid division by zero
            safe_scales = np.where(scales == 0, 1e-6, scales)
            res = res / safe_scales
            
        # EWMA smoothing using pandas
        df_res = pd.DataFrame(res)
        smoothed = df_res.ewm(span=self.ewma_span, adjust=False).mean().values
        return smoothed

    def fit(self, y_calib: np.ndarray, y_hat_calib: np.ndarray, scales: np.ndarray = None) -> None:
        """
        Fits split conformal thresholds on CALIBRATION slice.
        """
        logger.info(f"Fitting conformal thresholds with alpha={self.alpha}")
        smoothed_res = self._compute_smoothed_residuals(y_calib, y_hat_calib, scales)
        
        # Conformal quantile: (1 - alpha) * (1 + 1/n)
        n = len(smoothed_res)
        q = min(1.0, (1.0 - self.alpha) * (1.0 + 1.0 / n))
        
        # Per-channel thresholds
        self.thresholds = np.quantile(smoothed_res, q, axis=0)
        self.is_fitted = True
        logger.info(f"Fitted thresholds for {len(self.thresholds)} channels.")
        
    def predict(self, y: np.ndarray, y_hat: np.ndarray, scales: np.ndarray = None) -> tuple[np.ndarray, np.ndarray]:
        """
        Returns anomaly scores and binary alert flags (accounting for persistence).
        """
        if not self.is_fitted:
            raise ValueError("Detector is not fitted.")
            
        smoothed_res = self._compute_smoothed_residuals(y, y_hat, scales)
        
        # Exceedance: how much smoothed residual exceeds the threshold
        # Can be negative if below threshold. We clip at 0.
        exceedance = np.maximum(0, smoothed_res - self.thresholds)
        
        # Combine channels
        if self.combine_method == "max":
            anomaly_score = np.max(exceedance, axis=1)
        elif self.combine_method == "sum":
            anomaly_score = np.sum(exceedance, axis=1)
        else:
            raise ValueError(f"Unknown combine_method: {self.combine_method}")
            
        # Base alerts: any exceedance > 0
        base_alerts = (anomaly_score > 0).astype(int)
        
        # Persistence rule: alert only after N consecutive exceedances
        alerts = np.zeros_like(base_alerts)
        consecutive = 0
        for i in range(len(base_alerts)):
            if base_alerts[i] == 1:
                consecutive += 1
            else:
                consecutive = 0
                
            if consecutive >= self.persistence_n:
                alerts[i] = 1
                
        return anomaly_score, alerts

class StaticLimitDetector:
    def __init__(self, persistence_n: int = 5):
        self.persistence_n = persistence_n
        self.means = None
        self.stds = None
        self.is_fitted = False
        
    def fit(self, y_train: np.ndarray) -> None:
        """Fits 3-sigma limits on train data."""
        self.means = np.mean(y_train, axis=0)
        self.stds = np.std(y_train, axis=0)
        self.is_fitted = True
        logger.info("Fitted static 3-sigma limits.")
        
    def predict(self, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if not self.is_fitted:
            raise ValueError("Static detector not fitted.")
            
        # 3-sigma exceedance
        upper_limit = self.means + 3 * self.stds
        lower_limit = self.means - 3 * self.stds
        
        exceed_upper = np.maximum(0, y - upper_limit)
        exceed_lower = np.maximum(0, lower_limit - y)
        total_exceed = exceed_upper + exceed_lower
        
        anomaly_score = np.max(total_exceed, axis=1)
        base_alerts = (anomaly_score > 0).astype(int)
        
        alerts = np.zeros_like(base_alerts)
        consecutive = 0
        for i in range(len(base_alerts)):
            if base_alerts[i] == 1:
                consecutive += 1
            else:
                consecutive = 0
            if consecutive >= self.persistence_n:
                alerts[i] = 1
                
        return anomaly_score, alerts
