import asyncio
import logging

import httpx

from device_simulator import config
from device_simulator.api_client import ApiClient
from device_simulator.simulator import Simulator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("device_simulator")


async def register_with_retry(client: ApiClient) -> None:
    while True:
        try:
            await client.register()
            logger.info("registered as %s", config.HARDWARE_ID)
            return
        except httpx.HTTPError as exc:
            logger.warning("registration failed (%s), retrying in 3s", exc)
            await asyncio.sleep(3)


async def heartbeat_loop(client: ApiClient) -> None:
    while True:
        try:
            await client.heartbeat()
        except httpx.HTTPError as exc:
            logger.warning("heartbeat failed: %s", exc)
        await asyncio.sleep(config.HEARTBEAT_INTERVAL_SECONDS)


async def telemetry_loop(client: ApiClient, simulator: Simulator) -> None:
    while True:
        simulator.tick()
        reading = simulator.telemetry()
        try:
            await client.send_telemetry(**reading)
            logger.info("telemetry sent: %s", reading)
        except httpx.HTTPError as exc:
            logger.warning("telemetry failed: %s", exc)
        await asyncio.sleep(config.TELEMETRY_INTERVAL_SECONDS)


async def command_loop(client: ApiClient, simulator: Simulator) -> None:
    while True:
        try:
            command = await client.get_next_command()
            if command is not None:
                reported = simulator.apply_desired_state(command.payload)
                await client.submit_result(command.id, "completed", reported)
                logger.info("executed command %s -> %s", command.id, reported)
        except httpx.HTTPError as exc:
            logger.warning("command poll/result failed: %s", exc)
        await asyncio.sleep(config.COMMAND_POLL_INTERVAL_SECONDS)


async def main() -> None:
    client = ApiClient()
    simulator = Simulator()

    await register_with_retry(client)

    try:
        await asyncio.gather(
            heartbeat_loop(client),
            telemetry_loop(client, simulator),
            command_loop(client, simulator),
        )
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
