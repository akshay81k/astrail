
from pydantic import BaseModel, Field


class ActionItem(BaseModel):
    action: str = Field(description="The recommended action text")
    risk_level: str = Field(description="Associated risk level (e.g., HIGH, CRITICAL)")
    is_safe: bool = Field(description="Whether safety checks passed to execute this action")
    escalate: bool = Field(description="Whether this action requires immediate escalation")
    safety_notes: str | None = Field(None, description="Reasons if action was blocked by safety checks")

class IncidentReport(BaseModel):
    incident_id: str = Field(description="Unique ID for this incident")
    timestamp: str = Field(description="Timestamp of the incident evaluation")
    root_cause_subsystem: str = Field(description="The Top-1 ranked subsystem")
    confidence: float = Field(description="Calculated confidence score [0.0, 1.0]")
    confidence_log: list[str] = Field(description="Log of factors affecting confidence")
    explanation_text: str = Field(description="Template-based structural explanation")
    channel_contributions: dict[str, float] = Field(description="Percentage share of total residuals per channel")
    recommended_actions: list[ActionItem] = Field(description="Ranked list of actions")
