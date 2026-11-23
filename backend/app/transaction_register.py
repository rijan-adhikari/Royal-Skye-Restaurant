from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text

BUSINESS_TZ = ZoneInfo("Asia/Kathmandu")


def ensure_register(db):
    db.execute(text("ALTER TABLE balance_transactions ADD COLUMN IF NOT EXISTS method VARCHAR(24) NOT NULL DEFAULT 'legacy_unclassified'"))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS daily_transaction_register (
            id BIGSERIAL PRIMARY KEY,
            business_date DATE NOT NULL,
            sequence_number INTEGER NOT NULL,
            source_type VARCHAR(24) NOT NULL,
            source_id UUID NOT NULL,
            bill_id UUID,
            reference VARCHAR(64) NOT NULL,
            payment_method VARCHAR(64) NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            created_at TIMESTAMP NOT NULL,
            UNIQUE(source_type, source_id),
            UNIQUE(business_date, sequence_number)
        )
    """))
    # Backfill historic sales and repayments once, preserving actual event dates.
    db.execute(text("""
        WITH events AS (
          SELECT b.business_date AS business_date, 'sale'::varchar AS source_type,
                 b.id AS source_id, b.id AS bill_id, b.bill_number AS reference,
                 COALESCE((SELECT string_agg(DISTINCT
                    CASE WHEN p.method='credit' THEN 'CREDIT' ELSE upper(p.method::text) END,
                    ' + ' ORDER BY CASE WHEN p.method='credit' THEN 'CREDIT' ELSE upper(p.method::text) END)
                    FROM payments p WHERE p.bill_id=b.id),
                    CASE WHEN b.outstanding_amount>0 THEN 'CREDIT' ELSE 'UNCLASSIFIED' END) AS payment_method,
                 b.grand_total AS amount, b.created_at
          FROM bills b WHERE b.sale_status='active'
          UNION ALL
          SELECT (bt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::date,
                 'repayment'::varchar, bt.id, cb.bill_id, b.bill_number,
                 upper(COALESCE(bt.method,'legacy_unclassified')),
                 bt.amount, bt.created_at
          FROM balance_transactions bt
          JOIN customer_balances cb ON cb.id=bt.customer_balance_id
          JOIN bills b ON b.id=cb.bill_id
        ), ranked AS (
          SELECT *, ROW_NUMBER() OVER(PARTITION BY business_date ORDER BY created_at, source_type, source_id) AS seq
          FROM events
        )
        INSERT INTO daily_transaction_register
          (business_date,sequence_number,source_type,source_id,bill_id,reference,payment_method,amount,created_at)
        SELECT business_date,seq,source_type,source_id,bill_id,reference,payment_method,amount,created_at
        FROM ranked
        ON CONFLICT DO NOTHING
    """))


def register_transaction(db, *, business_date, source_type, source_id, bill_id,
                         reference, payment_method, amount, created_at):
    ensure_register(db)
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('royal-skye-register-' || CAST(:day AS text)))"),
               {"day": business_date})
    existing = db.execute(text("""
        SELECT sequence_number FROM daily_transaction_register
        WHERE source_type=:kind AND source_id=:source
    """), {"kind": source_type, "source": source_id}).scalar()
    if existing is None:
        next_number = db.execute(text("""
            SELECT COALESCE(MAX(sequence_number),0)+1 FROM daily_transaction_register
            WHERE business_date=:day
        """), {"day": business_date}).scalar_one()
        db.execute(text("""
            INSERT INTO daily_transaction_register
              (business_date,sequence_number,source_type,source_id,bill_id,reference,payment_method,amount,created_at)
            VALUES(:day,:seq,:kind,:source,:bill,:reference,:method,:amount,:created)
            ON CONFLICT(source_type,source_id) DO NOTHING
        """), {"day": business_date, "seq": next_number, "kind": source_type,
               "source": source_id, "bill": bill_id, "reference": reference,
               "method": payment_method, "amount": amount, "created": created_at})
        existing = next_number
    return f"{int(existing):03d}"


def transaction_method(db, bill_id):
    rows = db.execute(text("""
        SELECT DISTINCT CASE WHEN method='credit' THEN 'CREDIT' ELSE upper(method::text) END AS method
        FROM payments WHERE bill_id=:bill ORDER BY method
    """), {"bill": bill_id}).scalars().all()
    return " + ".join(rows) if rows else "CREDIT"
