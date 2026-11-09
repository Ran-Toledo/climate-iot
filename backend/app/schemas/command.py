from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.command import CommandStatus
from app.schemas.device_state import ClimateState, StrictPower, StrictTargetTemperature

# The only command type the firmware handles (see CommandProcessor.cpp).
CommandType = Literal["set_state"]


class CommandPayload(BaseModel):
    """What a set_state command may ask for. Strict and closed: unknown keys,
    wrong types and out-of-range temperatures are rejected here (422) rather
    than queued for the device to fail."""

    model_config = ConfigDict(extra="forbid")

    power: StrictPower | None = None
    target_temperature: StrictTargetTemperature | None = None

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "CommandPayload":
        if self.power is None and self.target_temperature is None:
            raise ValueError("payload must set at least one of 'power' or 'target_temperature'")
        return self


class CommandCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: CommandType = "set_state"
    payload: CommandPayload


class CommandResult(BaseModel):
    """The AC state a device reports back after a command. Same field rules as
    a command; unknown keys are ignored (and not stored)."""

    power: StrictPower | None = None
    target_temperature: StrictTargetTemperature | None = None


class CommandResultIn(BaseModel):
    status: Literal[CommandStatus.COMPLETED, CommandStatus.FAILED]
    result: CommandResult | None = None


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
