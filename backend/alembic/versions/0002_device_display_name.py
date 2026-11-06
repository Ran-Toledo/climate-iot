"""add devices.display_name

An app-side name for a device. Kept separate from devices.name, which the
device itself overwrites on every registration.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-06

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("display_name", sa.String(length=100), nullable=True))


def downgrade() -> None:
    # batch mode: SQLite can't drop a column in place on older versions.
    with op.batch_alter_table("devices") as batch_op:
        batch_op.drop_column("display_name")
