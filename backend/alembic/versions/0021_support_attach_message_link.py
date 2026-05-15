"""link support ticket attachments to messages

Revision ID: 0021_support_attach_message_link
Revises: 0020_support_attach
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_support_attach_message_link"
down_revision = "0020_support_attach"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("support_ticket_attachments", sa.Column("message_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_support_ticket_attachments_message_id",
        "support_ticket_attachments",
        "support_ticket_messages",
        ["message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_support_ticket_attachments_message_id"), "support_ticket_attachments", ["message_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_support_ticket_attachments_message_id"), table_name="support_ticket_attachments")
    op.drop_constraint("fk_support_ticket_attachments_message_id", "support_ticket_attachments", type_="foreignkey")
    op.drop_column("support_ticket_attachments", "message_id")
