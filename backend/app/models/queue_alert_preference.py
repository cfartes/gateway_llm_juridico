from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class QueueAlertPreference(UUIDTimestampMixin, Base):
    __tablename__ = "queue_alert_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "scope", "scope_key", name="uq_queue_alert_pref_user_scope_key"),
    )

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scope: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    scope_key: Mapped[str] = mapped_column(String(64), nullable=False)
    snooze_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_signature: Mapped[str | None] = mapped_column(Text(), nullable=True)
