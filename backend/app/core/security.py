from datetime import datetime, timedelta, timezone
from typing import Any
import hashlib
import hmac
import secrets

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def validate_password_strength(password: str) -> None:
    if len(password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {settings.password_min_length} characters.",
        )
    if not any(c.isupper() for c in password):
        raise HTTPException(status_code=400, detail="Password must include an uppercase letter.")
    if not any(c.islower() for c in password):
        raise HTTPException(status_code=400, detail="Password must include a lowercase letter.")
    if not any(c.isdigit() for c in password):
        raise HTTPException(status_code=400, detail="Password must include a number.")
    if not any(not c.isalnum() for c in password):
        raise HTTPException(status_code=400, detail="Password must include a special character.")


def create_access_token(subject: str, tenant_id: str, role: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {"sub": subject, "tenant_id": tenant_id, "role": role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    secrets_to_try = [settings.secret_key] + [
        key.strip() for key in settings.previous_secret_keys.split(",") if key.strip()
    ]
    last_exc: Exception | None = None
    for key in secrets_to_try:
        try:
            return jwt.decode(token, key, algorithms=[settings.jwt_algorithm])
        except JWTError as exc:
            last_exc = exc
    raise last_exc or JWTError("Invalid token")


def create_api_token_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_api_token_secret(secret: str) -> str:
    return hmac.new(settings.secret_key.encode(), secret.encode(), hashlib.sha256).hexdigest()


def verify_api_token_secret(secret: str, hashed_secret: str) -> bool:
    return hmac.compare_digest(hash_api_token_secret(secret), hashed_secret)


def create_refresh_token_secret() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token_secret(secret: str) -> str:
    return hmac.new(settings.secret_key.encode(), secret.encode(), hashlib.sha256).hexdigest()


def verify_refresh_token_secret(secret: str, hashed_secret: str) -> bool:
    return hmac.compare_digest(hash_refresh_token_secret(secret), hashed_secret)


def create_password_reset_token_secret() -> str:
    return secrets.token_urlsafe(48)


def hash_password_reset_token(secret: str) -> str:
    return hmac.new(settings.secret_key.encode(), secret.encode(), hashlib.sha256).hexdigest()


def verify_password_reset_token(secret: str, hashed_secret: str) -> bool:
    return hmac.compare_digest(hash_password_reset_token(secret), hashed_secret)


def parse_jwt(token: str) -> dict[str, Any] | None:
    try:
        return decode_access_token(token)
    except JWTError:
        return None
