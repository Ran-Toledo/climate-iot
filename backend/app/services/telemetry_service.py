from datetime import datetime, timedelta, timezone

from sqlalchemy import Integer, cast, func, select
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
    # Query params without an offset are taken as UTC, as Postgres did.
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    limit = min(limit, MAX_LIMIT)

    # Bucket the window into `limit` equal-width slices and keep the latest
    # reading per bucket, so a wide window (e.g. 30D) is sampled evenly
    # across its full span. Plain order-by-recent + limit would only ever
    # return the newest `limit` rows -- at the device's ~5s telemetry
    # cadence that's just the last few minutes, silently hiding everything
    # older regardless of how far back `since` reaches.
    window_seconds = max((until - since).total_seconds(), 1)
    bucket_seconds = max(window_seconds / limit, 1)

    # Seconds since `since`, computed in SQLite. unixepoch(..., 'subsec') is
    # exact; julianday() arithmetic is floating-point days and can push a
    # reading on a bucket boundary into the neighbouring bucket. `since` is
    # passed in the same naive-UTC text form UTCDateTime stores.
    since_text = since.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")
    offset_seconds = func.unixepoch(Telemetry.recorded_at, "subsec") - func.unixepoch(
        since_text, "subsec"
    )
    bucket = cast(func.floor(offset_seconds / bucket_seconds), Integer)

    # Latest reading per bucket: rank rows within each bucket newest-first
    # and keep rank 1 (SQLite has no DISTINCT ON).
    ranked = (
        select(
            Telemetry.id,
            bucket.label("bucket"),
            func.row_number()
            .over(partition_by=bucket, order_by=Telemetry.recorded_at.desc())
            .label("rank"),
        )
        .where(Telemetry.device_id == device_id)
        .where(Telemetry.recorded_at >= since)
        .where(Telemetry.recorded_at <= until)
        .subquery()
    )

    result = await db.execute(
        select(Telemetry)
        .join(ranked, ranked.c.id == Telemetry.id)
        .where(ranked.c.rank == 1)
        .order_by(ranked.c.bucket)
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
