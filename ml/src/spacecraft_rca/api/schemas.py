import math

from pydantic import BaseModel, Field, field_validator


class TelemetryRow(BaseModel):
    timestamp: float = Field(..., description="UNIX timestamp")
    mode: str = Field(..., pattern="^(NOMINAL|SAFE|SCIENCE|ECLIPSE)$")
    signals: dict[str, float] = Field(..., description="Sensor readings")

    @field_validator("signals")
    def validate_signals(cls, v):
        for key, val in v.items():
            if not math.isfinite(val):
                raise ValueError(f"Signal {key} must be a finite float, got NaN/Inf")
            if val < -1e6 or val > 1e6:
                raise ValueError(f"Signal {key} out of safe absolute bounds")
        return v

class TelemetryBatch(BaseModel):
    batch_id: str = Field(..., max_length=64)
    data: list[TelemetryRow] = Field(..., max_length=500, description="Max 500 rows per batch")
