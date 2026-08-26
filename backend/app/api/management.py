from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.command import CommandCreate, CommandOut
from app.schemas.device import DeviceDetail, DeviceOut, DeviceSummary
from app.schemas.device_state import DeviceStateOut
from app.services import command_service, management_service
from app.services.device_service import is_device_online

router = APIRouter(prefix="/api/v1/management", tags=["management"])


@router.get("/devices", response_model=list[DeviceSummary])
async def list_devices(db: AsyncSession = Depends(get_db)):
    devices = await management_service.list_devices(db)
    return [
        DeviceSummary(**DeviceOut.model_validate(device).model_dump(), online=is_device_online(device))
        for device in devices
    ]


@router.get("/devices/{device_id}", response_model=DeviceDetail)
async def get_device(device_id: int, db: AsyncSession = Depends(get_db)):
    device = await management_service.get_device(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="device not found")

    device_state = await management_service.get_device_state(db, device_id)
    return DeviceDetail(
        **DeviceOut.model_validate(device).model_dump(),
        online=is_device_online(device),
        device_state=DeviceStateOut.model_validate(device_state) if device_state else None,
    )


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(device_id: int, db: AsyncSession = Depends(get_db)):
    device = await management_service.get_device(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="device not found")
    await management_service.delete_device(db, device)


@router.post(
    "/devices/{device_id}/commands", response_model=CommandOut, status_code=status.HTTP_201_CREATED
)
async def create_command(device_id: int, payload: CommandCreate, db: AsyncSession = Depends(get_db)):
    device = await management_service.get_device(db, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="device not found")
    return await management_service.create_command(db, device_id, payload)


@router.get("/commands/{command_id}", response_model=CommandOut)
async def get_command(command_id: int, db: AsyncSession = Depends(get_db)):
    command = await command_service.get_command(db, command_id)
    if command is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="command not found")
    return command
