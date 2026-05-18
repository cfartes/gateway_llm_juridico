from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.user import User
from app.schemas.app_settings import SmtpTestRequest, SmtpTestResponse, TenantAppSettingsOut, TenantAppSettingsUpdateRequest, TenantLanguageUpdateRequest
from app.services.audit_service import write_audit_log
from app.services.email_service import is_smtp_configured, send_email
from app.services.tenant_config_service import get_app_settings, update_app_settings, update_tenant_language


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
            "ui_language": result.ui.language,
        },
    )
    return result


@router.put("/current/language", response_model=TenantAppSettingsOut)
def update_current_language(
    payload: TenantLanguageUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    result = update_tenant_language(db, auth.tenant_id, payload.language)
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.settings.language.update",
        resource_type="tenant_app_settings",
        resource_id=None,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"ui_language": result.ui.language},
    )
    return result


@router.post("/test-smtp", response_model=SmtpTestResponse)
def test_smtp(
    payload: SmtpTestRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    if not is_smtp_configured():
        raise HTTPException(status_code=400, detail="SMTP is not configured.")

    recipient = (payload.recipient_email or "").strip().lower()
    if not recipient:
        user = db.query(User).filter(User.id == auth.user_id, User.tenant_id == auth.tenant_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Current user not found")
        recipient = user.email

    now_iso = datetime.now(timezone.utc).isoformat()
    send_email(
        subject="Nexus Gateway LLM Shield - SMTP Test",
        recipients=[recipient],
        body_text=f"SMTP test succeeded for tenant {auth.tenant_id} at {now_iso}.",
        body_html=f"<p>SMTP test succeeded for tenant <b>{auth.tenant_id}</b> at <b>{now_iso}</b>.</p>",
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.settings.smtp_test",
        resource_type="tenant_app_settings",
        resource_id=None,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"recipient_email": recipient},
    )
    return SmtpTestResponse(sent=True, message=f"SMTP test email sent to {recipient}")
