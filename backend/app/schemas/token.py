from datetime import datetime
from pydantic import BaseModel


class APITokenCreateRequest(BaseModel):
    name: str
    scopes: list[str] = ["scan:write", "scan:read"]


class APITokenCreateResponse(BaseModel):
    id: str
    name: str
    token: str
    token_prefix: str
    scopes: list[str]
    created_at: datetime


class APITokenOut(BaseModel):
    id: str
    name: str
    token_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

