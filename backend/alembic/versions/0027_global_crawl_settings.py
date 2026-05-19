"""add global crawl settings table

Revision ID: 0027_global_crawl_settings
Revises: 0026_fix_global_smtp_timestamps
Create Date: 2026-05-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0027_global_crawl_settings"
down_revision = "0026_fix_global_smtp_timestamps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "global_crawl_settings",
        sa.Column("singleton_key", sa.String(length=24), nullable=False),
        sa.Column("internal_links_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("max_pages", sa.Integer(), nullable=False, server_default="40"),
        sa.Column("max_depth", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("timeout_seconds", sa.Float(), nullable=False, server_default="90"),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("singleton_key", name="uq_global_crawl_settings_singleton_key"),
    )
    op.create_index(op.f("ix_global_crawl_settings_singleton_key"), "global_crawl_settings", ["singleton_key"], unique=False)
    op.alter_column("global_crawl_settings", "internal_links_enabled", server_default=None)
    op.alter_column("global_crawl_settings", "max_pages", server_default=None)
    op.alter_column("global_crawl_settings", "max_depth", server_default=None)
    op.alter_column("global_crawl_settings", "timeout_seconds", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_global_crawl_settings_singleton_key"), table_name="global_crawl_settings")
    op.drop_table("global_crawl_settings")
