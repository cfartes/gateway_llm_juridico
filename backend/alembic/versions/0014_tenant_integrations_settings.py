"""add tenant integration config and tenant app settings

Revision ID: 0014_tenant_cfg_set
Revises: 0013_ops_alert_states
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_tenant_cfg_set"
down_revision = "0013_ops_alert_states"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_integration_configs",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("webhook_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("webhook_url", sa.String(length=2048), nullable=True),
        sa.Column("webhook_secret_enc", sa.Text(), nullable=True),
        sa.Column("webhook_auth_bearer_enc", sa.Text(), nullable=True),
        sa.Column("siem_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("siem_provider", sa.String(length=64), nullable=True),
        sa.Column("siem_endpoint", sa.String(length=2048), nullable=True),
        sa.Column("siem_auth_token_enc", sa.Text(), nullable=True),
        sa.Column("slack_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("slack_webhook_url", sa.String(length=2048), nullable=True),
        sa.Column("slack_channel", sa.String(length=255), nullable=True),
        sa.Column("slack_bot_token_enc", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_integration_config_tenant_id"),
    )
    op.create_index(op.f("ix_tenant_integration_configs_tenant_id"), "tenant_integration_configs", ["tenant_id"], unique=False)

    op.create_table(
        "tenant_app_settings",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("security_quarantine_threshold", sa.Float(), nullable=False, server_default="55"),
        sa.Column("security_block_threshold", sa.Float(), nullable=False, server_default="80"),
        sa.Column("security_auto_block_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("retention_days_reports", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("retention_days_files", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("notification_emails_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("notify_on_warning", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_on_critical", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notify_on_dead_letter", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_app_settings_tenant_id"),
    )
    op.create_index(op.f("ix_tenant_app_settings_tenant_id"), "tenant_app_settings", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenant_app_settings_tenant_id"), table_name="tenant_app_settings")
    op.drop_table("tenant_app_settings")
    op.drop_index(op.f("ix_tenant_integration_configs_tenant_id"), table_name="tenant_integration_configs")
    op.drop_table("tenant_integration_configs")
