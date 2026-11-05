from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    hardware_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    device_type: Mapped[str] = mapped_column(
        String(50), default="climate_controller", server_default="climate_controller"
    )
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
