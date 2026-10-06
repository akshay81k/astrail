from typing import List, Dict

class ExplainerEngine:
    def generate_explanation(self, flagged_sensors: List[str], current_readings: Dict[str, float], 
                           predictions: Dict[str, float], root_cause_candidates: List[Dict]) -> str:
        
        if not flagged_sensors:
            return "No anomalies detected."
            
        explanations = []
        for sig in flagged_sensors[:2]:
            actual = current_readings.get(sig, 0)
            pred = predictions.get(sig, 0)
            diff = actual - pred
            direction = "above" if diff > 0 else "below"
            
            # Simulated sigma logic for parity
            sigma = max(0.1, abs(diff) / 2.5) 
            
            explanations.append(f"{sig} {sigma:.1f} sigma {direction} forecast")
            
        explanation_str = " and ".join(explanations)
        return explanation_str[0].upper() + explanation_str[1:]
