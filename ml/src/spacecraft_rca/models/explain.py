from typing import List, Dict

class ExplainerEngine:
    def generate_explanation(self, flagged_sensors: List[str], current_readings: Dict[str, float], 
                           predictions: Dict[str, float], root_cause_candidates: List[Dict]) -> str:
        
        if not flagged_sensors:
            return "No anomalies detected."
            
        explanations = []
        # Describe the top 2 highest deviating sensors
        for sig in flagged_sensors[:2]:
            actual = current_readings.get(sig, 0)
            pred = predictions.get(sig, 0)
            diff = actual - pred
            direction = "rose" if diff > 0 else "fell"
            
            # Format nicely
            diff_abs = abs(diff)
            if diff_abs < 0.1:
                diff_str = f"{diff_abs:.3f}"
            elif diff_abs > 1000:
                diff_str = f"{diff_abs:.0f}"
            else:
                diff_str = f"{diff_abs:.1f}"
                
            explanations.append(f"{sig} {direction} {diff_str} units beyond forecast")
            
        explanation_str = " and ".join(explanations)
        
        # Append the root cause deduction
        if root_cause_candidates:
            top_rc = root_cause_candidates[0]["subsystem"]
            conf = root_cause_candidates[0]["confidence_score"]
            explanation_str += f", so the likely source is the {top_rc} subsystem ({conf}% confidence)."
        else:
            explanation_str += ", but no isolated subsystem root cause could be determined."
            
        # Capitalize first letter
        return explanation_str[0].upper() + explanation_str[1:]
