
import numpy as np


class Explainer:
    def __init__(self):
        pass

    def compute_confidence(
        self, 
        detector_margin: float, 
        dq_score: float, 
        rca_probs: dict[str, float],
        missing_channels: list[str]
    ) -> tuple[float, list[str]]:
        """
        Calculates confidence score and produces an audit log of penalties.
        confidence = detector_margin * dq_score * (rank1_prob - rank2_prob)
        """
        log = []
        
        # Determine Rank 1 - Rank 2 gap
        sorted_probs = sorted(rca_probs.values(), reverse=True)
        rank1 = sorted_probs[0] if len(sorted_probs) > 0 else 0.0
        rank2 = sorted_probs[1] if len(sorted_probs) > 1 else 0.0
        gap = max(0.0, rank1 - rank2)
        
        base_confidence = detector_margin * dq_score * gap
        # Clamp to [0.0, 1.0]
        confidence = max(0.0, min(1.0, base_confidence))
        
        log.append(f"Base margin contribution: {detector_margin:.2f}")
        log.append(f"Data-quality multiplier: {dq_score:.2f}")
        log.append(f"RCA separation gap (Rank1 - Rank2): {gap:.2f}")
        
        if dq_score < 0.8:
            log.append("Dropped confidence due to low DQ score (missing data).")
            for ch in missing_channels:
                log.append(f"  - Penalty: {ch} missing or heavily delayed during window.")
                
        if gap < 0.2:
            log.append("Dropped confidence due to ambiguous root cause (small gap between top candidates).")
            
        return float(confidence), log

    def generate_explanation(
        self, 
        root_cause: str, 
        residuals_dict: dict[str, np.ndarray],
        flagged_channels: list[str]
    ) -> tuple[str, dict[str, float]]:
        """
        Template-based explanation mapping per-channel residual share.
        """
        # Calculate residual sums over the event window
        total_residual = 0.0
        channel_sums = {}
        for ch in flagged_channels:
            if ch in residuals_dict:
                s = np.sum(np.abs(residuals_dict[ch]))
                channel_sums[ch] = s
                total_residual += s
                
        contributions = {}
        for ch, s in channel_sums.items():
            contributions[ch] = (s / total_residual) * 100 if total_residual > 0 else 0.0
            
        sorted_contribs = sorted(contributions.items(), key=lambda x: x[1], reverse=True)
        
        # Build template string
        lines = []
        lines.append(f"Anomaly highly correlated with subsystem: [{root_cause}].")
        lines.append(f"Detected {len(flagged_channels)} channels deviating beyond conformal bounds.")
        lines.append("Primary residual drivers:")
        
        for ch, pct in sorted_contribs[:3]: # Show top 3
            lines.append(f"  -> {ch}: {pct:.1f}% of total aggregate error")
            
        explanation = "\n".join(lines)
        return explanation, contributions
