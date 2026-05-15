from datetime import datetime

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class OpsSLOSnapshot(UUIDTimestampMixin, Base):
    __tablename__ = "ops_slo_snapshots"

    scope_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False, default="global")
    indicator_name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pass")
    actual: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    target: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    unit: Mapped[str] = mapped_column(String(24), nullable=False, default="count")
    window_hours: Mapped[int] = mapped_column(nullable=False, default=24)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

