from pydantic import BaseModel


class ClimateState(BaseModel):
    power: bool | None = None
    target_temperature: float | None = None


class Command(BaseModel):
    id: int
    payload: ClimateState
