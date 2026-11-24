"""Protect cash drawer link history from cascading deletion.

Revision ID: 20261124_09
Revises: 20261124_08
"""
from alembic import op

revision = "20261124_09"
down_revision = "20261124_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Archived and legitimately unassigned cash records must remain representable
    # without attaching them to an unrelated open shift.
    op.execute("ALTER TABLE cash_drawer_entries ALTER COLUMN shift_id DROP NOT NULL")
    op.execute("ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS method VARCHAR(24) NOT NULL DEFAULT 'legacy_unclassified'")
    op.execute("""CREATE TABLE IF NOT EXISTS cash_payment_links (
        payment_id UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE RESTRICT,
        linked_by UUID REFERENCES users(id),
        linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
        source VARCHAR(24) NOT NULL DEFAULT 'automatic'
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS cash_repayment_links (
        transaction_id UUID PRIMARY KEY REFERENCES balance_transactions(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE RESTRICT,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS cash_refund_links (
        refund_id UUID PRIMARY KEY REFERENCES bill_refunds(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE RESTRICT,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )""")
    for table, constraint in (
        ("cash_payment_links", "fk_cash_payment_links_drawer_entry_restrict"),
        ("cash_repayment_links", "fk_cash_repayment_links_drawer_entry_restrict"),
        ("cash_refund_links", "fk_cash_refund_links_drawer_entry_restrict"),
    ):
        op.execute(f"""
        DO $$
        DECLARE existing_constraint RECORD;
        BEGIN
            FOR existing_constraint IN
                SELECT conname FROM pg_constraint
                WHERE conrelid = '{table}'::regclass
                  AND contype = 'f'
                  AND confrelid = 'cash_drawer_entries'::regclass
            LOOP
                EXECUTE format('ALTER TABLE {table} DROP CONSTRAINT %I', existing_constraint.conname);
            END LOOP;
            ALTER TABLE {table} ADD CONSTRAINT {constraint}
                FOREIGN KEY (drawer_entry_id) REFERENCES cash_drawer_entries(id) ON DELETE RESTRICT;
        END $$;
        """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_cash_drawer_entries_unassigned_created ON cash_drawer_entries(created_at) WHERE shift_id IS NULL")


def downgrade() -> None:
    for table, constraint in (
        ("cash_payment_links", "fk_cash_payment_links_drawer_entry_restrict"),
        ("cash_repayment_links", "fk_cash_repayment_links_drawer_entry_restrict"),
        ("cash_refund_links", "fk_cash_refund_links_drawer_entry_restrict"),
    ):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {constraint}_cascade FOREIGN KEY (drawer_entry_id) REFERENCES cash_drawer_entries(id) ON DELETE CASCADE")
    op.execute("DROP INDEX IF EXISTS ix_cash_drawer_entries_unassigned_created")
