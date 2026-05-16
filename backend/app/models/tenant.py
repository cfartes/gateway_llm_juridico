from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.types import TenantPlan
from app.models.base import UUIDTimestampMixin


class Tenant(UUIDTimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    plan: Mapped[TenantPlan] = mapped_column(
        Enum(TenantPlan, native_enum=False, values_callable=lambda enum_cls: [item.value for item in enum_cls]),
        default=TenantPlan.STARTER,
        nullable=False,
    )
    cnpj: Mapped[str | None] = mapped_column(String(14), unique=True, index=True, nullable=True)
    legal_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    address_line: Mapped[str | None] = mapped_column(String(180), nullable=True)
    address_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address_complement: Mapped[str | None] = mapped_column(String(120), nullable=True)
    district: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    api_tokens = relationship("APIToken", back_populates="tenant", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="tenant", cascade="all, delete-orphan")
    scan_jobs = relationship("ScanJob", back_populates="tenant", cascade="all, delete-orphan")

