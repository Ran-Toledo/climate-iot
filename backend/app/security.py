"""Shared-secret check for the device API (X-Device-Key header).

The key is read from DEVICE_API_KEY on every request, so tests and a
restarted container both see the current value. Neither the key nor the
header is ever logged.
"""

import hmac
import logging
import os

from fastapi import Header, HTTPException, status

logger = logging.getLogger("uvicorn.error")

GENERATE_HINT = 'python -c "import secrets; print(secrets.token_urlsafe(32))"'


def configured_device_key() -> str | None:
    key = os.environ.get("DEVICE_API_KEY", "").strip()
    return key or None


def warn_if_device_key_missing() -> None:
    if configured_device_key() is None:
        logger.warning(
            "DEVICE_API_KEY is not set: every /api/v1/device/* request will get 503 "
            "until it is. Generate one with %s and add it to .env.",
            GENERATE_HINT,
        )


async def require_device_key(
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
) -> None:
    expected = configured_device_key()
    if expected is None:
        # Fail closed: an unconfigured server must not accept anything.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="device API key is not configured on the server",
        )
    # compare_digest on bytes: constant-time, and safe for non-ASCII input.
    if x_device_key is None or not hmac.compare_digest(
        x_device_key.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing or invalid device key",
        )
