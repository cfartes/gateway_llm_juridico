"""add global smtp settings table

Revision ID: 0025_global_smtp_settings
Revises: 0024_tenant_ui_language
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_global_smtp_settings"
down_revision = "0024_tenant_ui_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "global_smtp_settings",
        sa.Column("singleton_key", sa.String(length=24), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("host", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("port", sa.Integer(), nullable=False, server_default="587"),
        sa.Column("username", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("password_encrypted", sa.Text(), nullable=True),
        sa.Column("from_email", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("use_tls", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("use_ssl", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("timeout_seconds", sa.Float(), nullable=False, server_default="10"),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("singleton_key", name="uq_global_smtp_settings_singleton_key"),
    )
    op.create_index(op.f("ix_global_smtp_settings_singleton_key"), "global_smtp_settings", ["singleton_key"], unique=False)
    op.alter_column("global_smtp_settings", "enabled", server_default=None)
    op.alter_column("global_smtp_settings", "host", server_default=None)
    op.alter_column("global_smtp_settings", "port", server_default=None)
    op.alter_column("global_smtp_settings", "username", server_default=None)
    op.alter_column("global_smtp_settings", "from_email", server_default=None)
    op.alter_column("global_smtp_settings", "use_tls", server_default=None)
    op.alter_column("global_smtp_settings", "use_ssl", server_default=None)
    op.alter_column("global_smtp_settings", "timeout_seconds", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_global_smtp_settings_singleton_key"), table_name="global_smtp_settings")
    op.drop_table("global_smtp_settings")
