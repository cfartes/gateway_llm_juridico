from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.integration import IntegrationConfigOut, IntegrationConfigUpdateRequest
from app.services.audit_service import write_audit_log
from app.services.tenant_config_service import get_integration_config, update_integration_config


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
