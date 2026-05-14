"""enforce global unique user email

Revision ID: 0008_users_email_unique
Revises: 0007_scan_job_policy_quarantine
Create Date: 2026-05-14
"""

from alembic import op


revision = "0008_users_email_unique"
down_revision = "0007_scan_job_policy_quarantine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ux_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ux_users_email", table_name="users")
