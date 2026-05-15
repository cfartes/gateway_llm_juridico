"""add webhook retry schedule and alert cooldown fields

Revision ID: 0011_webhook_retry_schedule
Revises: 0010_webhook_deadletter
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_webhook_retry_schedule"
down_revision = "0010_webhook_deadletter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("webhook_deliveries", sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("webhook_deliveries", sa.Column("alert_last_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("webhook_deliveries", sa.Column("alert_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_index(op.f("ix_webhook_deliveries_next_retry_at"), "webhook_deliveries", ["next_retry_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_webhook_deliveries_next_retry_at"), table_name="webhook_deliveries")
    op.drop_column("webhook_deliveries", "alert_count")
    op.drop_column("webhook_deliveries", "alert_last_sent_at")
    op.drop_column("webhook_deliveries", "next_retry_at")
