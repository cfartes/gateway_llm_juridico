from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AuditLogOut(BaseModel):
    id: str
    created_at: datetime
    tenant_id: str
    actor_user_id: str | None = None
    actor_user_email: str | None = None
    actor_api_token_id: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    source_ip: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    details_json: str | None = None


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int
    limit: int
    offset: int

