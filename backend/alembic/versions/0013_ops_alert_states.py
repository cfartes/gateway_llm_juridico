"""add ops alert states table

Revision ID: 0013_ops_alert_states
Revises: 0012_queue_alert_prefs
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_ops_alert_states"
down_revision = "0012_queue_alert_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ops_alert_states",
        sa.Column("scope_key", sa.String(length=120), nullable=False),
        sa.Column("indicator_name", sa.String(length=120), nullable=False),
        sa.Column("last_status", sa.String(length=16), nullable=False, server_default="pass"),
        sa.Column("last_actual", sa.Float(), nullable=False, server_default="0"),
        sa.Column("target", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit", sa.String(length=24), nullable=False, server_default="count"),
        sa.Column("last_signature", sa.String(length=200), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("alert_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope_key", "indicator_name", name="uq_ops_alert_scope_indicator"),
    )
    op.create_index(op.f("ix_ops_alert_states_scope_key"), "ops_alert_states", ["scope_key"], unique=False)
    op.create_index(op.f("ix_ops_alert_states_indicator_name"), "ops_alert_states", ["indicator_name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ops_alert_states_indicator_name"), table_name="ops_alert_states")
    op.drop_index(op.f("ix_ops_alert_states_scope_key"), table_name="ops_alert_states")
    op.drop_table("ops_alert_states")

