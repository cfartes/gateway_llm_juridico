from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDTimestampMixin


class SupportTicket(UUIDTimestampMixin, Base):
    __tablename__ = "support_tickets"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    requester_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    priority: Mapped[str] = mapped_column(String(24), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="open")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
