import json

from sqlalchemy.orm import Session

from app.models.tenant_app_settings import TenantAppSettings
from app.models.tenant_integration_config import TenantIntegrationConfig
from app.schemas.app_settings import TenantAppSettingsOut, TenantAppSettingsUpdateRequest
from app.schemas.integration import IntegrationConfigOut, IntegrationConfigUpdateRequest
from app.utils.crypto import decrypt_text, encrypt_text


def _ensure_integration_config(db: Session, tenant_id: str) -> TenantIntegrationConfig:
    config = db.query(TenantIntegrationConfig).filter(TenantIntegrationConfig.tenant_id == tenant_id).first()
    if config:
        return config
    config = TenantIntegrationConfig(tenant_id=tenant_id)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def _ensure_app_settings(db: Session, tenant_id: str) -> TenantAppSettings:
    settings = db.query(TenantAppSettings).filter(TenantAppSettings.tenant_id == tenant_id).first()
    if settings:
        return settings
    settings = TenantAppSettings(tenant_id=tenant_id)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def get_integration_config(db: Session, tenant_id: str) -> IntegrationConfigOut:
    config = _ensure_integration_config(db, tenant_id)
    return IntegrationConfigOut(
        webhook={
            "enabled": config.webhook_enabled,
            "url": config.webhook_url,
            "secret_configured": bool(config.webhook_secret_enc),
            "auth_bearer_configured": bool(config.webhook_auth_bearer_enc),
        },
        siem={
            "enabled": config.siem_enabled,
            "provider": config.siem_provider,
            "endpoint": config.siem_endpoint,
            "auth_token_configured": bool(config.siem_auth_token_enc),
        },
        slack={
            "enabled": config.slack_enabled,
            "webhook_url": config.slack_webhook_url,
            "channel": config.slack_channel,
            "bot_token_configured": bool(config.slack_bot_token_enc),
        },
    )


def update_integration_config(db: Session, tenant_id: str, payload: IntegrationConfigUpdateRequest) -> IntegrationConfigOut:
    config = _ensure_integration_config(db, tenant_id)

    webhook = payload.webhook
    config.webhook_enabled = webhook.enabled
    config.webhook_url = str(webhook.url) if webhook.url else None
    if webhook.secret is not None:
        config.webhook_secret_enc = encrypt_text(webhook.secret)
    elif webhook.clear_secret:
        config.webhook_secret_enc = None
    if webhook.auth_bearer is not None:
        config.webhook_auth_bearer_enc = encrypt_text(webhook.auth_bearer)
    elif webhook.clear_auth_bearer:
        config.webhook_auth_bearer_enc = None

    siem = payload.siem
    config.siem_enabled = siem.enabled
    config.siem_provider = siem.provider
    config.siem_endpoint = str(siem.endpoint) if siem.endpoint else None
    if siem.auth_token is not None:
        config.siem_auth_token_enc = encrypt_text(siem.auth_token)
    elif siem.clear_auth_token:
        config.siem_auth_token_enc = None

    slack = payload.slack
    config.slack_enabled = slack.enabled
    config.slack_webhook_url = str(slack.webhook_url) if slack.webhook_url else None
    config.slack_channel = slack.channel
    if slack.bot_token is not None:
        config.slack_bot_token_enc = encrypt_text(slack.bot_token)
    elif slack.clear_bot_token:
        config.slack_bot_token_enc = None

    db.add(config)
    db.commit()
    db.refresh(config)
    return get_integration_config(db, tenant_id)


def get_app_settings(db: Session, tenant_id: str) -> TenantAppSettingsOut:
    settings = _ensure_app_settings(db, tenant_id)
    try:
        emails = json.loads(settings.notification_emails_json or "[]")
        if not isinstance(emails, list):
            emails = []
    except Exception:
        emails = []
    return TenantAppSettingsOut(
        security={
            "quarantine_threshold": settings.security_quarantine_threshold,
            "block_threshold": settings.security_block_threshold,
            "auto_block_enabled": settings.security_auto_block_enabled,
        },
        retention={
            "reports_days": settings.retention_days_reports,
            "files_days": settings.retention_days_files,
        },
        notifications={
            "emails": [str(item) for item in emails if isinstance(item, str)],
            "notify_on_warning": settings.notify_on_warning,
            "notify_on_critical": settings.notify_on_critical,
            "notify_on_dead_letter": settings.notify_on_dead_letter,
        },
    )


def update_app_settings(db: Session, tenant_id: str, payload: TenantAppSettingsUpdateRequest) -> TenantAppSettingsOut:
    settings = _ensure_app_settings(db, tenant_id)

    settings.security_quarantine_threshold = payload.security.quarantine_threshold
    settings.security_block_threshold = payload.security.block_threshold
    settings.security_auto_block_enabled = payload.security.auto_block_enabled

    settings.retention_days_reports = payload.retention.reports_days
    settings.retention_days_files = payload.retention.files_days

    normalized_emails = [item.strip().lower() for item in payload.notifications.emails if item.strip()]
    settings.notification_emails_json = json.dumps(normalized_emails, ensure_ascii=False)
    settings.notify_on_warning = payload.notifications.notify_on_warning
    settings.notify_on_critical = payload.notifications.notify_on_critical
    settings.notify_on_dead_letter = payload.notifications.notify_on_dead_letter

    db.add(settings)
    db.commit()
    db.refresh(settings)
    return get_app_settings(db, tenant_id)


def get_integration_secret_preview(db: Session, tenant_id: str) -> dict[str, bool]:
    config = _ensure_integration_config(db, tenant_id)
    return {
        "webhook_secret_decodable": bool(config.webhook_secret_enc and decrypt_text(config.webhook_secret_enc)),
        "webhook_bearer_decodable": bool(config.webhook_auth_bearer_enc and decrypt_text(config.webhook_auth_bearer_enc)),
        "siem_token_decodable": bool(config.siem_auth_token_enc and decrypt_text(config.siem_auth_token_enc)),
        "slack_bot_token_decodable": bool(config.slack_bot_token_enc and decrypt_text(config.slack_bot_token_enc)),
    }

