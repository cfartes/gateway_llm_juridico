from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.user_management import TenantUserCreateRequest, TenantUserOut, TenantUserUpdateRequest
from app.services.audit_service import write_audit_log
from app.services.user_management_service import (
    create_tenant_user,
    get_tenant_user,
    list_tenant_users,
    reset_temporary_password,
    resend_invitation_email,
    send_user_invitation_email,
    update_tenant_user,
)


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[TenantUserOut])
def list_users(
    q: str | None = Query(default=None),
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    email_confirmed: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    return list_tenant_users(
        db,
        tenant_id=auth.tenant_id,
        q=q,
        role=role,
        is_active=is_active,
        email_confirmed=email_confirmed,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TenantUserOut)
def create_user(
    payload: TenantUserCreateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    try:
        user, verification_token = create_tenant_user(db, tenant_id=auth.tenant_id, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    send_user_invitation_email(
        recipient_email=user.email,
        full_name=user.full_name,
        verification_token=verification_token,
    )

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.user.create",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"email": user.email, "role": str(user.role)},
    )
    return user


@router.patch("/{user_id}", response_model=TenantUserOut)
def patch_user(
    user_id: str,
    payload: TenantUserUpdateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    target = get_tenant_user(db, tenant_id=auth.tenant_id, user_id=user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == UserRole.SUPERADMIN:
        raise HTTPException(status_code=400, detail="Cannot modify superadmin users in tenant management")
    if target.id == auth.user_id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot disable your own user")
    try:
        updated = update_tenant_user(db, target=target, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.user.update",
        resource_type="user",
        resource_id=updated.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={
            "email": updated.email,
            "role": str(updated.role),
            "is_active": bool(updated.is_active),
            "full_name": updated.full_name,
        },
    )
    return updated


@router.post("/{user_id}/resend-invite", response_model=TenantUserOut)
def resend_invite(
    user_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    user = get_tenant_user(db, tenant_id=auth.tenant_id, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        verification_token = resend_invitation_email(db, user=user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    send_user_invitation_email(
        recipient_email=user.email,
        full_name=user.full_name,
        verification_token=verification_token,
    )
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.user.resend_invite",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"email": user.email},
    )
    return user


@router.post("/{user_id}/reset-temp-password", response_model=TenantUserOut)
def reset_temp_password(
    user_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    user = get_tenant_user(db, tenant_id=auth.tenant_id, user_id=user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.SUPERADMIN:
        raise HTTPException(status_code=400, detail="Cannot reset temporary password for superadmin users")
    if user.id == auth.user_id:
        raise HTTPException(status_code=400, detail="You cannot reset your own password from this action")
    updated = reset_temporary_password(db, user=user)
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="tenant.user.reset_temp_password",
        resource_type="user",
        resource_id=updated.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"email": updated.email},
    )
    return updated
