from datetime import datetime

from pydantic import BaseModel

from app.core.types import TenantPlan


class SuperAdminTenantOut(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    plan: TenantPlan
    cnpj: str | None = None
    legal_name: str | None = None
    postal_code: str | None = None
    address_line: str | None = None
    address_number: str | None = None
    address_complement: str | None = None
    district: str | None = None
    city: str | None = None
    invoice_email: str | None = None
    created_at: datetime
    total_users: int
    total_documents: int
    total_scans: int
    active_api_tokens: int


class SuperAdminTenantUpdateRequest(BaseModel):
    is_active: bool | None = None
    plan: TenantPlan | None = None
