"""add queue alert preferences table

Revision ID: 0012_queue_alert_prefs
Revises: 0011_webhook_retry_schedule
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_queue_alert_prefs"
down_revision = "0011_webhook_retry_schedule"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "queue_alert_preferences",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False),
        sa.Column("scope_key", sa.String(length=64), nullable=False),
        sa.Column("snooze_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_signature", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "scope", "scope_key", name="uq_queue_alert_pref_user_scope_key"),
    )
    op.create_index(op.f("ix_queue_alert_preferences_user_id"), "queue_alert_preferences", ["user_id"], unique=False)
    op.create_index(op.f("ix_queue_alert_preferences_scope"), "queue_alert_preferences", ["scope"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_queue_alert_preferences_scope"), table_name="queue_alert_preferences")
    op.drop_index(op.f("ix_queue_alert_preferences_user_id"), table_name="queue_alert_preferences")
    op.drop_table("queue_alert_preferences")
