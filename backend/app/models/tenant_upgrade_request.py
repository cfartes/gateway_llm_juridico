from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.types import TenantPlan
from app.models.base import UUIDTimestampMixin


class TenantUpgradeRequest(UUIDTimestampMixin, Base):
    __tablename__ = "tenant_upgrade_requests"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    requested_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    current_plan: Mapped[TenantPlan] = mapped_column(
        Enum(TenantPlan, native_enum=False, values_callable=lambda enum_cls: [item.value for item in enum_cls]),
        nullable=False,
    )
    requested_plan: Mapped[TenantPlan] = mapped_column(
        Enum(TenantPlan, native_enum=False, values_callable=lambda enum_cls: [item.value for item in enum_cls]),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
