"""Runs the API's two listeners in one process (`python -m app.serve`).

- API listener, API_PORT (default 8000): app.main.app, the full API. The
  frontend's nginx proxies to it over the Docker network; docker-compose.yml
  publishes it on 127.0.0.1 only, for /docs and debugging.
- Device listener, DEVICE_API_PORT (default 8001): app.main.device_app
  (only /api/v1/device/*). docker-compose.yml publishes this one on the LAN
  for the ESP32.

Both run on one event loop and share one database engine, so SQLite keeps
a single writer process. If either listener stops (a signal, or a failed
start such as a port already in use), the other is stopped too and the
process exits, so a half-working container never lingers.
"""

import asyncio
import contextlib
import logging
import os
import signal

import uvicorn

from app.main import app, device_app
from app.security import warn_if_device_key_missing

logger = logging.getLogger("uvicorn.error")


class _Server(uvicorn.Server):
    # uvicorn.Server installs its own SIGINT/SIGTERM handlers per server; with
    # two servers the second would replace the first's. main() handles the
    # signals for both instead.
    @contextlib.contextmanager
    def capture_signals(self):
        yield


async def main() -> None:
    host = os.environ.get("APP_HOST", "0.0.0.0")
    internal_port = int(os.environ.get("API_PORT", "8000"))
    device_port = int(os.environ.get("DEVICE_API_PORT", "8001"))
    if device_port == internal_port:
        raise SystemExit("API_PORT and DEVICE_API_PORT must differ")

    servers = [
        _Server(uvicorn.Config(device_app, host=host, port=device_port)),
        _Server(uvicorn.Config(app, host=host, port=internal_port)),
    ]

    signalled = False

    def on_signal() -> None:
        nonlocal signalled
        signalled = True
        stop_all()

    def stop_all() -> None:
        for server in servers:
            server.should_exit = True

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, on_signal)
        except NotImplementedError:  # Windows: no loop signal handlers
            signal.signal(sig, lambda *_: on_signal())

    warn_if_device_key_missing()
    logger.info(
        "Device listener on %s:%d (device API only); API listener on %s:%d (full API)",
        host, device_port, host, internal_port,
    )

    tasks = [asyncio.create_task(server.serve()) for server in servers]
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    stop_all()
    await asyncio.gather(*pending, return_exceptions=True)
    for task in done:
        task.result()  # re-raise a listener's startup failure, if any

    if not signalled:
        logger.error("A listener stopped on its own; shutting down the other.")
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
