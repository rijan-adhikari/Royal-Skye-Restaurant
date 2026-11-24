"""Anchor the QR account opening balance to a reconciliation timestamp.

Revision ID: 20261124_08
Revises: 20261124_07
"""
from alembic import op

revision = "20261124_08"
down_revision = "20261124_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE qr_account_settings ADD COLUMN IF NOT EXISTS opening_balance_at TIMESTAMP NOT NULL DEFAULT NOW()")


def downgrade() -> None:
    op.execute("ALTER TABLE qr_account_settings DROP COLUMN IF EXISTS opening_balance_at")
