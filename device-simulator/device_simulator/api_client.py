import httpx

from device_simulator import config
from device_simulator.models import Command


class ApiClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=config.API_BASE_URL, timeout=5.0)

    async def register(self) -> None:
        response = await self._client.post(
            "/api/v1/device/register",
            json={
                "hardware_id": config.HARDWARE_ID,
                "device_type": "climate_controller",
                "name": config.DEVICE_NAME,
            },
        )
        response.raise_for_status()

    async def heartbeat(self) -> None:
        response = await self._client.post(
            "/api/v1/device/heartbeat", json={"hardware_id": config.HARDWARE_ID}
        )
        response.raise_for_status()

    async def send_telemetry(self, temperature: float, humidity: float, co2: float) -> None:
        response = await self._client.post(
            "/api/v1/device/telemetry",
            json={
                "hardware_id": config.HARDWARE_ID,
                "temperature": temperature,
                "humidity": humidity,
                "co2": co2,
            },
        )
        response.raise_for_status()

    async def get_next_command(self) -> Command | None:
        response = await self._client.get(
            "/api/v1/device/commands/next", params={"hardware_id": config.HARDWARE_ID}
        )
        response.raise_for_status()
        data = response.json()
        return Command.model_validate(data) if data else None

    async def submit_result(self, command_id: int, status: str, result: dict) -> None:
        response = await self._client.post(
            f"/api/v1/device/commands/{command_id}/result",
            json={"status": status, "result": result},
        )
        response.raise_for_status()

    async def aclose(self) -> None:
        await self._client.aclose()
