from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class LLMProviderConfig(UUIDTimestampMixin, Base):
    __tablename__ = "llm_provider_configs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider_key", name="uq_llm_provider_tenant_key"),
    )

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    provider_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    provider_label: Mapped[str] = mapped_column(String(120), nullable=False)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    api_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
