"""add support ticket attachments table

Revision ID: 0020_support_attach
Revises: 0019_ticket_messages
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_support_attach"
down_revision = "0019_ticket_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_ticket_attachments",
        sa.Column("ticket_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("uploaded_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("uploaded_by_role", sa.String(length=32), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_support_ticket_attachments_ticket_id"), "support_ticket_attachments", ["ticket_id"], unique=False)
    op.create_index(op.f("ix_support_ticket_attachments_tenant_id"), "support_ticket_attachments", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_ticket_attachments_tenant_id"), table_name="support_ticket_attachments")
    op.drop_index(op.f("ix_support_ticket_attachments_ticket_id"), table_name="support_ticket_attachments")
    op.drop_table("support_ticket_attachments")
