from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class TenantAppSettings(UUIDTimestampMixin, Base):
    __tablename__ = "tenant_app_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_tenant_app_settings_tenant_id"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)

    security_quarantine_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=55.0)
    security_block_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=80.0)
    security_auto_block_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    retention_days_reports: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    retention_days_files: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    ui_language: Mapped[str] = mapped_column(String(10), nullable=False, default="pt-BR")

    notification_emails_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    notify_on_warning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_on_critical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_on_dead_letter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
