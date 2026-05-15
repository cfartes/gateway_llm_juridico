"""add support ticket messages table

Revision ID: 0019_ticket_messages
Revises: 0018_support_tickets
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_ticket_messages"
down_revision = "0018_support_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_ticket_messages",
        sa.Column("ticket_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("author_user_id", sa.String(length=36), nullable=True),
        sa.Column("author_role", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_support_ticket_messages_ticket_id"), "support_ticket_messages", ["ticket_id"], unique=False)
    op.create_index(op.f("ix_support_ticket_messages_tenant_id"), "support_ticket_messages", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_ticket_messages_tenant_id"), table_name="support_ticket_messages")
    op.drop_index(op.f("ix_support_ticket_messages_ticket_id"), table_name="support_ticket_messages")
    op.drop_table("support_ticket_messages")
