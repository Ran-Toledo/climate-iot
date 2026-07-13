from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ClimateState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    power: bool | None = None
    target_temperature: float | None = None


class DeviceStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    desired_state: ClimateState
    reported_state: ClimateState
    updated_at: datetime
