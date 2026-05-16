"""tenant users invite + email verification fields

Revision ID: 0022_user_invite_verify
Revises: 0021_support_attach_message_link
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_user_invite_verify"
down_revision = "0021_support_attach_message_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.execute("UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL")
    op.execute("UPDATE users SET must_change_password = false WHERE must_change_password IS NULL")

    op.alter_column("users", "must_change_password", server_default=None)

    op.create_table(
        "email_verification_tokens",
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("hashed_token", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_email_verification_tokens_hashed_token"), "email_verification_tokens", ["hashed_token"], unique=True)
    op.create_index(op.f("ix_email_verification_tokens_tenant_id"), "email_verification_tokens", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_email_verification_tokens_user_id"), "email_verification_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_email_verification_tokens_user_id"), table_name="email_verification_tokens")
    op.drop_index(op.f("ix_email_verification_tokens_tenant_id"), table_name="email_verification_tokens")
    op.drop_index(op.f("ix_email_verification_tokens_hashed_token"), table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "email_verified_at")
