"""add tenant upgrade requests table

Revision ID: 0017_tenant_upgrade
Revises: 0016_tenant_ops_alert
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_tenant_upgrade"
down_revision = "0016_tenant_ops_alert"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_upgrade_requests",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("requested_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("current_plan", sa.Enum("starter", "growth", "business", "enterprise", name="tenantplan"), nullable=False),
        sa.Column("requested_plan", sa.Enum("starter", "growth", "business", "enterprise", name="tenantplan"), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("processed_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["processed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tenant_upgrade_requests_tenant_id"), "tenant_upgrade_requests", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_upgrade_requests_tenant_id"), table_name="tenant_upgrade_requests")
    op.drop_table("tenant_upgrade_requests")
