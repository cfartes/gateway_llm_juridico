"""expand users.role column length for superadmin role

Revision ID: 0009_expand_user_role_length
Revises: 0008_users_email_unique
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_expand_user_role_length"
down_revision = "0008_users_email_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "role", existing_type=sa.String(length=7), type_=sa.String(length=32), nullable=False)


def downgrade() -> None:
    op.alter_column("users", "role", existing_type=sa.String(length=32), type_=sa.String(length=7), nullable=False)
