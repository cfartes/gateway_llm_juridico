"""add tenant registration profile fields

Revision ID: 0023_tenant_profile_fields
Revises: 0022_user_invite_verify
Create Date: 2026-05-16
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_tenant_profile_fields"
down_revision = "0022_user_invite_verify"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("cnpj", sa.String(length=14), nullable=True))
    op.add_column("tenants", sa.Column("legal_name", sa.String(length=180), nullable=True))
    op.add_column("tenants", sa.Column("postal_code", sa.String(length=8), nullable=True))
    op.add_column("tenants", sa.Column("address_line", sa.String(length=180), nullable=True))
    op.add_column("tenants", sa.Column("address_number", sa.String(length=40), nullable=True))
    op.add_column("tenants", sa.Column("address_complement", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("district", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("city", sa.String(length=120), nullable=True))
    op.add_column("tenants", sa.Column("invoice_email", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_tenants_cnpj"), "tenants", ["cnpj"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_tenants_cnpj"), table_name="tenants")
    op.drop_column("tenants", "invoice_email")
    op.drop_column("tenants", "city")
    op.drop_column("tenants", "district")
    op.drop_column("tenants", "address_complement")
    op.drop_column("tenants", "address_number")
    op.drop_column("tenants", "address_line")
    op.drop_column("tenants", "postal_code")
    op.drop_column("tenants", "legal_name")
    op.drop_column("tenants", "cnpj")
