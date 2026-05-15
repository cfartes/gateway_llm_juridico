from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class TenantIntegrationConfig(UUIDTimestampMixin, Base):
    __tablename__ = "tenant_integration_configs"
    __table_args__ = (
        UniqueConstraint("tenant_id", name="uq_tenant_integration_config_tenant_id"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)

    webhook_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    webhook_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    webhook_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_auth_bearer_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    siem_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    siem_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    siem_endpoint: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    siem_auth_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    slack_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    slack_webhook_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    slack_channel: Mapped[str | None] = mapped_column(String(255), nullable=True)
    slack_bot_token_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

