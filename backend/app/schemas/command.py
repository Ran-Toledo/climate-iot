from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.command import CommandStatus
from app.schemas.device_state import ClimateState


class CommandCreate(BaseModel):
    type: str = "set_state"
    payload: ClimateState

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "CommandCreate":
        if self.payload.power is None and self.payload.target_temperature is None:
            raise ValueError("payload must set at least one of 'power' or 'target_temperature'")
        return self


class CommandResultIn(BaseModel):
    status: Literal[CommandStatus.COMPLETED, CommandStatus.FAILED]
    result: dict | None = None


class CommandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: int
    type: str
    payload: ClimateState
    status: CommandStatus
    result: dict | None
    created_at: datetime
    completed_at: datetime | None
