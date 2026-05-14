from datetime import datetime, timedelta, timezone
from typing import Any
import hashlib
import hmac
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, tenant_id: str, role: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {"sub": subject, "tenant_id": tenant_id, "role": role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


def create_api_token_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_api_token_secret(secret: str) -> str:
    return hmac.new(settings.secret_key.encode(), secret.encode(), hashlib.sha256).hexdigest()


def verify_api_token_secret(secret: str, hashed_secret: str) -> bool:
    return hmac.compare_digest(hash_api_token_secret(secret), hashed_secret)


def parse_jwt(token: str) -> dict[str, Any] | None:
    try:
        return decode_access_token(token)
    except JWTError:
        return None

