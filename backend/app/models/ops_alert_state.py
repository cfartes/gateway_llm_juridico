from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class OpsAlertState(UUIDTimestampMixin, Base):
    __tablename__ = "ops_alert_states"
    __table_args__ = (
        UniqueConstraint("scope_key", "indicator_name", name="uq_ops_alert_scope_indicator"),
    )

    scope_key: Mapped[str] = mapped_column(String(120), index=True, nullable=False, default="global")
    indicator_name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    last_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pass")
    last_actual: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    target: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    unit: Mapped[str] = mapped_column(String(24), nullable=False, default="count")
    last_signature: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    alert_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

