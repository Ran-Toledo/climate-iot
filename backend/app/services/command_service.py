from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Command, CommandStatus, DeviceState
from app.schemas.command import CommandResultIn
from app.schemas.device_state import ClimateState


async def get_next_pending_command(db: AsyncSession, device_id: int) -> Command | None:
    result = await db.execute(
        select(Command)
        .where(Command.device_id == device_id, Command.status == CommandStatus.PENDING)
        .order_by(Command.created_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_command(db: AsyncSession, command_id: int) -> Command | None:
    return await db.get(Command, command_id)


async def apply_command_result(db: AsyncSession, command: Command, payload: CommandResultIn) -> Command:
    command.status = payload.status
    command.result = payload.result
    command.completed_at = datetime.now(timezone.utc)

    if payload.status == CommandStatus.COMPLETED:
        state_result = await db.execute(
            select(DeviceState).where(DeviceState.device_id == command.device_id)
        )
        device_state = state_result.scalar_one()

        reported = ClimateState.model_validate(payload.result or {})
        merged = dict(device_state.reported_state)
        if reported.power is not None:
            merged["power"] = reported.power
        if reported.target_temperature is not None:
            merged["target_temperature"] = reported.target_temperature
        device_state.reported_state = merged

    await db.commit()
    await db.refresh(command)
    return command
