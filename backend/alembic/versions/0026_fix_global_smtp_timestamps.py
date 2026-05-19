"""fix global smtp timestamp defaults

Revision ID: 0026_fix_global_smtp_timestamps
Revises: 0025_global_smtp_settings
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0026_fix_global_smtp_timestamps"
down_revision = "0025_global_smtp_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("global_smtp_settings", "created_at", server_default=sa.text("now()"))
    op.alter_column("global_smtp_settings", "updated_at", server_default=sa.text("now()"))


def downgrade() -> None:
    op.alter_column("global_smtp_settings", "created_at", server_default=None)
    op.alter_column("global_smtp_settings", "updated_at", server_default=None)
