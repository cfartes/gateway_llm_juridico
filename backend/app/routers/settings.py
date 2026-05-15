from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.app_settings import TenantAppSettingsOut, TenantAppSettingsUpdateRequest
from app.services.audit_service import write_audit_log
from app.services.tenant_config_service import get_app_settings, update_app_settings


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/current", response_model=TenantAppSettingsOut)
def get_current_settings(
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return get_app_settings(db, auth.tenant_id)


@router.put("/current", response_model=TenantAppSettingsOut)
def update_current_settings(
    payload: TenantAppSettingsUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    result = update_app_settings(db, auth.tenant_id, payload)
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.settings.update",
        resource_type="tenant_app_settings",
        resource_id=None,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "quarantine_threshold": result.security.quarantine_threshold,
            "block_threshold": result.security.block_threshold,
            "reports_days": result.retention.reports_days,
            "files_days": result.retention.files_days,
            "emails_count": len(result.notifications.emails),
        },
    )
    return result

