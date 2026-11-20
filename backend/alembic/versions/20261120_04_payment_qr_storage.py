"""Store uploaded payment QR images without filesystem persistence.

Revision ID: 20261120_04
Revises: 20261112_03
"""
from alembic import op

revision = "20261120_04"
down_revision = "20261112_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE restaurant_settings ALTER COLUMN qr_image_path TYPE TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE restaurant_settings ALTER COLUMN qr_image_path TYPE VARCHAR(255)")
