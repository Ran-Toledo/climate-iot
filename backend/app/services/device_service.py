from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Device, DeviceState
from app.schemas.device import DeviceRegisterRequest

ONLINE_THRESHOLD = timedelta(seconds=30)


def is_device_online(device: Device) -> bool:
    if device.last_heartbeat_at is None:
        return False
    return datetime.now(timezone.utc) - device.last_heartbeat_at < ONLINE_THRESHOLD


async def register_device(db: AsyncSession, payload: DeviceRegisterRequest) -> Device:
    result = await db.execute(select(Device).where(Device.hardware_id == payload.hardware_id))
    device = result.scalar_one_or_none()

    if device is None:
        device = Device(
            hardware_id=payload.hardware_id,
            device_type=payload.device_type,
            name=payload.name,
        )
        db.add(device)
        await db.flush()
        db.add(DeviceState(device_id=device.id))
    else:
        device.device_type = payload.device_type
        device.name = payload.name

    await db.commit()
    await db.refresh(device)
    return device


async def get_device_by_hardware_id(db: AsyncSession, hardware_id: str) -> Device | None:
    result = await db.execute(select(Device).where(Device.hardware_id == hardware_id))
    return result.scalar_one_or_none()


async def record_heartbeat(db: AsyncSession, device: Device) -> Device:
    device.last_heartbeat_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(device)
    return device
