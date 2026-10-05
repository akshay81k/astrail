
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ..utils import get_logger

logger = get_logger(__name__)

class IForestForecaster:
    def __init__(self, dependency_graph_df: pd.DataFrame = None, alpha: float = 0.05, window_size: int = 10):
        self.alpha = alpha
        self.window_size = window_size
        self.model = IsolationForest(n_estimators=100, random_state=42, n_jobs=-1)
        self.threshold = None
        self.is_fitted = False
        
        self.dependency_graph_df = dependency_graph_df
        # Create mapping of subsystem dependencies
        self.edges = []
        if self.dependency_graph_df is not None:
            for _, row in self.dependency_graph_df.iterrows():
                self.edges.append((row['source_subsystem'], row['target_subsystem']))
                
    def extract_features(self, df: pd.DataFrame, signal_catalog_df: pd.DataFrame = None) -> pd.DataFrame:
        """
        Engineers rolling mean, std, slope, and cross-channel differences.
        """
        logger.info("Extracting features for Isolation Forest...")
        features = pd.DataFrame(index=df.index)
        
        # Numeric columns only
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        sensor_cols = [c for c in numeric_cols if c not in ('timestamp', 'dq_score')]
        
        # 1. Rolling Mean & Std
        rolling = df[sensor_cols].rolling(window=self.window_size, min_periods=1)
        means = rolling.mean()
        stds = rolling.std().fillna(0)
        
        for c in sensor_cols:
            features[f"{c}_mean"] = means[c]
            features[f"{c}_std"] = stds[c]
            
            # 2. Slope (Difference over the window)
            features[f"{c}_slope"] = df[c].diff(periods=self.window_size).fillna(0)
            
        # 3. Cross-channel differences based on dependency graph
        if self.dependency_graph_df is not None and signal_catalog_df is not None:
            # Group signals by subsystem
            subsystem_signals = {}
            for _, row in signal_catalog_df.iterrows():
                subsystem_signals.setdefault(row['subsystem'], []).append(row['signal'])
                
            for src_sub, tgt_sub in self.edges:
                src_sigs = subsystem_signals.get(src_sub, [])
                tgt_sigs = subsystem_signals.get(tgt_sub, [])
                
                # Pairwise differences between means
                for s_sig in src_sigs:
                    for t_sig in tgt_sigs:
                        if s_sig in means.columns and t_sig in means.columns:
                            features[f"{s_sig}_minus_{t_sig}"] = means[s_sig] - means[t_sig]
                            
        return features

    def fit(self, df_train: pd.DataFrame, signal_catalog_df: pd.DataFrame = None) -> None:
        """Fit Isolation Forest on train."""
        X_train = self.extract_features(df_train, signal_catalog_df)
        X_train = X_train.fillna(0) # Safety net
        self.model.fit(X_train)
        self.is_fitted = True
        logger.info(f"Fitted Isolation Forest on {len(X_train)} samples with {X_train.shape[1]} features.")
        
    def calibrate(self, df_calib: pd.DataFrame, signal_catalog_df: pd.DataFrame = None) -> None:
        """Calibrate threshold via conformal on calibration slice."""
        if not self.is_fitted:
            raise ValueError("Model must be fitted before calibration.")
            
        X_calib = self.extract_features(df_calib, signal_catalog_df)
        X_calib = X_calib.fillna(0)
        
        # IForest score_samples returns negative anomaly score (lower is more anomalous)
        # We want anomaly scores to be positive and larger for anomalies.
        scores = -self.model.score_samples(X_calib)
        
        # Conformal quantile
        n = len(scores)
        q = min(1.0, (1.0 - self.alpha) * (1.0 + 1.0 / n))
        self.threshold = np.quantile(scores, q)
        logger.info(f"Calibrated IForest threshold at {self.threshold:.4f} for alpha {self.alpha}")
        
    def predict(self, df_test: pd.DataFrame, signal_catalog_df: pd.DataFrame = None) -> tuple[np.ndarray, np.ndarray]:
        """Returns anomaly scores and alerts (1 if > threshold)."""
        if self.threshold is None:
            raise ValueError("Model must be calibrated before prediction.")
            
        X_test = self.extract_features(df_test, signal_catalog_df)
        X_test = X_test.fillna(0)
        
        scores = -self.model.score_samples(X_test)
        alerts = (scores > self.threshold).astype(int)
        
        return scores, alerts

    def get_feature_importances(self, df_sample: pd.DataFrame, signal_catalog_df: pd.DataFrame = None) -> pd.DataFrame:
        """Uses TreeSHAP to get per-feature contributions, falls back to permutation importances."""
        X = self.extract_features(df_sample, signal_catalog_df).fillna(0)
        
        try:
            import shap
            logger.info("Using SHAP for feature contributions...")
            explainer = shap.TreeExplainer(self.model)
            shap_values = explainer.shap_values(X)
            
            # Average absolute SHAP values
            mean_shap = np.abs(shap_values).mean(axis=0)
            imp_df = pd.DataFrame({"Feature": X.columns, "Importance": mean_shap})
            return imp_df.sort_values(by="Importance", ascending=False)
            
        except ImportError:
            logger.warning("SHAP is not installed or failed to load. Falling back to Scikit-Learn Permutation Importances.")
            from sklearn.inspection import permutation_importance
            
            # For permutation importance on an unsupervised model, we can treat the predictions as targets.
            preds = self.model.predict(X)
            # Custom scorer that evaluates how much the predictions change
            result = permutation_importance(self.model, X, preds, n_repeats=5, random_state=42, scoring='accuracy')
            imp_df = pd.DataFrame({"Feature": X.columns, "Importance": result.importances_mean})
            return imp_df.sort_values(by="Importance", ascending=False)
