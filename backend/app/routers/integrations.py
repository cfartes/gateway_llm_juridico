from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.integration import IntegrationConfigOut, IntegrationConfigUpdateRequest, IntegrationTestAlertOut
from app.services.audit_service import write_audit_log
from app.services.tenant_config_service import get_integration_config, update_integration_config
from app.services.webhook_delivery_service import send_ops_alert


router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/current", response_model=IntegrationConfigOut)
def get_current_integrations(
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return get_integration_config(db, auth.tenant_id)


@router.put("/current", response_model=IntegrationConfigOut)
def update_current_integrations(
    payload: IntegrationConfigUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    result = update_integration_config(db, auth.tenant_id, payload)
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.integrations.update",
        resource_type="tenant_integration_config",
        resource_id=None,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "webhook_enabled": result.webhook.enabled,
            "siem_enabled": result.siem.enabled,
            "slack_enabled": result.slack.enabled,
            "ops_alerts_enabled": result.ops_alerts.enabled,
            "ops_alert_channels": {
                "webhook": result.ops_alerts.webhook_enabled,
                "slack": result.ops_alerts.slack_enabled,
                "teams": result.ops_alerts.teams_enabled,
                "email": result.ops_alerts.email_enabled,
            },
        },
    )
    return result


@router.post("/test-alert", response_model=IntegrationTestAlertOut)
def send_tenant_test_alert(
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    cfg = get_integration_config(db, auth.tenant_id)
    if not cfg.ops_alerts.enabled:
        raise HTTPException(status_code=400, detail="Ops alerts are disabled for this tenant.")

    channels = {
        "webhook": bool(cfg.ops_alerts.webhook_enabled and cfg.ops_alerts.webhook_url),
        "slack": bool(cfg.ops_alerts.slack_enabled and cfg.slack.webhook_url),
        "teams": bool(cfg.ops_alerts.teams_enabled and cfg.ops_alerts.teams_webhook_url),
        "email": bool(cfg.ops_alerts.email_enabled and cfg.ops_alerts.email_recipients),
    }
    if not any(channels.values()):
        raise HTTPException(status_code=400, detail="No configured ops alert channel is enabled for this tenant.")

    event_type = "ops.test"
    payload = {
        "tenant_id": auth.tenant_id,
        "triggered_by_user_id": auth.user_id,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "message": "Tenant test alert from Integrations page.",
        "channels": channels,
    }
    send_ops_alert(event_type, payload)

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.integrations.test_alert",
        resource_type="tenant_integration_config",
        resource_id=None,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"event_type": event_type, "channels": channels},
    )

    return IntegrationTestAlertOut(
        status="queued",
        event_type=event_type,
        tenant_id=auth.tenant_id,
        channels=channels,
    )
