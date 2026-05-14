from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_request_ip, require_roles
from app.core.types import UserRole
from app.models.api_token import APIToken
from app.schemas.token import APITokenCreateRequest, APITokenCreateResponse, APITokenOut
from app.services.audit_service import write_audit_log
from app.services.token_service import create_api_token, revoke_api_token


router = APIRouter(prefix="/tokens", tags=["api-tokens"])


@router.post("", response_model=APITokenCreateResponse)
def create_token(
    payload: APITokenCreateRequest,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)),
    db: Session = Depends(get_db),
):
    if not auth.user_id:
        raise HTTPException(status_code=403, detail="Only user sessions can mint API tokens")

    token, plain = create_api_token(db, tenant_id=auth.tenant_id, user_id=auth.user_id, payload=payload)
    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="api_token.create",
        resource_type="api_token",
        resource_id=token.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"name": token.name, "scopes": payload.scopes},
    )

    return APITokenCreateResponse(
        id=token.id,
        name=token.name,
        token=plain,
        token_prefix=token.token_prefix,
        scopes=token.scopes.split(","),
        created_at=token.created_at,
    )


@router.get("", response_model=list[APITokenOut])
def list_tokens(auth=Depends(require_roles(UserRole.ADMIN, UserRole.ANALYST)), db: Session = Depends(get_db)):
    tokens = (
        db.query(APIToken)
        .filter(APIToken.tenant_id == auth.tenant_id)
        .order_by(APIToken.created_at.desc())
        .all()
    )
    return [
        APITokenOut(
            id=t.id,
            name=t.name,
            token_prefix=t.token_prefix,
            scopes=t.scopes.split(",") if t.scopes else [],
            last_used_at=t.last_used_at,
            revoked_at=t.revoked_at,
            created_at=t.created_at,
        )
        for t in tokens
    ]


@router.post("/{token_id}/revoke", response_model=APITokenOut)
def revoke_token(
    token_id: str,
    request: Request,
    auth=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    token = revoke_api_token(db, auth.tenant_id, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    write_audit_log(
        db,
        tenant_id=auth.tenant_id,
        action="api_token.revoke",
        resource_type="api_token",
        resource_id=token.id,
        actor_user_id=auth.user_id,
        actor_api_token_id=auth.api_token_id,
        source_ip=get_request_ip(request),
        details={"name": token.name},
    )

    return APITokenOut(
        id=token.id,
        name=token.name,
        token_prefix=token.token_prefix,
        scopes=token.scopes.split(",") if token.scopes else [],
        last_used_at=token.last_used_at,
        revoked_at=token.revoked_at,
        created_at=token.created_at,
    )

