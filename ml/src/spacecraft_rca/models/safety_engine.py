import pandas as pd
from pathlib import Path
from typing import List, Dict

class SafetyEngine:
    def __init__(self, data_root: Path):
        self.rules = pd.read_csv(data_root / "metadata" / "risk_action_rules.csv")
        
    def evaluate(self, flagged_sensors: List[str], current_readings: Dict[str, float]) -> Dict:
        actions = []
        highest_risk = "LOW"
        risk_levels = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
        
        for _, rule in self.rules.iterrows():
            sig = rule['signal']
            if sig in flagged_sensors:
                val = current_readings.get(sig, 0)
                # simple eval of trigger condition (e.g., "<25.0 or >31.0")
                trigger = rule['trigger']
                triggered = False
                
                # A quick and dirty parser for the trigger string
                conditions = [c.strip() for c in trigger.split('or')]
                for cond in conditions:
                    try:
                        if cond.startswith('<'):
                            if val < float(cond[1:]): triggered = True
                        elif cond.startswith('>'):
                            if val > float(cond[1:]): triggered = True
                    except:
                        pass
                
                # If trigger matches (or if it's just anomalous and we want to warn anyway)
                if triggered:
                    actions.append({
                        "signal": sig,
                        "risk": rule['risk'],
                        "action": rule['recommended_action']
                    })
                    if risk_levels.get(rule['risk'], 1) > risk_levels.get(highest_risk, 1):
                        highest_risk = rule['risk']
                        
        # If sensors are flagged but no explicit rule triggers, assign a generic action
        if flagged_sensors and not actions:
            highest_risk = "MEDIUM"
            actions.append({
                "signal": flagged_sensors[0],
                "risk": "MEDIUM",
                "action": "Investigate anomalous telemetry behavior"
            })
            
        return {
            "overall_risk": highest_risk,
            "recommended_actions": actions
        }
