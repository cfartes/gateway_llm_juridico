"""add ops slo snapshots table

Revision ID: 0015_ops_slo_snaps
Revises: 0014_tenant_cfg_set
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_ops_slo_snaps"
down_revision = "0014_tenant_cfg_set"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ops_slo_snapshots",
        sa.Column("scope_key", sa.String(length=120), nullable=False),
        sa.Column("indicator_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pass"),
        sa.Column("actual", sa.Float(), nullable=False, server_default="0"),
        sa.Column("target", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unit", sa.String(length=24), nullable=False, server_default="count"),
        sa.Column("window_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ops_slo_snapshots_scope_key"), "ops_slo_snapshots", ["scope_key"], unique=False)
    op.create_index(op.f("ix_ops_slo_snapshots_indicator_name"), "ops_slo_snapshots", ["indicator_name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ops_slo_snapshots_indicator_name"), table_name="ops_slo_snapshots")
    op.drop_index(op.f("ix_ops_slo_snapshots_scope_key"), table_name="ops_slo_snapshots")
    op.drop_table("ops_slo_snapshots")

