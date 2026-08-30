from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TelemetryIn(BaseModel):
    hardware_id: str
    temperature: float
    humidity: float


class TelemetryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    temperature: float
    humidity: float
    recorded_at: datetime
