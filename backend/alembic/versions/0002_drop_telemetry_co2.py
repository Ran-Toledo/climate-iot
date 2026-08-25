"""drop telemetry.co2

The project's only sensor hardware (DHT11 on the ESP32 firmware) measures
temperature/humidity, not CO2. Rather than have the firmware send a
fabricated co2 value to satisfy a required field, co2 is dropped from the
contract entirely.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("telemetry", "co2")


def downgrade() -> None:
    op.add_column(
        "telemetry",
        sa.Column("co2", sa.Float(), nullable=False, server_default="0"),
    )
