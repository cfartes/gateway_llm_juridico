from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.core.security import parse_jwt, verify_api_token_secret
from app.core.types import UserRole
from app.models.api_token import APIToken
from app.models.user import User


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    tenant_id: str
    user_id: str | None
    role: str
    api_token_id: str | None
    must_change_password: bool = False


DbDep = Annotated[Session, Depends(get_db)]
AuthDep = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def _unauthorized(message: str = "Unauthorized") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)


def get_auth_context(db: DbDep, credentials: AuthDep) -> AuthContext:
    if credentials is None:
        raise _unauthorized("Missing bearer token")

    token = credentials.credentials
    payload = parse_jwt(token)
    if payload:
        user = db.query(User).filter(User.id == payload.get("sub"), User.tenant_id == payload.get("tenant_id")).first()
        if not user or not user.is_active:
            raise _unauthorized("Invalid user context")
        return AuthContext(
            tenant_id=user.tenant_id,
            user_id=user.id,
            role=str(user.role),
            api_token_id=None,
            must_change_password=bool(user.must_change_password),
        )

    parts = token.split(".")
    if len(parts) != 2:
        raise _unauthorized("Invalid bearer format")

    token_prefix, token_secret = parts
    api_token = (
        db.query(APIToken)
        .filter(APIToken.token_prefix == token_prefix, APIToken.revoked_at.is_(None))
        .first()
    )
    if not api_token or not verify_api_token_secret(token_secret, api_token.hashed_secret):
        raise _unauthorized("Invalid API token")

    api_token.last_used_at = datetime.now(timezone.utc)
    db.add(api_token)
    db.commit()

    return AuthContext(
        tenant_id=api_token.tenant_id,
        user_id=api_token.created_by_user_id,
        role=str(UserRole.ANALYST),
        api_token_id=api_token.id,
        must_change_password=False,
    )


def require_roles(*roles: UserRole):
    def dependency(request: Request, auth: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
        if auth.user_id and auth.api_token_id is None and auth.must_change_password:
            allowed_paths = {
                f"{settings.api_v1_prefix}/auth/me",
                f"{settings.api_v1_prefix}/auth/logout",
                f"{settings.api_v1_prefix}/auth/first-access/change-password",
            }
            if request.url.path not in allowed_paths:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password change required")
        if roles and auth.role not in {str(r) for r in roles}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return auth

    return dependency


def get_request_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None

