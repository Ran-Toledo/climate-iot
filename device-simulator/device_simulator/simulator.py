import random
from dataclasses import dataclass

from device_simulator import config
from device_simulator.models import ClimateState


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


@dataclass
class Simulator:
    power: bool = False
    # int: matches the API's target_temperature contract (no AC hardware
    # supports fractional-degree setpoints). current_temperature stays
    # float -- it's a continuously-converging simulated sensor reading,
    # not a setpoint.
    target_temperature: int = int(config.STARTING_TEMPERATURE)
    current_temperature: float = config.STARTING_TEMPERATURE
    humidity: float = 45.0

    def apply_desired_state(self, desired: ClimateState) -> dict:
        if desired.power is not None:
            self.power = desired.power
        if desired.target_temperature is not None:
            self.target_temperature = desired.target_temperature
        return self.reported_state()

    def reported_state(self) -> dict:
        return {"power": self.power, "target_temperature": self.target_temperature}

    def tick(self) -> None:
        goal = self.target_temperature if self.power else config.AMBIENT_TEMPERATURE
        if self.current_temperature < goal:
            self.current_temperature = min(self.current_temperature + config.TEMPERATURE_STEP, goal)
        elif self.current_temperature > goal:
            self.current_temperature = max(self.current_temperature - config.TEMPERATURE_STEP, goal)

        self.humidity = _clamp(self.humidity + random.uniform(-0.5, 0.5), 30.0, 70.0)

    def telemetry(self) -> dict:
        return {
            "temperature": round(self.current_temperature, 2),
            "humidity": round(self.humidity, 1),
        }
