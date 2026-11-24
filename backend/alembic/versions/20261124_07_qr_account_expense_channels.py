"""Track expense payment channels and the restaurant QR account ledger.

Revision ID: 20261124_07
Revises: 20261121_06
"""
from alembic import op

revision = "20261124_07"
down_revision = "20261121_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(24) NOT NULL DEFAULT 'legacy_unclassified'")
    op.execute("ALTER TABLE cash_drawer_entries ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_drawer_entries_expense ON cash_drawer_entries(expense_id) WHERE expense_id IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_expenses_payment_channel_date ON expenses(payment_method,payment_status,expense_date DESC)")
    op.execute("CREATE TABLE IF NOT EXISTS qr_account_settings (id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1), opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id))")
    op.execute("INSERT INTO qr_account_settings(id,opening_balance) VALUES(1,0) ON CONFLICT(id) DO NOTHING")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS qr_account_settings")
    op.execute("DROP INDEX IF EXISTS ix_expenses_payment_channel_date")
    op.execute("DROP INDEX IF EXISTS uq_cash_drawer_entries_expense")
    op.execute("ALTER TABLE cash_drawer_entries DROP COLUMN IF EXISTS expense_id")
    op.execute("ALTER TABLE expenses DROP COLUMN IF EXISTS payment_method")
