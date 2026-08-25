from pydantic import BaseModel


class TelemetryIn(BaseModel):
    hardware_id: str
    temperature: float
    humidity: float
