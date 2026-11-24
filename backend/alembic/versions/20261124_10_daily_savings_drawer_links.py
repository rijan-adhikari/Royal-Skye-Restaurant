"""Persist one-to-one links for daily savings cash-outs.

Revision ID: 20261124_10
Revises: 20261124_09
"""
from alembic import op

revision = "20261124_10"
down_revision = "20261124_09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS daily_savings (
        id BIGSERIAL PRIMARY KEY,
        shift_id UUID REFERENCES cash_drawer_shifts(id),
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        notes TEXT,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )""")
    op.execute("""CREATE TABLE IF NOT EXISTS daily_savings_drawer_links (
        daily_savings_id BIGINT PRIMARY KEY REFERENCES daily_savings(id) ON DELETE RESTRICT,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE RESTRICT,
        linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )""")
    op.execute("""WITH candidates AS (
        SELECT ds.id savings_id, e.id entry_id,
            COUNT(*) OVER (PARTITION BY ds.id) savings_matches,
            COUNT(*) OVER (PARTITION BY e.id) entry_matches
        FROM daily_savings ds
        JOIN cash_drawer_entries e
          ON e.shift_id=ds.shift_id
         AND e.entry_type='cash_out'
         AND e.reference='Daily savings'
         AND e.amount=ds.amount
         AND e.notes IS NOT DISTINCT FROM ds.notes
         AND ABS(EXTRACT(EPOCH FROM (e.created_at-ds.created_at))) <= 5
        WHERE NOT EXISTS (
            SELECT 1 FROM daily_savings_drawer_links l WHERE l.daily_savings_id=ds.id
        )
          AND NOT EXISTS (
            SELECT 1 FROM daily_savings_drawer_links l WHERE l.drawer_entry_id=e.id
        )
    )
    INSERT INTO daily_savings_drawer_links(daily_savings_id,drawer_entry_id)
    SELECT savings_id,entry_id FROM candidates
    WHERE savings_matches=1 AND entry_matches=1
    ON CONFLICT DO NOTHING""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_daily_savings_shift_created ON daily_savings(shift_id,created_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_daily_savings_shift_created")
    op.execute("DROP TABLE IF EXISTS daily_savings_drawer_links")
