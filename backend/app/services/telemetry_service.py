from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Telemetry
from app.schemas.telemetry import TelemetryIn

DEFAULT_WINDOW = timedelta(hours=24)
MAX_LIMIT = 1000


async def record_telemetry(db: AsyncSession, device_id: int, payload: TelemetryIn) -> Telemetry:
    telemetry = Telemetry(
        device_id=device_id,
        temperature=payload.temperature,
        humidity=payload.humidity,
    )
    db.add(telemetry)
    await db.commit()
    await db.refresh(telemetry)
    return telemetry


async def list_telemetry(
    db: AsyncSession,
    device_id: int,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 500,
) -> list[Telemetry]:
    now = datetime.now(timezone.utc)
    since = since or now - DEFAULT_WINDOW
    until = until or now
    limit = min(limit, MAX_LIMIT)

    # Order desc + limit first so a truncated window keeps the most recent
    # readings (what a graph needs), then reverse back to oldest-first for
    # the response -- asc + limit would silently keep the *oldest* rows and
    # cut off everything since, which is backwards for a time-series chart.
    result = await db.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device_id)
        .where(Telemetry.recorded_at >= since)
        .where(Telemetry.recorded_at <= until)
        .order_by(Telemetry.recorded_at.desc())
        .limit(limit)
    )
    readings = list(result.scalars().all())
    readings.reverse()
    return readings


async def get_latest_telemetry(db: AsyncSession, device_id: int) -> Telemetry | None:
    result = await db.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device_id)
        .order_by(Telemetry.recorded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
