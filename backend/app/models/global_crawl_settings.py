from sqlalchemy import Boolean, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class GlobalCrawlSettings(UUIDTimestampMixin, Base):
    __tablename__ = "global_crawl_settings"
    __table_args__ = (
        UniqueConstraint("singleton_key", name="uq_global_crawl_settings_singleton_key"),
    )

    singleton_key: Mapped[str] = mapped_column(String(24), nullable=False, default="global")
    internal_links_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    max_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    timeout_seconds: Mapped[float] = mapped_column(Float, nullable=False, default=90.0)
