from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.schemas.user_management import TenantUserCreateRequest, TenantUserOut
from app.services.audit_service import write_audit_log
from app.services.user_management_service import create_tenant_user, list_tenant_users, send_user_invitation_email


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[TenantUserOut])
def list_users(
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)),
    db: Session = Depends(get_db),
):
    return list_tenant_users(db, tenant_id=auth.tenant_id)


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
