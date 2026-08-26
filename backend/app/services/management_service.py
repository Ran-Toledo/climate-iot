from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Command, Device, DeviceState
from app.schemas.command import CommandCreate


async def list_devices(db: AsyncSession) -> list[Device]:
    result = await db.execute(select(Device).order_by(Device.id))
    return list(result.scalars().all())


async def get_device(db: AsyncSession, device_id: int) -> Device | None:
    return await db.get(Device, device_id)


async def delete_device(db: AsyncSession, device: Device) -> None:
    # device_states/telemetry/commands rows cascade-delete via their FK's
    # ondelete="CASCADE" (see the 0001 migration) -- no manual cleanup needed.
    await db.delete(device)
    await db.commit()


async def get_device_state(db: AsyncSession, device_id: int) -> DeviceState | None:
    result = await db.execute(select(DeviceState).where(DeviceState.device_id == device_id))
    return result.scalar_one_or_none()


async def create_command(db: AsyncSession, device_id: int, payload: CommandCreate) -> Command:
    command = Command(
        device_id=device_id,
        type=payload.type,
        payload=payload.payload.model_dump(exclude_none=True),
    )
    db.add(command)

    device_state = await get_device_state(db, device_id)
    merged = dict(device_state.desired_state)
    if payload.payload.power is not None:
        merged["power"] = payload.payload.power
    if payload.payload.target_temperature is not None:
        merged["target_temperature"] = payload.payload.target_temperature
    device_state.desired_state = merged

    await db.commit()
    await db.refresh(command)
    return command
