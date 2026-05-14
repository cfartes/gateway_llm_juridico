"""make llm provider configs global (app-wide)

Revision ID: 0004_llm_configs_global_scope
Revises: 0003_llm_provider_configs
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_llm_configs_global_scope"
down_revision = "0003_llm_provider_configs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep only one row per provider_key (newest wins) before enforcing global uniqueness.
    op.execute(
        """
        DELETE FROM llm_provider_configs a
        USING llm_provider_configs b
        WHERE a.provider_key = b.provider_key
          AND (
            a.updated_at < b.updated_at
            OR (a.updated_at = b.updated_at AND a.id < b.id)
          )
        """
    )

    op.drop_constraint("uq_llm_provider_tenant_key", "llm_provider_configs", type_="unique")
    op.alter_column("llm_provider_configs", "tenant_id", existing_type=sa.String(length=36), nullable=True)
    op.create_unique_constraint("uq_llm_provider_key", "llm_provider_configs", ["provider_key"])


def downgrade() -> None:
    op.drop_constraint("uq_llm_provider_key", "llm_provider_configs", type_="unique")
    op.alter_column("llm_provider_configs", "tenant_id", existing_type=sa.String(length=36), nullable=False)
    op.create_unique_constraint("uq_llm_provider_tenant_key", "llm_provider_configs", ["tenant_id", "provider_key"])
