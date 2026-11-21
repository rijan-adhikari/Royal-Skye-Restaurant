"""Add persistent inventory categories.

Revision ID: 20261121_05
Revises: 20261120_04
"""
from alembic import op

revision = "20261121_05"
down_revision = "20261120_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS inventory_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(80) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_categories_name_ci ON inventory_categories (lower(name))")
    op.execute("""
        INSERT INTO inventory_categories(name)
        SELECT DISTINCT COALESCE(NULLIF(BTRIM(category), ''), 'General')
        FROM inventory_items
        ON CONFLICT (lower(name)) DO NOTHING
    """)
    op.execute("""
        INSERT INTO inventory_categories(name)
        SELECT 'General'
        WHERE NOT EXISTS (SELECT 1 FROM inventory_categories WHERE lower(name)=lower('General'))
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS inventory_categories")
