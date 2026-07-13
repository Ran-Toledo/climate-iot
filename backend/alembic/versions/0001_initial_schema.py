"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-13

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("hardware_id", sa.String(length=100), nullable=False),
        sa.Column("device_type", sa.String(length=50), nullable=False, server_default="climate_controller"),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_devices_hardware_id", "devices", ["hardware_id"], unique=True)

    op.create_table(
        "device_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("desired_state", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("reported_state", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_device_states_device_id", "device_states", ["device_id"], unique=True)

    op.create_table(
        "telemetry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("temperature", sa.Float(), nullable=False),
        sa.Column("humidity", sa.Float(), nullable=False),
        sa.Column("co2", sa.Float(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_telemetry_device_id", "telemetry", ["device_id"])
    op.create_index("ix_telemetry_recorded_at", "telemetry", ["recorded_at"])

    command_status = postgresql.ENUM(
        "pending", "completed", "failed", name="command_status", create_type=False
    )
    command_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "commands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False, server_default="set_state"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", command_status, nullable=False, server_default="pending"),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_commands_device_id", "commands", ["device_id"])
    op.create_index("ix_commands_status", "commands", ["status"])


def downgrade() -> None:
    op.drop_index("ix_commands_status", table_name="commands")
    op.drop_index("ix_commands_device_id", table_name="commands")
    op.drop_table("commands")
    postgresql.ENUM(name="command_status").drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_telemetry_recorded_at", table_name="telemetry")
    op.drop_index("ix_telemetry_device_id", table_name="telemetry")
    op.drop_table("telemetry")

    op.drop_index("ix_device_states_device_id", table_name="device_states")
    op.drop_table("device_states")

    op.drop_index("ix_devices_hardware_id", table_name="devices")
    op.drop_table("devices")
