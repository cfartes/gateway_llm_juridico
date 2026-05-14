"""add policy and quarantine fields to scan jobs

Revision ID: 0007_scan_job_policy_quarantine
Revises: 0006_scan_job_integration_meta
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_scan_job_policy_quarantine"
down_revision = "0006_scan_job_integration_meta"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("scan_jobs", sa.Column("policy_action", sa.String(length=24), nullable=True))
    op.add_column("scan_jobs", sa.Column("policy_reason", sa.Text(), nullable=True))
    op.add_column("scan_jobs", sa.Column("quarantine_status", sa.String(length=24), nullable=True))
    op.add_column("scan_jobs", sa.Column("quarantine_note", sa.Text(), nullable=True))
    op.add_column("scan_jobs", sa.Column("reviewed_by_user_id", sa.String(length=36), nullable=True))
    op.add_column("scan_jobs", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_scan_jobs_reviewed_by_user_id_users",
        "scan_jobs",
        "users",
        ["reviewed_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_scan_jobs_reviewed_by_user_id_users", "scan_jobs", type_="foreignkey")
    op.drop_column("scan_jobs", "reviewed_at")
    op.drop_column("scan_jobs", "reviewed_by_user_id")
    op.drop_column("scan_jobs", "quarantine_note")
    op.drop_column("scan_jobs", "quarantine_status")
    op.drop_column("scan_jobs", "policy_reason")
    op.drop_column("scan_jobs", "policy_action")
