from datetime import datetime

from pydantic import BaseModel, Field

from app.core.types import TenantPlan


class TenantUpgradeRequestCreate(BaseModel):
    requested_plan: TenantPlan
    reason: str | None = Field(default=None, max_length=4000)


class TenantUpgradeRequestOut(BaseModel):
    id: str
    tenant_id: str
    requested_by_user_id: str | None = None
    current_plan: TenantPlan
    requested_plan: TenantPlan
    status: str
    reason: str | None = None
    admin_note: str | None = None
    processed_by_user_id: str | None = None
    processed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TenantUpgradeRequestDecision(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    admin_note: str | None = Field(default=None, max_length=4000)
    apply_plan_change: bool = True
