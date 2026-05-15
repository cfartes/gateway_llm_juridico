"""add support tickets table

Revision ID: 0018_support_tickets
Revises: 0017_tenant_upgrade
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_support_tickets"
down_revision = "0017_tenant_upgrade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("requester_user_id", sa.String(length=36), nullable=True),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="general"),
        sa.Column("priority", sa.String(length=24), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="open"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("assigned_to_user_id", sa.String(length=36), nullable=True),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_support_tickets_tenant_id"), "support_tickets", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_tickets_tenant_id"), table_name="support_tickets")
    op.drop_table("support_tickets")
