from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_auth_context
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.auth_service import authenticate_user, create_user_access_token, register_tenant_admin
from app.services.audit_service import write_audit_log


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    try:
        user = register_tenant_admin(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    token = create_user_access_token(user)
    write_audit_log(
        db,
        tenant_id=user.tenant_id,
        action="auth.register",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        actor_api_token_id=None,
        source_ip=request.client.host if request.client else None,
        details={"email": user.email},
    )
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_user_access_token(user)
    write_audit_log(
        db,
        tenant_id=user.tenant_id,
        action="auth.login",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        actor_api_token_id=None,
        source_ip=request.client.host if request.client else None,
        details={"tenant_id": user.tenant_id},
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(auth=Depends(get_auth_context), db: Session = Depends(get_db)):
    if not auth.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API token cannot access /me")
    user = db.query(User).filter_by(id=auth.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

