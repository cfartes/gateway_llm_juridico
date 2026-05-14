"""add llm provider config table

Revision ID: 0003_llm_provider_configs
Revises: 0002_auth_session_tables
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_llm_provider_configs"
down_revision = "0002_auth_session_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_provider_configs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("tenant_id", sa.String(length=36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider_key", sa.String(length=64), nullable=False),
        sa.Column("provider_label", sa.String(length=120), nullable=False),
        sa.Column("base_url", sa.String(length=255), nullable=False),
        sa.Column("api_token_encrypted", sa.Text(), nullable=True),
        sa.Column("selected_model", sa.String(length=200), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "provider_key", name="uq_llm_provider_tenant_key"),
    )
    op.create_index("ix_llm_provider_configs_tenant_id", "llm_provider_configs", ["tenant_id"])
    op.create_index("ix_llm_provider_configs_provider_key", "llm_provider_configs", ["provider_key"])


def downgrade() -> None:
    op.drop_table("llm_provider_configs")
