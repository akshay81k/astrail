import datetime
import uuid

import pandas as pd

from ..explain.explainer import Explainer
from ..explain.schema import ActionItem, IncidentReport


class Responder:
    def __init__(self, risk_rules_df: pd.DataFrame):
        self.risk_rules = risk_rules_df
        
    def _apply_safety_checks(self, action_text: str, current_telemetry: pd.DataFrame) -> Tuple[bool, str]:
        """
        Checks hard safety constraints before permitting an action.
        """
        # If telemetry is empty or missing required signals, block unsafe actions
        if current_telemetry.empty:
            return False, "Telemetry unavailable for safety verification."
            
        recent_row = current_telemetry.iloc[-1]
        
        # Example Rule: No heater action when power budget is low
        if "heater" in action_text.lower():
            if 'battery_soc_pct' in recent_row and recent_row['battery_soc_pct'] < 20.0:
                return False, "SAFETY BLOCK: Battery SoC < 20%. Cannot activate thermal heaters."
                
        # Example Rule: No heavy compute jobs during eclipse / low solar
        if "compute" in action_text.lower() or "reboot" in action_text.lower():
            if 'mode' in recent_row and recent_row['mode'] == 'ECLIPSE':
                return False, "SAFETY BLOCK: Cannot reboot or execute heavy compute cycles during ECLIPSE mode."
                
        return True, "Passed basic safety constraints."

    def generate_incident_report(
        self,
        telemetry_window: pd.DataFrame,
        root_cause_subsystem: str,
        detector_margin: float,
        dq_score: float,
        rca_probs: dict[str, float],
        residuals_dict: dict[str, np.ndarray],
        flagged_channels: list[str],
        missing_channels: list[str],
        duration_minutes: float
    ) -> IncidentReport:
        """
        Compiles the explainer outputs and actionable rules into a strictly validated Pydantic JSON.
        """
        explainer = Explainer()
        
        # Explain module
        confidence, log = explainer.compute_confidence(detector_margin, dq_score, rca_probs, missing_channels)
        explanation_text, contributions = explainer.generate_explanation(root_cause_subsystem, residuals_dict, flagged_channels)
        
        # Response module
        actions = []
        if self.risk_rules is not None:
            # Filter rules for the identified root cause subsystem
            relevant_rules = self.risk_rules[self.risk_rules['subsystem'] == root_cause_subsystem]
            
            for _, rule in relevant_rules.iterrows():
                is_safe, safety_note = self._apply_safety_checks(rule['recommended_action'], telemetry_window)
                
                # Escalation logic: If the anomaly has persisted for > N minutes without resolution
                escalate = duration_minutes > 15.0 and rule['risk'] in ['HIGH', 'CRITICAL']
                
                actions.append(ActionItem(
                    action=rule['recommended_action'],
                    risk_level=rule['risk'],
                    is_safe=is_safe,
                    escalate=escalate,
                    safety_notes=safety_note if not is_safe else None
                ))
                
        # Sort actions: safe first, then by risk (CRITICAL first, etc. mock sort)
        risk_map = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
        actions.sort(key=lambda x: (x.is_safe, risk_map.get(x.risk_level, 0)), reverse=True)
        
        # Compile Report
        report = IncidentReport(
            incident_id=f"INC-{uuid.uuid4().hex[:8].upper()}",
            timestamp=datetime.datetime.now().isoformat(),
            root_cause_subsystem=root_cause_subsystem,
            confidence=confidence,
            confidence_log=log,
            explanation_text=explanation_text,
            channel_contributions=contributions,
            recommended_actions=actions
        )
        
        return report
