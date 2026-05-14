from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import create_api_token_secret, hash_api_token_secret
from app.models.api_token import APIToken
from app.schemas.token import APITokenCreateRequest


def create_api_token(db: Session, tenant_id: str, user_id: str, payload: APITokenCreateRequest) -> tuple[APIToken, str]:
    secret = create_api_token_secret()
    token_prefix = f"nxs_{secret[:14]}"
    api_token = APIToken(
        tenant_id=tenant_id,
        created_by_user_id=user_id,
        name=payload.name,
        token_prefix=token_prefix,
        hashed_secret=hash_api_token_secret(secret),
        scopes=",".join(payload.scopes),
    )
    db.add(api_token)
    db.commit()
    db.refresh(api_token)
    plain_token = f"{api_token.token_prefix}.{secret}"
    return api_token, plain_token


def revoke_api_token(db: Session, tenant_id: str, token_id: str) -> APIToken | None:
    api_token = db.query(APIToken).filter(APIToken.id == token_id, APIToken.tenant_id == tenant_id).first()
    if not api_token:
        return None
    api_token.revoked_at = datetime.now(timezone.utc)
    db.add(api_token)
    db.commit()
    db.refresh(api_token)
    return api_token

