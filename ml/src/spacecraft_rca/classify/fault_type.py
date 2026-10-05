
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.tree import DecisionTreeClassifier, export_text

from ..utils import get_logger

logger = get_logger(__name__)

class NeighborPredictor:
    def __init__(self, dependency_graph_df: pd.DataFrame, signal_catalog_df: pd.DataFrame):
        self.models = {}
        self.neighbors = {}
        
        # Build mapping of subsystem dependencies
        subsystem_edges = []
        if dependency_graph_df is not None:
            for _, row in dependency_graph_df.iterrows():
                subsystem_edges.append((row['source_subsystem'], row['target_subsystem']))
                
        # Map signals to subsystems
        subsystem_signals = {}
        signal_to_sub = {}
        if signal_catalog_df is not None:
            for _, row in signal_catalog_df.iterrows():
                subsystem_signals.setdefault(row['subsystem'], []).append(row['signal'])
                signal_to_sub[row['signal']] = row['subsystem']
                
        # For each signal, find its neighbors (signals in source/target subsystems)
        all_signals = list(signal_to_sub.keys())
        for sig in all_signals:
            sub = signal_to_sub[sig]
            neighbor_sigs = set()
            for src, tgt in subsystem_edges:
                if src == sub:
                    neighbor_sigs.update(subsystem_signals.get(tgt, []))
                elif tgt == sub:
                    neighbor_sigs.update(subsystem_signals.get(src, []))
                    
            # Exclude self
            if sig in neighbor_sigs:
                neighbor_sigs.remove(sig)
                
            self.neighbors[sig] = list(neighbor_sigs)
            
    def fit(self, df_train: pd.DataFrame) -> None:
        """Trains Ridge regression models to predict each sensor from its neighbors."""
        for sig, neighbors in self.neighbors.items():
            if not neighbors:
                continue
            
            X = df_train[neighbors].fillna(0).values
            y = df_train[sig].fillna(0).values
            
            # Require at least some variance to fit meaningfully
            if len(X) > 0 and np.var(y) > 1e-6:
                model = Ridge(alpha=1.0)
                model.fit(X, y)
                self.models[sig] = model
                
    def get_agreement(self, df_event: pd.DataFrame, target_signal: str) -> float:
        """
        Returns the agreement (1.0 - relative error) between target signal and 
        its prediction from neighbors during the event window.
        Returns 0.0 if unable to predict (e.g. no neighbors).
        """
        if target_signal not in self.models or not self.neighbors[target_signal]:
            return 0.0
            
        model = self.models[target_signal]
        neighbors = self.neighbors[target_signal]
        
        X = df_event[neighbors].fillna(0).values
        y_true = df_event[target_signal].fillna(0).values
        
        if len(y_true) == 0:
            return 0.0
            
        y_pred = model.predict(X)
        
        # Calculate agreement as R^2 or a bounded absolute metric
        mse = np.mean((y_true - y_pred)**2)
        var = np.var(y_true)
        var = max(var, 1e-6)
            
        # bounded between 0 and 1
        agreement = max(0.0, 1.0 - (mse / var))
        return float(agreement)

class EventFeatureExtractor:
    def __init__(self, neighbor_predictor: NeighborPredictor):
        self.neighbor_predictor = neighbor_predictor
        
    def extract(self, df_event: pd.DataFrame, flagged_channels: list[str]) -> dict[str, float]:
        """
        Extracts features for an anomalous event window.
        """
        num_channels_flagged = len(flagged_channels)
        duration = len(df_event)
        
        # Jump shape: proxy via max diff over median for the primary flagged channels
        jump_shapes = []
        agreements = []
        for ch in flagged_channels:
            vals = df_event[ch].values
            if len(vals) > 1:
                jump_shape = np.max(np.abs(np.diff(vals))) / (np.median(np.abs(vals)) + 1e-6)
                jump_shapes.append(jump_shape)
            else:
                jump_shapes.append(0.0)
                
            agreement = self.neighbor_predictor.get_agreement(df_event, ch)
            agreements.append(agreement)
            
        return {
            "num_channels_flagged": float(num_channels_flagged),
            "duration": float(duration),
            "max_jump_shape": float(np.max(jump_shapes)) if jump_shapes else 0.0,
            "min_neighbor_agreement": float(np.min(agreements)) if agreements else 0.0
        }

class FaultClassifier:
    def __init__(self, max_depth: int = 4):
        self.tree = DecisionTreeClassifier(max_depth=max_depth, random_state=42)
        self.is_fitted = False
        
    def fit(self, X_features: pd.DataFrame, y_labels: pd.Series) -> None:
        """Trains the shallow decision tree on extracted features."""
        self.tree.fit(X_features, y_labels)
        self.is_fitted = True
        logger.info(f"Fitted Fault Classifier Tree with depth {self.tree.get_depth()}.")
        
    def get_tree_rules(self, feature_names: list[str]) -> str:
        if not self.is_fitted:
            return ""
        return export_text(self.tree, feature_names=feature_names)
        
    def predict(self, features: dict[str, float]) -> tuple[str, str]:
        """
        Applies heuristic rules first, then falls back to the Decision Tree.
        Returns (Label, RulePathText)
        """
        n_channels = features["num_channels_flagged"]
        duration = features["duration"]
        jump = features["max_jump_shape"]
        agreement = features["min_neighbor_agreement"]
        
        # RULE 1: Noise Burst
        if duration <= 3 and n_channels >= 3 and jump > 10.0:
            return "NOISE", "Rule: Short duration (<=3) with massive jump and widespread channels."
            
        # RULE 2: Sensor Fault (Single isolated drift/spike)
        if n_channels == 1 and agreement < 0.2:
            return "SENSOR_FAULT", "Rule: Isolated to 1 channel with severe disagreement against neighbors."
            
        # FALLBACK: Decision Tree for Subsystem faults vs complex Sensor faults
        if not self.is_fitted:
            return "SUBSYSTEM_FAULT", "Rule: Fallback (Tree not fitted), widespread persistent deviation."
            
        # Convert to DF for predict
        df_feat = pd.DataFrame([features])
        label = self.tree.predict(df_feat)[0]
        
        # We trace the rule path in the tree
        # For simplicity in this mock, we just state it was classified by the tree.
        return label, "Rule: Classified via Decision Tree traversal."
