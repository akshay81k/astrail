
import numpy as np

from ..utils import get_logger

logger = get_logger(__name__)

def fuse_detections(gru_scores: np.ndarray, gru_thresh: float, iforest_scores: np.ndarray, iforest_thresh: float) -> np.ndarray:
    """
    Alert if GRU alone crosses its primary threshold, 
    OR if both (GRU and IForest) cross their lowered combined thresholds (e.g. 0.8x threshold).
    """
    gru_alert = gru_scores > gru_thresh
    
    # Lowered thresholds for combined logic
    gru_low = gru_scores > (gru_thresh * 0.8)
    iforest_low = iforest_scores > (iforest_thresh * 0.8)
    
    combined_alert = gru_low & iforest_low
    
    final_alert = gru_alert | combined_alert
    return final_alert.astype(int)

def evaluate_metrics(alerts: np.ndarray, ground_truth_mask: np.ndarray, static_alerts: np.ndarray) -> dict[str, float]:
    """
    Calculates precision, recall, f1, and lead time over the ground truth faults.
    """
    tp = np.sum((alerts == 1) & (ground_truth_mask == 1))
    fp = np.sum((alerts == 1) & (ground_truth_mask == 0))
    fn = np.sum((alerts == 0) & (ground_truth_mask == 1))
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    
    # Calculate Lead Time vs Static Limit (assuming static is the baseline)
    # Lead time = number of rows before the static limit triggers within the fault window
    # We find the first index of alert inside the fault window for both
    fault_indices = np.where(ground_truth_mask == 1)[0]
    
    if len(fault_indices) > 0:
        first_alert = np.where(alerts[fault_indices] == 1)[0]
        first_static = np.where(static_alerts[fault_indices] == 1)[0]
        
        idx_alert = fault_indices[first_alert[0]] if len(first_alert) > 0 else -1
        idx_static = fault_indices[first_static[0]] if len(first_static) > 0 else -1
        
        if idx_alert != -1 and idx_static != -1:
            lead_time = idx_static - idx_alert
        elif idx_alert != -1 and idx_static == -1:
            # We detected it but static didn't (infinite lead time, but let's cap it at the window length)
            lead_time = len(fault_indices) - first_alert[0]
        else:
            lead_time = 0.0
    else:
        lead_time = 0.0
        
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "lead_time_rows": lead_time
    }
