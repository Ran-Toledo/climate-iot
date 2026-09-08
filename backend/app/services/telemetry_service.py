from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
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

    # Bucket the window into `limit` equal-width slices and keep the latest
    # reading per bucket, so a wide window (e.g. 30D) is sampled evenly
    # across its full span. Plain order-by-recent + limit would only ever
    # return the newest `limit` rows -- at the device's ~5s telemetry
    # cadence that's just the last few minutes, silently hiding everything
    # older regardless of how far back `since` reaches.
    window_seconds = max((until - since).total_seconds(), 1)
    bucket_seconds = max(window_seconds / limit, 1)
    bucket = func.floor(func.extract("epoch", Telemetry.recorded_at - since) / bucket_seconds)

    result = await db.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device_id)
        .where(Telemetry.recorded_at >= since)
        .where(Telemetry.recorded_at <= until)
        .distinct(bucket)
        .order_by(bucket, Telemetry.recorded_at.desc())
    )
    return list(result.scalars().all())


async def get_latest_telemetry(db: AsyncSession, device_id: int) -> Telemetry | None:
    result = await db.execute(
        select(Telemetry)
        .where(Telemetry.device_id == device_id)
        .order_by(Telemetry.recorded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
