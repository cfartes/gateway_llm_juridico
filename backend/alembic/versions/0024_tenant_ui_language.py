"""add tenant ui language setting

Revision ID: 0024_tenant_ui_language
Revises: 0023_tenant_profile_fields
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_tenant_ui_language"
down_revision = "0023_tenant_profile_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenant_app_settings",
        sa.Column("ui_language", sa.String(length=10), nullable=False, server_default="pt-BR"),
    )
    op.alter_column("tenant_app_settings", "ui_language", server_default=None)


def downgrade() -> None:
    op.drop_column("tenant_app_settings", "ui_language")
