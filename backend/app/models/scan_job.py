from sqlalchemy import Enum, ForeignKey, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import ScanStatus
from app.models.base import UUIDTimestampMixin


class ScanJob(UUIDTimestampMixin, Base):
    __tablename__ = "scan_jobs"

    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    status: Mapped[ScanStatus] = mapped_column(Enum(ScanStatus, native_enum=False), default=ScanStatus.PENDING, nullable=False)
    threat_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    integration_meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    rag_markdown_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    tenant = relationship("Tenant", back_populates="scan_jobs")
    document = relationship("Document", back_populates="scans")

