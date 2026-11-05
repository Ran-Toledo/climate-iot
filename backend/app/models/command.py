import enum
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.types import UTCDateTime, utcnow


class CommandStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class Command(Base):
    __tablename__ = "commands"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(50), default="set_state", server_default="set_state")
    payload: Mapped[dict] = mapped_column(JSON)
    status: Mapped[CommandStatus] = mapped_column(
        Enum(CommandStatus, name="command_status", native_enum=False, create_constraint=True, values_callable=lambda e: [m.value for m in e]),
        default=CommandStatus.PENDING,
        server_default=CommandStatus.PENDING.value,
        index=True,
    )
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
