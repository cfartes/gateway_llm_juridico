from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.queue_alert_preference import QueueAlertPreferenceOut, QueueAlertPreferenceUpdateRequest
from app.schemas.queue_overview import QueueOverviewOut
from app.services.audit_service import write_audit_log
from app.services.queue_alert_preference_service import get_or_create_preference, update_preference
from app.services.queue_observability_service import build_queue_overview


router = APIRouter(prefix="/queues", tags=["queues"])
admin_router = APIRouter(prefix="/admin/queues", tags=["superadmin-queues"])


@router.get("/overview", response_model=QueueOverviewOut)
def get_tenant_queue_overview(
    window_hours: int = Query(default=24, ge=1, le=168),
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    return QueueOverviewOut.model_validate(build_queue_overview(db, tenant_id=auth.tenant_id, window_hours=window_hours))


@admin_router.get("/overview", response_model=QueueOverviewOut)
def get_superadmin_queue_overview(
    window_hours: int = Query(default=24, ge=1, le=168),
    tenant_id: str | None = Query(default=None),
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    _ = auth
    return QueueOverviewOut.model_validate(build_queue_overview(db, tenant_id=tenant_id, window_hours=window_hours))


@router.get("/alert-preferences", response_model=QueueAlertPreferenceOut)
def get_tenant_alert_preferences(
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="API token cannot manage alert preferences")

    pref = get_or_create_preference(db, user_id=auth.user_id, scope="tenant", scope_key=auth.tenant_id)
    return QueueAlertPreferenceOut.model_validate(pref)


@router.put("/alert-preferences", response_model=QueueAlertPreferenceOut)
def update_tenant_alert_preferences(
    payload: QueueAlertPreferenceUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER)),
    db: Session = Depends(get_db),
):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="API token cannot manage alert preferences")

    if payload.snooze_minutes is None and payload.acknowledged_signature is None and not payload.clear_snooze:
        raise HTTPException(status_code=400, detail="No preference changes provided")

    pref = get_or_create_preference(db, user_id=auth.user_id, scope="tenant", scope_key=auth.tenant_id)
    updated = update_preference(
        db,
        pref=pref,
        snooze_minutes=payload.snooze_minutes,
        clear_snooze=payload.clear_snooze,
        acknowledged_signature=payload.acknowledged_signature,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="queue.alert_preference.update",
        resource_type="queue_alert_preference",
        resource_id=updated.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "scope": updated.scope,
            "scope_key": updated.scope_key,
            "snooze_until": updated.snooze_until.isoformat() if updated.snooze_until else None,
            "acknowledged_signature_set": updated.acknowledged_signature is not None,
        },
    )
    return QueueAlertPreferenceOut.model_validate(updated)


@admin_router.get("/alert-preferences", response_model=QueueAlertPreferenceOut)
def get_superadmin_alert_preferences(
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="API token cannot manage alert preferences")

    pref = get_or_create_preference(db, user_id=auth.user_id, scope="superadmin", scope_key="global")
    return QueueAlertPreferenceOut.model_validate(pref)


@admin_router.put("/alert-preferences", response_model=QueueAlertPreferenceOut)
def update_superadmin_alert_preferences(
    payload: QueueAlertPreferenceUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="API token cannot manage alert preferences")

    if payload.snooze_minutes is None and payload.acknowledged_signature is None and not payload.clear_snooze:
        raise HTTPException(status_code=400, detail="No preference changes provided")

    pref = get_or_create_preference(db, user_id=auth.user_id, scope="superadmin", scope_key="global")
    updated = update_preference(
        db,
        pref=pref,
        snooze_minutes=payload.snooze_minutes,
        clear_snooze=payload.clear_snooze,
        acknowledged_signature=payload.acknowledged_signature,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="superadmin.queue.alert_preference.update",
        resource_type="queue_alert_preference",
        resource_id=updated.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "scope": updated.scope,
            "scope_key": updated.scope_key,
            "snooze_until": updated.snooze_until.isoformat() if updated.snooze_until else None,
            "acknowledged_signature_set": updated.acknowledged_signature is not None,
        },
    )
    return QueueAlertPreferenceOut.model_validate(updated)
