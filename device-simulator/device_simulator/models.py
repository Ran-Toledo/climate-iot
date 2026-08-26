from pydantic import BaseModel


class ClimateState(BaseModel):
    power: bool | None = None
    target_temperature: int | None = None


class Command(BaseModel):
    id: int
    payload: ClimateState
