"""add integration metadata fields to scan jobs

Revision ID: 0006_scan_job_integration_meta
Revises: 0005_tenant_plan_queue_policy
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_scan_job_integration_meta"
down_revision = "0005_tenant_plan_queue_policy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("scan_jobs", sa.Column("integration_meta_json", sa.Text(), nullable=True))
    op.add_column("scan_jobs", sa.Column("rag_markdown_path", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("scan_jobs", "rag_markdown_path")
    op.drop_column("scan_jobs", "integration_meta_json")
