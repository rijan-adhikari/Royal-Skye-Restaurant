"""Track ingredient consumption when POS order items are added.

Revision ID: 20261121_06
Revises: 20261121_05
"""
from alembic import op

revision = "20261121_06"
down_revision = "20261121_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fractional case consumption (1/24 and 1/12) needs more than 3 decimal places.
    for table, column in [
        ("inventory_items", "quantity"),
        ("inventory_items", "reorder_level"),
        ("stock_movements", "quantity"),
        ("recipe_items", "quantity"),
        ("bill_cost_snapshots", "quantity"),
    ]:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE NUMERIC(18,6)")

    op.execute("""
        CREATE TABLE order_item_stock_consumptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
            inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
            quantity NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
            unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
            restored_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(order_item_id, inventory_item_id)
        )
    """)
    op.execute("CREATE INDEX ix_order_item_stock_consumptions_order_item ON order_item_stock_consumptions(order_item_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS order_item_stock_consumptions")
    for table, column in [
        ("inventory_items", "quantity"),
        ("inventory_items", "reorder_level"),
        ("stock_movements", "quantity"),
        ("recipe_items", "quantity"),
        ("bill_cost_snapshots", "quantity"),
    ]:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE NUMERIC(14,3)")
