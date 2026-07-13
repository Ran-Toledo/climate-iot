from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import CommandStatus, Device
from app.schemas.command import CommandOut, CommandResultIn
from app.schemas.device import DeviceHeartbeatRequest, DeviceOut, DeviceRegisterRequest
from app.schemas.telemetry import TelemetryIn
from app.services import command_service, device_service, telemetry_service

router = APIRouter(prefix="/api/v1/device", tags=["device"])


async def _get_device_or_404(db: AsyncSession, hardware_id: str) -> Device:
    device = await device_service.get_device_by_hardware_id(db, hardware_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="device not registered")
    return device


@router.post("/register", response_model=DeviceOut)
async def register(payload: DeviceRegisterRequest, db: AsyncSession = Depends(get_db)):
    return await device_service.register_device(db, payload)


@router.post("/heartbeat", response_model=DeviceOut)
async def heartbeat(payload: DeviceHeartbeatRequest, db: AsyncSession = Depends(get_db)):
    device = await _get_device_or_404(db, payload.hardware_id)
    return await device_service.record_heartbeat(db, device)


@router.post("/telemetry", status_code=status.HTTP_201_CREATED)
async def submit_telemetry(payload: TelemetryIn, db: AsyncSession = Depends(get_db)):
    device = await _get_device_or_404(db, payload.hardware_id)
    await telemetry_service.record_telemetry(db, device.id, payload)
    return {"status": "ok"}


@router.get("/commands/next", response_model=CommandOut | None)
async def next_command(hardware_id: str, db: AsyncSession = Depends(get_db)):
    device = await _get_device_or_404(db, hardware_id)
    return await command_service.get_next_pending_command(db, device.id)


@router.post("/commands/{command_id}/result", response_model=CommandOut)
async def submit_command_result(
    command_id: int, payload: CommandResultIn, db: AsyncSession = Depends(get_db)
):
    command = await command_service.get_command(db, command_id)
    if command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="command not found")
    if command.status != CommandStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="command already resolved")
    return await command_service.apply_command_result(db, command, payload)
