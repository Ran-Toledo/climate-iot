from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

# The range the AC firmware accepts (kMinTempC/kMaxTempC in CommandProcessor.cpp);
# it rejects anything else as a failed command. Keep in sync with the
# frontend's MIN_TARGET_TEMP/MAX_TARGET_TEMP.
MIN_TARGET_TEMP = 16
MAX_TARGET_TEMP = 30

# Strict: a JSON boolean / whole number only. Rejects "yes", 1, "22", 22.0, true-as-int.
StrictPower = StrictBool
StrictTargetTemperature = Annotated[StrictInt, Field(ge=MIN_TARGET_TEMP, le=MAX_TARGET_TEMP)]


class ClimateState(BaseModel):
    """A state as stored and returned. Deliberately lenient: it must be able to
    load any row already in the database. Use CommandPayload / CommandResult
    to validate what comes in."""

    model_config = ConfigDict(from_attributes=True)

    power: bool | None = None
    target_temperature: int | None = None


class DeviceStateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    desired_state: ClimateState
    reported_state: ClimateState
    updated_at: datetime
