from sqlalchemy import Boolean, Float, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class GlobalSMTPSettings(UUIDTimestampMixin, Base):
    __tablename__ = "global_smtp_settings"
    __table_args__ = (
        UniqueConstraint("singleton_key", name="uq_global_smtp_settings_singleton_key"),
    )

    singleton_key: Mapped[str] = mapped_column(String(24), nullable=False, default="global")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    host: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    port: Mapped[int] = mapped_column(nullable=False, default=587)
    username: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    from_email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    use_tls: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    use_ssl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    timeout_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=10.0)
