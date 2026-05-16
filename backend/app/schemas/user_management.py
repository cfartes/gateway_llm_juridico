from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.core.types import UserRole


class TenantUserCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    role: UserRole = UserRole.ANALYST


class TenantUserOut(BaseModel):
    id: str
    tenant_id: str
    full_name: str | None
    email: EmailStr
    role: UserRole
    is_active: bool
    email_verified_at: datetime | None = None
    must_change_password: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
