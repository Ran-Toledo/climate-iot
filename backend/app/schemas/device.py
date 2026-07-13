from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.device_state import DeviceStateOut


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
    last_heartbeat_at: datetime | None
    created_at: datetime


class DeviceSummary(DeviceOut):
    # online has no backing column (see Device model) - it's derived from
    # last_heartbeat_at at request time, so callers must set it explicitly
    # rather than via model_validate(device).
    online: bool


class DeviceDetail(DeviceSummary):
    device_state: DeviceStateOut | None
