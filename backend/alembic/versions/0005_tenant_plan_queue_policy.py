"""add tenant plan for queue policies

Revision ID: 0005_tenant_plan_queue_policy
Revises: 0004_llm_configs_global_scope
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_tenant_plan_queue_policy"
down_revision = "0004_llm_configs_global_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column(
            "plan",
            sa.Enum("starter", "growth", "business", "enterprise", name="tenantplan", native_enum=False),
            nullable=False,
            server_default="starter",
        ),
    )


def downgrade() -> None:
    op.drop_column("tenants", "plan")
