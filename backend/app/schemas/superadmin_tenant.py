from datetime import datetime

from pydantic import BaseModel

from app.core.types import TenantPlan


class SuperAdminTenantOut(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    plan: TenantPlan
    created_at: datetime
    total_users: int
    total_documents: int
    total_scans: int
    active_api_tokens: int


class SuperAdminTenantUpdateRequest(BaseModel):
    is_active: bool | None = None
    plan: TenantPlan | None = None
