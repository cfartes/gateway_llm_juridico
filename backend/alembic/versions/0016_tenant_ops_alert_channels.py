"""add tenant ops alert channel fields

Revision ID: 0016_tenant_ops_alert
Revises: 0015_ops_slo_snaps
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_tenant_ops_alert"
down_revision = "0015_ops_slo_snaps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_integration_configs", sa.Column("ops_alerts_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_webhook_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_webhook_url", sa.String(length=2048), nullable=True))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_webhook_auth_bearer_enc", sa.Text(), nullable=True))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_slack_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_teams_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_teams_webhook_url", sa.String(length=2048), nullable=True))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_email_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenant_integration_configs", sa.Column("ops_alert_email_recipients_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_integration_configs", "ops_alert_email_recipients_json")
    op.drop_column("tenant_integration_configs", "ops_alert_email_enabled")
    op.drop_column("tenant_integration_configs", "ops_alert_teams_webhook_url")
    op.drop_column("tenant_integration_configs", "ops_alert_teams_enabled")
    op.drop_column("tenant_integration_configs", "ops_alert_slack_enabled")
    op.drop_column("tenant_integration_configs", "ops_alert_webhook_auth_bearer_enc")
    op.drop_column("tenant_integration_configs", "ops_alert_webhook_url")
    op.drop_column("tenant_integration_configs", "ops_alert_webhook_enabled")
    op.drop_column("tenant_integration_configs", "ops_alerts_enabled")
