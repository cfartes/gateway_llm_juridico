"""add webhook delivery tables for dead-letter operations

Revision ID: 0010_webhook_deadletter
Revises: 0009_expand_user_role_length
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_webhook_deadletter"
down_revision = "0009_expand_user_role_length"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webhook_deliveries",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("scan_job_id", sa.String(length=36), nullable=True),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("callback_url", sa.String(length=2048), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_http_status", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_response_preview", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("callback_secret_enc", sa.Text(), nullable=True),
        sa.Column("callback_auth_bearer_enc", sa.Text(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("discarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["scan_job_id"], ["scan_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_webhook_deliveries_tenant_id"), "webhook_deliveries", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_webhook_deliveries_scan_job_id"), "webhook_deliveries", ["scan_job_id"], unique=False)
    op.create_index(op.f("ix_webhook_deliveries_document_id"), "webhook_deliveries", ["document_id"], unique=False)
    op.create_index(op.f("ix_webhook_deliveries_status"), "webhook_deliveries", ["status"], unique=False)

    op.create_table(
        "webhook_delivery_attempts",
        sa.Column("delivery_id", sa.String(length=36), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("response_preview", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["delivery_id"], ["webhook_deliveries.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_webhook_delivery_attempts_delivery_id"), "webhook_delivery_attempts", ["delivery_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_webhook_delivery_attempts_delivery_id"), table_name="webhook_delivery_attempts")
    op.drop_table("webhook_delivery_attempts")

    op.drop_index(op.f("ix_webhook_deliveries_status"), table_name="webhook_deliveries")
    op.drop_index(op.f("ix_webhook_deliveries_document_id"), table_name="webhook_deliveries")
    op.drop_index(op.f("ix_webhook_deliveries_scan_job_id"), table_name="webhook_deliveries")
    op.drop_index(op.f("ix_webhook_deliveries_tenant_id"), table_name="webhook_deliveries")
    op.drop_table("webhook_deliveries")
