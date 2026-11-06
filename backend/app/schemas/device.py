from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.device_state import DeviceStateOut
from app.schemas.telemetry import TelemetryOut


class DeviceRegisterRequest(BaseModel):
    hardware_id: str
    device_type: str = "climate_controller"
    name: str | None = None


class DeviceHeartbeatRequest(BaseModel):
    hardware_id: str


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hardware_id: str
    device_type: str
    name: str | None
    display_name: str | None
    last_heartbeat_at: datetime | None
    created_at: datetime


class DeviceUpdate(BaseModel):
    # App-side name only. null, or a blank string, clears it so the app
    # falls back to the device-reported name.
    display_name: str | None = Field(default=None, max_length=100)

    @field_validator("display_name")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class DeviceSummary(DeviceOut):
    # online has no backing column (see Device model) - it's derived from
    # last_heartbeat_at at request time, so callers must set it explicitly
    # rather than via model_validate(device).
    online: bool
    latest_telemetry: TelemetryOut | None = None
    device_state: DeviceStateOut | None = None
