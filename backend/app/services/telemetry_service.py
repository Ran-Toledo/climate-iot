from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Telemetry
from app.schemas.telemetry import TelemetryIn


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
