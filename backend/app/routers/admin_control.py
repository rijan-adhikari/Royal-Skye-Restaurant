from __future__ import annotations

from datetime import datetime, date
from io import BytesIO
from pathlib import Path
import subprocess
import uuid
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models
from app.database import get_db, engine
from app.config import settings
from sqlalchemy.engine import make_url
from app.deps import require_roles

router = APIRouter(prefix="/api/admin", tags=["administration"])
ADMIN = (models.RoleName.admin,)
MANAGERS = (models.RoleName.admin, models.RoleName.manager)
CASHIERS = (models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier)


def _pg_args() -> tuple[list[str], dict[str, str]]:
    url = make_url(settings.DATABASE_URL)
    if not url.host or not url.database or not url.username:
        raise HTTPException(500, "Database connection settings are incomplete")
    args = ["--host", url.host, "--port", str(url.port or 5432),
            "--username", url.username, "--dbname", url.database]
    env = {}
    if url.password:
        env["PGPASSWORD"] = url.password
    return args, env


def _create_database_backup(destination: Path) -> None:
    args, env = _pg_args()
    try:
        with destination.open("wb") as output:
            subprocess.run(["pg_dump", *args, "--format=custom", "--no-owner", "--no-acl"],
                           stdout=output, stderr=subprocess.PIPE, env={**__import__("os").environ, **env},
                           check=True, timeout=900)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        destination.unlink(missing_ok=True)
        raise HTTPException(500, "Database backup failed. Check database connectivity and server logs.")


@router.get("/backup")
def download_database_backup(user=Depends(require_roles(*MANAGERS))):
    backup_dir = Path(__file__).resolve().parents[2] / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    filename = "royal-skye-" + datetime.utcnow().strftime("%Y%m%d-%H%M%S") + ".dump"
    destination = backup_dir / filename
    _create_database_backup(destination)
    return FileResponse(destination, filename=filename, media_type="application/octet-stream")


@router.post("/restore")
def restore_database_backup(backup_file: UploadFile = File(...),
                            confirmation: str = Form(...),
                            db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if confirmation != "RESTORE ROYAL SKYE DATABASE":
        raise HTTPException(400, "Type the exact restore confirmation phrase")
    if not backup_file.filename or not backup_file.filename.lower().endswith(".dump"):
        raise HTTPException(415, "Upload a PostgreSQL custom-format .dump backup")
    open_orders = db.execute(text("SELECT COUNT(*) FROM orders WHERE status='open'")).scalar_one()
    open_shifts = db.execute(text("SELECT COUNT(*) FROM cash_drawer_shifts WHERE status='open'")).scalar_one()
    if open_orders or open_shifts:
        raise HTTPException(409, "Close all open orders and cash drawer shifts before restoring a database")
    db.commit()
    db.close()
    backup_dir = Path(__file__).resolve().parents[2] / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    upload_path = backup_dir / ("restore-upload-" + uuid.uuid4().hex + ".dump")
    with upload_path.open("wb") as output:
        total = 0
        while chunk := backup_file.file.read(1024 * 1024):
            total += len(chunk)
            if total > 500 * 1024 * 1024:
                upload_path.unlink(missing_ok=True)
                raise HTTPException(413, "Backup file exceeds the 500 MB upload limit")
            output.write(chunk)
    args, env = _pg_args()
    process_env = {**__import__("os").environ, **env}
    safety_backup = backup_dir / ("pre-restore-" + datetime.utcnow().strftime("%Y%m%d-%H%M%S") + ".dump")
    _create_database_backup(safety_backup)
    try:
        subprocess.run(["pg_restore", "--list", str(upload_path)], capture_output=True,
                       env=process_env, check=True, timeout=120)
        subprocess.run(["pg_restore", *args, "--clean", "--if-exists", "--no-owner",
                        "--no-acl", "--single-transaction", "--exit-on-error", str(upload_path)],
                       capture_output=True, env=process_env, check=True, timeout=1800)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        raise HTTPException(500, f"Restore failed. A safety backup was retained as {safety_backup.name}.")
    finally:
        upload_path.unlink(missing_ok=True)
    engine.dispose()
    return {"ok": True, "message": "Database restored. Sign in again using an account from the restored backup.",
            "safety_backup": safety_backup.name}


def audit(db: Session, user_id: str, action: str, details: str = "") -> None:
    # Raw SQL bypasses SQLAlchemy's Python-side AuditLog.id default, so generate
    # the UUID explicitly rather than relying on a database-side default.
    db.execute(
        text("INSERT INTO audit_logs(id,user_id,action,details) VALUES(:id,:user,:action,:details)"),
        {"id": str(uuid.uuid4()), "user": user_id, "action": action, "details": details},
    )


class ShiftOpen(BaseModel):
    opening_float: Decimal = Field(ge=0)
    notes: str | None = None


class ShiftClose(BaseModel):
    counted_cash: Decimal = Field(ge=0)
    notes: str | None = None


class CashEntry(BaseModel):
    entry_type: Literal["cash_in", "cash_out", "payout"]
    amount: Decimal = Field(gt=0)
    reference: str | None = None
    notes: str | None = None

class CashEntryUpdate(BaseModel):
    entry_type: Literal["cash_in", "cash_out", "payout"]
    amount: Decimal = Field(gt=0)
    reference: str | None = None
    notes: str | None = None


class CashSaleCorrection(BaseModel):
    method: Literal["cash", "qr", "card", "bank_transfer"]



class RefundCreate(BaseModel):
    bill_id: str
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=3, max_length=500)
    method: Literal["cash", "card", "bank_transfer", "qr"] = "cash"


class SaleVoid(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SupplierEntry(BaseModel):
    supplier_id: str
    entry_type: Literal["payment", "return", "adjustment"]
    amount: Decimal = Field(gt=0)
    reference: str | None = None
    notes: str | None = None


class ServiceOrderStatusUpdate(BaseModel):
    status: Literal["received", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]


class LoyaltySettings(BaseModel):
    enabled: bool = True
    spend_per_point: Decimal = Field(gt=0)
    point_value: Decimal = Field(ge=0)


class LoyaltyAdjustment(BaseModel):
    customer_id: str
    points: Decimal
    notes: str = Field(min_length=3, max_length=500)


def _reverse_bill_side_effects(db: Session, bill, user_id: str) -> None:
    snapshots = db.execute(text("""SELECT inventory_item_id, SUM(quantity) quantity, MAX(unit_cost) unit_cost
        FROM bill_cost_snapshots WHERE bill_id=:bill GROUP BY inventory_item_id"""),
        {"bill": bill.id}).mappings().all()
    for row in snapshots:
        db.execute(text("UPDATE inventory_items SET quantity=quantity+:qty,updated_at=NOW() WHERE id=:id"),
                   {"qty": row["quantity"], "id": row["inventory_item_id"]})
        db.execute(text("""INSERT INTO stock_movements(item_id,movement_type,quantity,unit_cost,reference,notes,created_by)
            VALUES(:item,'return',:qty,:cost,:reference,:notes,:user)"""),
            {"item": row["inventory_item_id"], "qty": row["quantity"], "cost": row["unit_cost"],
             "reference": bill.bill_number, "notes": "Stock restored for voided/deleted sale", "user": user_id})
    loyalty_rows = db.execute(text("""SELECT customer_id,
        COALESCE(SUM(CASE WHEN transaction_type='earn' THEN points ELSE 0 END),0) earned,
        COALESCE(SUM(CASE WHEN transaction_type='redeem' THEN points ELSE 0 END),0) redeemed
        FROM loyalty_transactions WHERE bill_id=:bill GROUP BY customer_id"""),
        {"bill": bill.id}).mappings().all()
    for row in loyalty_rows:
        db.execute(text("""UPDATE loyalty_accounts SET
            points_balance=GREATEST(0,points_balance-:earned+:redeemed),
            lifetime_points=GREATEST(0,lifetime_points-:earned),updated_at=NOW()
            WHERE customer_id=:customer"""),
            {"earned": row["earned"], "redeemed": row["redeemed"], "customer": row["customer_id"]})
    balance_ids = db.query(models.CustomerBalance.id).filter(models.CustomerBalance.bill_id == bill.id)
    db.query(models.BalanceTransaction).filter(models.BalanceTransaction.customer_balance_id.in_(balance_ids)).delete(synchronize_session=False)
    db.query(models.CustomerBalance).filter(models.CustomerBalance.bill_id == bill.id).delete(synchronize_session=False)
    bill.outstanding_amount = 0


@router.get("/sales")
def list_sales(start: date | None = None, end: date | None = None,
               db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    if start and end and end < start:
        raise HTTPException(422, "End date must not precede start date")
    rows = db.execute(text("""SELECT b.id,b.bill_number,b.business_date,b.created_at,b.grand_total,
        b.amount_paid,b.outstanding_amount,b.sale_status,b.void_reason,
        COALESCE(c.name,sd.customer_name,'Walk-in') customer_name,
        COALESCE(sd.service_type,t.name,'') table_name
        FROM bills b JOIN orders o ON o.id=b.order_id
        LEFT JOIN customers c ON c.id=b.customer_id
        LEFT JOIN order_service_details sd ON sd.order_id=o.id
        LEFT JOIN tables t ON t.id=o.table_id
        WHERE (:start IS NULL OR b.business_date>=:start)
          AND (:end IS NULL OR b.business_date<=:end)
        ORDER BY b.created_at DESC LIMIT 500"""), {"start": start, "end": end}).mappings().all()
    return [dict(row) for row in rows]


@router.patch("/sales/{bill_id}/void")
def void_sale(bill_id: str, payload: SaleVoid, db: Session = Depends(get_db),
              user=Depends(require_roles(*ADMIN))):
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).with_for_update().first()
    if not bill:
        raise HTTPException(404, "Sale not found")
    if bill.sale_status != "active":
        raise HTTPException(409, "Only an active sale can be voided")
    _reverse_bill_side_effects(db, bill, user.id)
    bill.sale_status = "voided"
    bill.voided_at = datetime.utcnow()
    bill.voided_by = user.id
    bill.void_reason = payload.reason
    audit(db, user.id, "bill.void", f"Voided {bill.bill_number}: {payload.reason}")
    db.commit()
    return {"ok": True, "status": "voided"}


@router.delete("/sales/{bill_id}")
def permanently_delete_sale(bill_id: str, db: Session = Depends(get_db),
                             user=Depends(require_roles(*ADMIN))):
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).with_for_update().first()
    if not bill:
        raise HTTPException(404, "Sale not found")
    bill_id_value, order_id, bill_number = bill.id, bill.order_id, bill.bill_number
    # Voided sales already had stock, loyalty and credit effects reversed.
    if bill.sale_status == "active":
        _reverse_bill_side_effects(db, bill, user.id)
    db.execute(text("DELETE FROM bill_cost_snapshots WHERE bill_id=:bill"), {"bill": bill_id_value})
    db.execute(text("DELETE FROM bill_refunds WHERE bill_id=:bill"), {"bill": bill_id_value})
    db.execute(text("DELETE FROM loyalty_transactions WHERE bill_id=:bill"), {"bill": bill_id_value})
    db.query(models.Payment).filter(models.Payment.bill_id == bill_id_value).delete(synchronize_session=False)
    db.query(models.Bill).filter(models.Bill.id == bill_id_value).delete(synchronize_session=False)
    db.execute(text("DELETE FROM kot_items WHERE kot_id IN (SELECT id FROM kots WHERE order_id=:order)"), {"order": order_id})
    db.execute(text("DELETE FROM kots WHERE order_id=:order"), {"order": order_id})
    db.execute(text("DELETE FROM order_items WHERE order_id=:order"), {"order": order_id})
    db.execute(text("DELETE FROM orders WHERE id=:order"), {"order": order_id})
    audit(db, user.id, "bill.permanent_delete", f"Permanently deleted sale {bill_number}")
    db.commit()
    return {"ok": True, "status": "deleted"}


def _report_data(start: date, end: date, db: Session):
    if end < start:
        raise HTTPException(422, "End date must not precede start date")
    summary = db.execute(text("""SELECT COUNT(*) bill_count,
        COALESCE(SUM(b.subtotal),0) gross_sales, COALESCE(SUM(b.discount_amount),0) discounts,
        COALESCE(SUM(b.tax_amount),0) tax, COALESCE(SUM(b.service_charge_amount),0) service_charge,
        COALESCE(SUM(b.grand_total),0) billed_total, COALESCE(SUM(b.amount_paid),0) received
        FROM bills b WHERE b.business_date BETWEEN :start AND :end AND b.sale_status='active'"""),
        {"start": start, "end": end}).mappings().one()
    refunds = db.execute(text("""SELECT COALESCE(SUM(r.amount),0) FROM bill_refunds r
        JOIN bills b ON b.id=r.bill_id WHERE b.business_date BETWEEN :start AND :end AND b.sale_status='active'"""),
        {"start": start, "end": end}).scalar_one()
    payments = db.execute(text("""SELECT p.method,COALESCE(SUM(p.amount),0) amount,COUNT(*) transactions
        FROM payments p JOIN bills b ON b.id=p.bill_id
        WHERE b.business_date BETWEEN :start AND :end AND b.sale_status='active' GROUP BY p.method ORDER BY p.method"""),
        {"start": start, "end": end}).mappings().all()
    items = db.execute(text("""SELECT m.name,SUM(oi.quantity) quantity,
        SUM(oi.quantity*oi.unit_price) gross_amount
        FROM bills b JOIN orders o ON o.id=b.order_id
        JOIN order_items oi ON oi.order_id=o.id AND oi.is_cancelled=FALSE
        JOIN menu_items m ON m.id=oi.menu_item_id
        WHERE b.business_date BETWEEN :start AND :end AND b.sale_status='active'
        GROUP BY m.name ORDER BY quantity DESC"""), {"start": start, "end": end}).mappings().all()
    staff = db.execute(text("""SELECT u.full_name,COUNT(b.id) bills,
        COALESCE(SUM(b.grand_total),0) billed_total,COALESCE(SUM(b.amount_paid),0) received
        FROM bills b JOIN orders o ON o.id=b.order_id JOIN users u ON u.id=o.waiter_id
        WHERE b.business_date BETWEEN :start AND :end AND b.sale_status='active'
        GROUP BY u.id,u.full_name ORDER BY billed_total DESC"""),
        {"start": start, "end": end}).mappings().all()
    return summary, Decimal(str(refunds)), payments, items, staff


@router.get("/reports/sales.csv")
def export_sales_csv(start: date, end: date, db: Session = Depends(get_db),
                     user=Depends(require_roles(*ADMIN))):
    summary, refunds, payments, items, staff = _report_data(start, end, db)
    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Royal Skye sales report", start.isoformat(), end.isoformat()])
    writer.writerow(["Bills", summary["bill_count"]])
    writer.writerow(["Gross sales", summary["gross_sales"]])
    writer.writerow(["Discounts", summary["discounts"]])
    writer.writerow(["Refunds", refunds])
    writer.writerow(["Net sales", Decimal(str(summary["gross_sales"])) - Decimal(str(summary["discounts"])) - refunds])
    writer.writerow([])
    writer.writerow(["Payment method", "Amount", "Transactions"])
    for row in payments:
        writer.writerow([row["method"], row["amount"], row["transactions"]])
    writer.writerow([])
    writer.writerow(["Item", "Quantity", "Gross amount"])
    for row in items:
        writer.writerow([row["name"], row["quantity"], row["gross_amount"]])
    writer.writerow([])
    writer.writerow(["Staff", "Bills", "Billed total", "Received"])
    for row in staff:
        writer.writerow([row["full_name"], row["bills"], row["billed_total"], row["received"]])
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=royal-skye-sales-{start}-{end}.csv"})


@router.get("/reports/sales.xlsx")
def export_sales_xlsx(start: date, end: date, db: Session = Depends(get_db),
                      user=Depends(require_roles(*ADMIN))):
    from openpyxl import Workbook
    summary, refunds, payments, items, staff = _report_data(start, end, db)
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Summary"
    sheet.append(["Royal Skye sales report", f"{start} to {end}"])
    sheet.append(["Bills", summary["bill_count"]])
    sheet.append(["Gross sales", float(summary["gross_sales"])])
    sheet.append(["Discounts", float(summary["discounts"])])
    sheet.append(["Refunds", float(refunds)])
    sheet.append(["Net sales", float(Decimal(str(summary["gross_sales"])) - Decimal(str(summary["discounts"])) - refunds)])
    sheet.append(["Tax collected", float(summary["tax"])])
    sheet.append(["Service charge", float(summary["service_charge"])])
    for title, headers, rows in [
        ("Payments", ["Method", "Amount", "Transactions"], [[r["method"], float(r["amount"]), r["transactions"]] for r in payments]),
        ("Items", ["Item", "Quantity", "Gross amount"], [[r["name"], float(r["quantity"]), float(r["gross_amount"])] for r in items]),
        ("Staff", ["Staff", "Bills", "Billed total", "Received"], [[r["full_name"], r["bills"], float(r["billed_total"]), float(r["received"])] for r in staff]),
    ]:
        ws = workbook.create_sheet(title)
        ws.append(headers)
        for row in rows:
            ws.append(row)
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=royal-skye-sales-{start}-{end}.xlsx"})


@router.get("/reports/sales.pdf")
def export_sales_pdf(start: date, end: date, db: Session = Depends(get_db),
                     user=Depends(require_roles(*ADMIN))):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    summary, refunds, payments, items, staff = _report_data(start, end, db)
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, title="Royal Skye Sales Report",
        rightMargin=16, leftMargin=16, topMargin=22, bottomMargin=24, author="Royal Skye Restaurant POS")
    styles = getSampleStyleSheet()
    ink=colors.HexColor("#080A0D"); crimson=colors.HexColor("#C8102E")
    silver=colors.HexColor("#68717D"); paper=colors.HexColor("#F3F5F7")
    styles.add(ParagraphStyle(name="ReportTitle",parent=styles["Title"],fontName="Helvetica-Bold",
        fontSize=22,leading=26,textColor=colors.white,alignment=1))
    styles.add(ParagraphStyle(name="ReportMeta",parent=styles["Normal"],fontSize=8,
        textColor=colors.HexColor("#C6CDD5"),alignment=1))
    styles.add(ParagraphStyle(name="ReportSection",parent=styles["Heading2"],fontName="Helvetica-Bold",
        fontSize=12,textColor=crimson,spaceBefore=12,spaceAfter=6))
    masthead=Table([[Paragraph("ROYAL SKYE  /  SALES INTELLIGENCE",styles["ReportTitle"])],
        [Paragraph(f"REPORTING PERIOD  {start}  —  {end}",styles["ReportMeta"])]],colWidths=[178*mm])
    masthead.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),ink),("BOX",(0,0),(-1,-1),1,crimson),
        ("LINEBELOW",(0,0),(-1,0),2,crimson),("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10)]))
    story = [masthead, Spacer(1, 8)]
    net_sales = Decimal(str(summary["gross_sales"])) - Decimal(str(summary["discounts"])) - refunds
    summary_rows = [["Metric", "Amount / Count"], ["Bills", str(summary["bill_count"])],
        ["Gross sales", f"NPR {summary['gross_sales']}"], ["Discounts", f"NPR {summary['discounts']}"],
        ["Refunds", f"NPR {refunds}"], ["Net sales", f"NPR {net_sales}"],
        ["Tax collected", f"NPR {summary['tax']}"], ["Service charge", f"NPR {summary['service_charge']}"]]
    for title, rows in [
        ("Summary", summary_rows),
        ("Payment methods", [["Method", "Amount", "Transactions"]] + [[r["method"], str(r["amount"]), str(r["transactions"])] for r in payments]),
        ("Top selling items", [["Item", "Quantity", "Gross"]] + [[r["name"], str(r["quantity"]), str(r["gross_amount"])] for r in items[:20]]),
        ("Staff performance", [["Staff", "Bills", "Billed", "Received"]] + [[r["full_name"], str(r["bills"]), str(r["billed_total"]), str(r["received"])] for r in staff]),
    ]:
        story.append(Paragraph(title, styles["ReportSection"]))
        table = Table(rows, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), ink),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#D9DEE5")),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, paper]),
            ("FONTSIZE", (0,0), (-1,-1), 8), ("PADDING", (0,0), (-1,-1), 5),
        ]))
        story.extend([table, Spacer(1, 12)])
    def report_footer(canvas, doc):
        canvas.saveState()
        width, _ = A4
        canvas.setFillColor(ink); canvas.rect(0,0,width,15,fill=1,stroke=0)
        canvas.setStrokeColor(crimson); canvas.setLineWidth(1.2); canvas.line(16,15,width-16,15)
        canvas.setFont("Helvetica-Bold",7); canvas.setFillColor(colors.white)
        canvas.drawString(16,6,"ROYAL SKYE  /  CONFIDENTIAL")
        canvas.setFillColor(colors.HexColor("#B9C1CB")); canvas.drawRightString(width-16,6,f"PAGE {doc.page}")
        canvas.restoreState()
    document.build(story, onFirstPage=report_footer, onLaterPages=report_footer)
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=royal-skye-sales-{start}-{end}.pdf"})


@router.get("/service-orders")
def list_service_orders(status: str | None = None, db: Session = Depends(get_db),
                        user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT d.*,o.order_number,o.status order_status,
        b.bill_number,b.grand_total,b.amount_paid
        FROM order_service_details d JOIN orders o ON o.id=d.order_id
        LEFT JOIN bills b ON b.order_id=o.id
        WHERE (:status IS NULL OR d.status=:status)
        ORDER BY d.created_at DESC LIMIT 500"""), {"status": status}).mappings().all()
    return [dict(row) for row in rows]


@router.patch("/service-orders/{order_id}/status")
def update_service_order_status(order_id: str, payload: ServiceOrderStatusUpdate,
                                db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    detail = db.execute(text("""SELECT d.*,o.status order_status FROM order_service_details d
        JOIN orders o ON o.id=d.order_id WHERE d.order_id=:id FOR UPDATE OF d,o"""),
        {"id": order_id}).mappings().first()
    if not detail:
        raise HTTPException(404, "Service order not found")
    if payload.status == "out_for_delivery" and detail["service_type"] != "delivery":
        raise HTTPException(422, "Only delivery orders can be dispatched")
    if payload.status in ("out_for_delivery", "completed") and detail["order_status"] != "completed":
        raise HTTPException(409, "Generate the bill before dispatching or completing this service order")
    if payload.status == "cancelled":
        if detail["order_status"] != "open":
            raise HTTPException(409, "A billed order cannot be cancelled here; record a refund instead")
        db.execute(text("UPDATE orders SET status='cancelled' WHERE id=:id"), {"id": order_id})
        db.execute(text("UPDATE order_items SET is_cancelled=TRUE WHERE order_id=:id"), {"id": order_id})
        db.execute(text("UPDATE kots SET status='cancelled' WHERE order_id=:id AND status NOT IN ('served','cancelled')"),
                   {"id": order_id})
    db.execute(text("UPDATE order_service_details SET status=:status,updated_at=NOW() WHERE order_id=:id"),
               {"status": payload.status, "id": order_id})
    audit(db, user.id, "service_order.status", f"Order {order_id} status changed to {payload.status}")
    db.commit()
    return {"ok": True, "order_id": order_id, "status": payload.status}


@router.get("/audit")
def list_audit_logs(limit: int = Query(100, ge=1, le=500),
                    db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    rows = db.execute(text("""SELECT a.id,a.action,a.details,a.created_at,u.username,u.full_name
        FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
        ORDER BY a.created_at DESC LIMIT :limit"""), {"limit": limit}).mappings().all()
    return [dict(row) for row in rows]



def _ensure_daily_savings_table(db: Session):
    db.execute(text("""CREATE TABLE IF NOT EXISTS daily_savings (
        id BIGSERIAL PRIMARY KEY, shift_id UUID REFERENCES cash_drawer_shifts(id),
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), notes TEXT,
        created_by UUID NOT NULL REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    db.commit()


@router.get("/daily-savings")
def list_daily_savings(db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    _ensure_daily_savings_table(db)
    rows = db.execute(text("""SELECT s.id,s.shift_id,s.amount,s.notes,s.created_at,u.full_name created_by_name
        FROM daily_savings s JOIN users u ON u.id=s.created_by ORDER BY s.created_at DESC LIMIT 1000""")).mappings().all()
    total = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM daily_savings")).scalar_one()
    return {"total": str(total), "entries": [dict(row) for row in rows]}


@router.post("/cash-shifts/{shift_id}/daily-savings")
def add_daily_savings(shift_id: str, payload: CashEntry, db: Session = Depends(get_db),
                      user=Depends(require_roles(*CASHIERS))):
    _ensure_daily_savings_table(db)
    shift = db.execute(text("SELECT id,opening_float FROM cash_drawer_shifts WHERE id=:id AND status='open' FOR UPDATE"), {"id": shift_id}).mappings().first()
    if not shift:
        raise HTTPException(409, "Cash shift is not open")
    totals = db.execute(text("SELECT entry_type,COALESCE(SUM(amount),0) amount FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"), {"id": shift_id}).mappings().all()
    amounts = {row["entry_type"]: Decimal(str(row["amount"])) for row in totals}
    expected = Decimal(str(shift["opening_float"])) + amounts.get("sale", Decimal(0)) + amounts.get("cash_in", Decimal(0)) - amounts.get("refund", Decimal(0)) - amounts.get("cash_out", Decimal(0)) - amounts.get("payout", Decimal(0))
    if payload.amount > expected:
        raise HTTPException(422, f"Savings amount exceeds available drawer cash of {expected}")
    db.execute(text("""INSERT INTO cash_drawer_entries(shift_id,entry_type,amount,reference,notes,created_by)
        VALUES(:shift,'cash_out',:amount,'Daily savings',:notes,:user)"""), {"shift":shift_id,"amount":payload.amount,"notes":payload.notes,"user":user.id})
    row=db.execute(text("INSERT INTO daily_savings(shift_id,amount,notes,created_by) VALUES(:shift,:amount,:notes,:user) RETURNING *"), {"shift":shift_id,"amount":payload.amount,"notes":payload.notes,"user":user.id}).mappings().first()
    audit(db,user.id,"daily_savings.deposit",f"Transferred NPR {payload.amount} from cash drawer to daily savings")
    db.commit()
    return dict(row)


@router.get("/cash-shifts")
def list_cash_shifts(limit: int = Query(50, ge=1, le=200),
                     db: Session = Depends(get_db), user=Depends(require_roles(*CASHIERS))):
    rows = db.execute(text("""SELECT s.*,u.full_name opened_by_name,c.full_name closed_by_name
        FROM cash_drawer_shifts s JOIN users u ON u.id=s.opened_by
        LEFT JOIN users c ON c.id=s.closed_by ORDER BY s.opened_at DESC LIMIT :limit"""),
        {"limit": limit}).mappings().all()
    result = []
    for row in rows:
        entries = db.execute(text("""SELECT e.id,e.entry_type,e.amount,e.reference,e.notes,e.created_at,u.full_name created_by_name
            FROM cash_drawer_entries e JOIN users u ON u.id=e.created_by
            WHERE e.shift_id=:id ORDER BY e.created_at DESC"""), {"id": row["id"]}).mappings().all()
        entry_totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""), {"id": row["id"]}).mappings().all()
        amounts = {entry["entry_type"]: Decimal(str(entry["amount"])) for entry in entry_totals}
        calculated_expected = (Decimal(str(row["opening_float"])) + amounts.get("sale", Decimal(0))
            + amounts.get("cash_in", Decimal(0)) - amounts.get("refund", Decimal(0))
            - amounts.get("cash_out", Decimal(0)) - amounts.get("payout", Decimal(0)))
        expected_cash = row["expected_cash"] if row["expected_cash"] is not None else calculated_expected
        result.append(dict(row) | {"expected_cash": str(expected_cash), "cash_entries": [dict(entry) for entry in entries]})
    return result


@router.get("/cash-shifts/current")
def current_cash_shift(db: Session = Depends(get_db), user=Depends(require_roles(*CASHIERS))):
    row = db.execute(text("""SELECT s.*,u.full_name opened_by_name FROM cash_drawer_shifts s
        JOIN users u ON u.id=s.opened_by WHERE s.status='open' ORDER BY s.opened_at DESC LIMIT 1""")).mappings().first()
    if not row:
        return None
    entries = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
        FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""), {"id": row["id"]}).mappings().all()
    totals = {r["entry_type"]: Decimal(str(r["amount"])) for r in entries}
    expected = Decimal(str(row["opening_float"])) + totals.get("sale", Decimal(0)) + totals.get("cash_in", Decimal(0)) - totals.get("refund", Decimal(0)) - totals.get("cash_out", Decimal(0)) - totals.get("payout", Decimal(0))
    entry_rows = db.execute(text("""SELECT e.id,e.entry_type,e.amount,e.reference,e.notes,e.created_at,u.full_name created_by_name
        FROM cash_drawer_entries e JOIN users u ON u.id=e.created_by
        WHERE e.shift_id=:id ORDER BY e.created_at DESC"""), {"id": row["id"]}).mappings().all()
    return dict(row) | {"entries": {k: str(v) for k,v in totals.items()},
        "cash_entries": [dict(entry) for entry in entry_rows], "expected_cash": str(expected)}


@router.post("/cash-shifts/open")
def open_cash_shift(payload: ShiftOpen, db: Session = Depends(get_db), user=Depends(require_roles(*CASHIERS))):
    existing = db.execute(text("SELECT id FROM cash_drawer_shifts WHERE status='open' FOR UPDATE")).first()
    if existing:
        raise HTTPException(409, "A cash drawer shift is already open")
    previous = db.execute(text("""SELECT id,counted_cash,expected_cash,opening_float
        FROM cash_drawer_shifts WHERE status='closed' ORDER BY closed_at DESC NULLS LAST,opened_at DESC
        LIMIT 1 FOR UPDATE""")).mappings().first()
    carried_from = previous["id"] if previous else None
    opening_float = (Decimal(str(previous["counted_cash"])) if previous and previous["counted_cash"] is not None
                     else Decimal(str(previous["expected_cash"])) if previous and previous["expected_cash"] is not None
                     else Decimal(str(previous["opening_float"])) if previous
                     else payload.opening_float)
    notes = payload.notes
    if carried_from:
        carry_note = f"Opening cash carried forward from previous shift {carried_from}"
        notes = f"{carry_note}\n{notes}" if notes else carry_note
    row = db.execute(text("""INSERT INTO cash_drawer_shifts(opened_by,opening_float,notes)
        VALUES(:user,:float,:notes) RETURNING *"""),
        {"user": user.id, "float": opening_float, "notes": notes}).mappings().first()
    audit(db, user.id, "cash_shift.open", f"Shift {row['id']} opened with NPR {opening_float}" +
          (f" carried forward from {carried_from}" if carried_from else ""))
    db.commit()
    return dict(row) | {"carried_forward_from": carried_from}


@router.post("/cash-shifts/{shift_id}/entries")
def add_cash_entry(shift_id: str, payload: CashEntry, db: Session = Depends(get_db),
                   user=Depends(require_roles(*CASHIERS))):
    shift = db.execute(text("SELECT id,opening_float FROM cash_drawer_shifts WHERE id=:id AND status='open' FOR UPDATE"),
                       {"id": shift_id}).mappings().first()
    if not shift:
        raise HTTPException(409, "Cash shift is not open")
    if payload.entry_type in ("cash_out", "payout"):
        totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""), {"id": shift_id}).mappings().all()
        values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
        available = (Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0))
                     + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0))
                     - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0)))
        if payload.amount > available:
            raise HTTPException(422, f"Cash-out exceeds available drawer cash of NPR {available}")
    row = db.execute(text("""INSERT INTO cash_drawer_entries(shift_id,entry_type,amount,reference,notes,created_by)
        VALUES(:shift,:type,:amount,:reference,:notes,:user) RETURNING *"""),
        {"shift": shift_id, "type": payload.entry_type, "amount": payload.amount,
         "reference": payload.reference, "notes": payload.notes, "user": user.id}).mappings().first()
    audit(db, user.id, f"cash_shift.{payload.entry_type}", f"Shift {shift_id}: NPR {payload.amount}")
    db.commit()
    return dict(row)


@router.patch("/cash-shifts/{shift_id}/entries/{entry_id}")
def update_cash_entry(shift_id: str, entry_id: str, payload: CashEntryUpdate,
                      db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    shift = db.execute(text("SELECT id,opening_float FROM cash_drawer_shifts WHERE id=:id AND status='open' FOR UPDATE"),
                       {"id": shift_id}).mappings().first()
    if not shift:
        raise HTTPException(409, "Cash shift is not open; closed shift records cannot be changed")
    existing = db.execute(text("""SELECT id,entry_type,amount FROM cash_drawer_entries
        WHERE id=:entry AND shift_id=:shift FOR UPDATE"""), {"entry": entry_id, "shift": shift_id}).mappings().first()
    if not existing:
        raise HTTPException(404, "Cash movement not found in this shift")
    if existing["entry_type"] not in ("cash_in", "cash_out", "payout"):
        raise HTTPException(403, "System-generated sale and refund records must use the admin sale-correction action")
    if payload.entry_type in ("cash_out", "payout"):
        totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id AND id<>:entry GROUP BY entry_type"""),
            {"id": shift_id, "entry": entry_id}).mappings().all()
        values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
        available = (Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0))
                     + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0))
                     - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0)))
        if payload.amount > available:
            raise HTTPException(422, f"Cash-out exceeds available drawer cash of NPR {available}")
    row = db.execute(text("""UPDATE cash_drawer_entries SET entry_type=:type,amount=:amount,
        reference=:reference,notes=:notes WHERE id=:entry RETURNING *"""),
        {"type": payload.entry_type, "amount": payload.amount, "reference": payload.reference,
         "notes": payload.notes, "entry": entry_id}).mappings().first()
    audit(db, user.id, "cash_shift.entry_updated",
          f"Shift {shift_id}: entry {entry_id} changed from {existing['entry_type']} NPR {existing['amount']} to {payload.entry_type} NPR {payload.amount}")
    db.commit()
    return dict(row)


@router.delete("/cash-shifts/{shift_id}/entries/{entry_id}")
def delete_cash_entry(shift_id: str, entry_id: str,
                      db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    shift = db.execute(text("SELECT id FROM cash_drawer_shifts WHERE id=:id AND status='open' FOR UPDATE"),
                       {"id": shift_id}).first()
    if not shift:
        raise HTTPException(409, "Cash shift is not open; closed shift records cannot be deleted")
    entry = db.execute(text("""SELECT id,entry_type,amount,reference FROM cash_drawer_entries
        WHERE id=:entry AND shift_id=:shift FOR UPDATE"""), {"entry": entry_id, "shift": shift_id}).mappings().first()
    if not entry:
        raise HTTPException(404, "Cash movement not found in this shift")
    if entry["entry_type"] not in ("cash_in", "cash_out", "payout"):
        raise HTTPException(403, "System-generated sale and refund records cannot be deleted")
    db.execute(text("DELETE FROM cash_drawer_entries WHERE id=:entry"), {"entry": entry_id})
    audit(db, user.id, "cash_shift.entry_deleted",
          f"Shift {shift_id}: deleted {entry['entry_type']} NPR {entry['amount']} reference {entry['reference'] or ''}")
    db.commit()
    return {"ok": True, "deleted_id": entry_id}


@router.patch("/cash-shifts/{shift_id}/entries/{entry_id}/closed-correction")
def correct_closed_cash_entry(shift_id: str, entry_id: str, payload: CashEntryUpdate,
                              db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    shift = db.execute(text("SELECT * FROM cash_drawer_shifts WHERE id=:id AND status='closed' FOR UPDATE"), {"id": shift_id}).mappings().first()
    if not shift: raise HTTPException(409, "This correction endpoint is only for closed shifts")
    entry = db.execute(text("SELECT id,entry_type,amount,reference FROM cash_drawer_entries WHERE id=:entry AND shift_id=:shift FOR UPDATE"), {"entry": entry_id, "shift": shift_id}).mappings().first()
    if not entry: raise HTTPException(404, "Cash movement not found in this shift")
    if entry["entry_type"] not in ("cash_in", "cash_out", "payout"): raise HTTPException(403, "System-generated sale and refund records cannot be corrected")
    if payload.entry_type in ("cash_out", "payout"):
        totals_before = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id AND id<>:entry GROUP BY entry_type"""),
            {"id": shift_id, "entry": entry_id}).mappings().all()
        before = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals_before}
        available = (Decimal(str(shift["opening_float"])) + before.get("sale", Decimal(0))
                     + before.get("cash_in", Decimal(0)) - before.get("refund", Decimal(0))
                     - before.get("cash_out", Decimal(0)) - before.get("payout", Decimal(0)))
        if payload.amount > available:
            raise HTTPException(422, f"Cash-out exceeds available drawer cash of NPR {available}")
    db.execute(text("UPDATE cash_drawer_entries SET entry_type=:type,amount=:amount,reference=:reference,notes=:notes WHERE id=:entry"), {"type": payload.entry_type, "amount": payload.amount, "reference": payload.reference, "notes": payload.notes, "entry": entry_id})
    totals = db.execute(text("SELECT entry_type,COALESCE(SUM(amount),0) amount FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"), {"id": shift_id}).mappings().all()
    values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
    expected = Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0)) + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0)) - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0))
    difference = Decimal(str(shift["counted_cash"] or 0)) - expected
    db.execute(text("UPDATE cash_drawer_shifts SET expected_cash=:expected,cash_difference=:difference WHERE id=:id"), {"expected": expected, "difference": difference, "id": shift_id})
    audit(db, user.id, "cash_shift.closed_entry_corrected", f"Closed shift {shift_id}: entry {entry_id} changed from {entry['entry_type']} NPR {entry['amount']} to {payload.entry_type} NPR {payload.amount}")
    db.commit()
    return {"ok": True, "expected_cash": str(expected), "cash_difference": str(difference)}

@router.delete("/cash-shifts/{shift_id}/entries/{entry_id}/closed-correction")
def delete_closed_cash_entry(shift_id: str, entry_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    shift = db.execute(text("SELECT * FROM cash_drawer_shifts WHERE id=:id AND status='closed' FOR UPDATE"), {"id": shift_id}).mappings().first()
    if not shift: raise HTTPException(409, "This correction endpoint is only for closed shifts")
    entry = db.execute(text("SELECT id,entry_type,amount,reference FROM cash_drawer_entries WHERE id=:entry AND shift_id=:shift FOR UPDATE"), {"entry": entry_id, "shift": shift_id}).mappings().first()
    if not entry: raise HTTPException(404, "Cash movement not found in this shift")
    if entry["entry_type"] not in ("cash_in", "cash_out", "payout"): raise HTTPException(403, "System-generated sale and refund records cannot be deleted")
    db.execute(text("DELETE FROM cash_drawer_entries WHERE id=:entry"), {"entry": entry_id})
    totals = db.execute(text("SELECT entry_type,COALESCE(SUM(amount),0) amount FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"), {"id": shift_id}).mappings().all()
    values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
    expected = Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0)) + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0)) - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0))
    difference = Decimal(str(shift["counted_cash"] or 0)) - expected
    db.execute(text("UPDATE cash_drawer_shifts SET expected_cash=:expected,cash_difference=:difference WHERE id=:id"), {"expected": expected, "difference": difference, "id": shift_id})
    audit(db, user.id, "cash_shift.closed_entry_deleted", f"Closed shift {shift_id}: deleted {entry['entry_type']} NPR {entry['amount']} reference {entry['reference'] or ''}")
    db.commit()
    return {"ok": True, "deleted_id": entry_id, "expected_cash": str(expected), "cash_difference": str(difference)}
@router.delete("/cash-shifts/{shift_id}/entries/{entry_id}/system-delete")
def delete_system_cash_entry(shift_id: str, entry_id: str, reason: str = Query(..., min_length=3, max_length=500),
                            db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    shift = db.execute(text("SELECT * FROM cash_drawer_shifts WHERE id=:id FOR UPDATE"),
                       {"id": shift_id}).mappings().first()
    if not shift:
        raise HTTPException(404, "Cash drawer shift not found")
    entry = db.execute(text("""SELECT id,entry_type,amount,reference FROM cash_drawer_entries
        WHERE id=:entry AND shift_id=:shift FOR UPDATE"""),
        {"entry": entry_id, "shift": shift_id}).mappings().first()
    if not entry:
        raise HTTPException(404, "Cash drawer record not found")
    if entry["entry_type"] not in ("sale", "refund"):
        raise HTTPException(403, "This endpoint only deletes system-generated sale or refund records")
    db.execute(text("DELETE FROM cash_drawer_entries WHERE id=:entry"), {"entry": entry_id})
    if shift["status"] == "closed":
        totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""),
            {"id": shift_id}).mappings().all()
        values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
        expected = (Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0))
                    + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0))
                    - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0)))
        difference = Decimal(str(shift["counted_cash"] or 0)) - expected
        db.execute(text("""UPDATE cash_drawer_shifts SET expected_cash=:expected,
            cash_difference=:difference WHERE id=:id"""),
            {"expected": expected, "difference": difference, "id": shift_id})
    audit(db, user.id, "cash_shift.system_entry_deleted",
          f"Shift {shift_id}: deleted system {entry['entry_type']} entry {entry_id}, "
          f"NPR {entry['amount']}, reference {entry['reference'] or ''}; reason: {reason}")
    db.commit()
    return {"ok": True, "deleted_id": entry_id}




@router.patch("/cash-shifts/{shift_id}/entries/{entry_id}/sale-correction")
def correct_system_sale_entry(shift_id: str, entry_id: str, payload: CashSaleCorrection,
                              db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    shift = db.execute(text("SELECT * FROM cash_drawer_shifts WHERE id=:id FOR UPDATE"),
                       {"id": shift_id}).mappings().first()
    if not shift:
        raise HTTPException(404, "Cash drawer shift not found")
    entry = db.execute(text("""SELECT id,entry_type,amount,reference FROM cash_drawer_entries
        WHERE id=:entry AND shift_id=:shift FOR UPDATE"""),
        {"entry": entry_id, "shift": shift_id}).mappings().first()
    if not entry or entry["entry_type"] != "sale":
        raise HTTPException(404, "Automatic cash sale entry not found")
    payment = db.execute(text("""SELECT p.id,p.method,p.amount,b.bill_number FROM payments p
        JOIN bills b ON b.id=p.bill_id WHERE b.bill_number=:reference
          AND p.method='cash' AND p.amount=:amount FOR UPDATE OF p,b"""),
        {"reference": entry["reference"], "amount": entry["amount"]}).mappings().all()
    if len(payment) != 1:
        raise HTTPException(409, "Could not uniquely match this cash-drawer entry to its bill payment. No changes were made.")
    db.execute(text("UPDATE payments SET method=:method WHERE id=:id"),
               {"method": payload.method, "id": payment[0]["id"]})
    if payload.method != "cash":
        db.execute(text("DELETE FROM cash_drawer_entries WHERE id=:id"), {"id": entry_id})
    if shift["status"] == "closed":
        totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""),
            {"id": shift_id}).mappings().all()
        values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
        expected = (Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0))
                    + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0))
                    - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0)))
        difference = Decimal(str(shift["counted_cash"] or 0)) - expected
        db.execute(text("UPDATE cash_drawer_shifts SET expected_cash=:expected,cash_difference=:difference WHERE id=:id"),
                   {"expected": expected, "difference": difference, "id": shift_id})
    audit(db, user.id, "cash_shift.sale_payment_corrected",
          f"Bill {entry['reference']}: payment method changed from cash to {payload.method}; drawer entry " +
          ("removed from cash balance" if payload.method != "cash" else "retained as cash"))
    db.commit()
    return {"ok": True, "payment_method": payload.method, "cash_entry_removed": payload.method != "cash"}

@router.post("/cash-shifts/{shift_id}/close")
def close_cash_shift(shift_id: str, payload: ShiftClose, db: Session = Depends(get_db),
                    user=Depends(require_roles(*CASHIERS))):
    shift = db.execute(text("SELECT * FROM cash_drawer_shifts WHERE id=:id AND status='open' FOR UPDATE"),
                       {"id": shift_id}).mappings().first()
    if not shift:
        raise HTTPException(409, "Cash shift is already closed or does not exist")
    totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
        FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""), {"id": shift_id}).mappings().all()
    values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
    expected = Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0)) + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0)) - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0))
    difference = payload.counted_cash - expected
    row = db.execute(text("""UPDATE cash_drawer_shifts SET status='closed',closed_by=:user,
        expected_cash=:expected,counted_cash=:counted,cash_difference=:difference,
        notes=COALESCE(notes,'') || CASE WHEN :notes IS NULL OR :notes='' THEN '' ELSE E'\\n' || :notes END,
        closed_at=NOW() WHERE id=:id RETURNING *"""),
        {"user": user.id, "expected": expected, "counted": payload.counted_cash,
         "difference": difference, "notes": payload.notes, "id": shift_id}).mappings().first()
    audit(db, user.id, "cash_shift.close", f"Shift {shift_id}: expected NPR {expected}, counted NPR {payload.counted_cash}, difference NPR {difference}")
    db.commit()
    return dict(row)


@router.get("/refundable-bills")
def refundable_bills(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT b.id,b.bill_number,b.created_at,b.grand_total,b.amount_paid,
        b.amount_paid-COALESCE(SUM(r.amount),0) refundable_amount
        FROM bills b LEFT JOIN bill_refunds r ON r.bill_id=b.id
        GROUP BY b.id HAVING b.sale_status='active' AND b.amount_paid-COALESCE(SUM(r.amount),0)>0
        ORDER BY b.created_at DESC LIMIT 300""")).mappings().all()
    return [dict(row) for row in rows]


@router.get("/refunds")
def list_refunds(start: date | None = None, end: date | None = None,
                 db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if start and end and end < start:
        raise HTTPException(422, "End date must not precede start date")
    rows = db.execute(text("""SELECT r.*,b.bill_number,u.full_name refunded_by
        FROM bill_refunds r JOIN bills b ON b.id=r.bill_id JOIN users u ON u.id=r.created_by
        WHERE (:start IS NULL OR r.created_at::date>=:start)
          AND (:end IS NULL OR r.created_at::date<=:end)
        ORDER BY r.created_at DESC LIMIT 500"""), {"start": start, "end": end}).mappings().all()
    return [dict(row) for row in rows]


@router.post("/refunds")
def create_refund(payload: RefundCreate, db: Session = Depends(get_db),
                  user=Depends(require_roles(*MANAGERS))):
    bill = db.execute(text("SELECT * FROM bills WHERE id=:id FOR UPDATE"), {"id": payload.bill_id}).mappings().first()
    if not bill:
        raise HTTPException(404, "Bill not found")
    refunded = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM bill_refunds WHERE bill_id=:id"),
                          {"id": payload.bill_id}).scalar_one()
    refundable = Decimal(str(bill["amount_paid"])) - Decimal(str(refunded))
    if payload.amount > refundable:
        raise HTTPException(409, f"Refund exceeds refundable paid amount ({refundable})")
    row = db.execute(text("""INSERT INTO bill_refunds(bill_id,amount,reason,method,created_by)
        VALUES(:bill,:amount,:reason,:method,:user) RETURNING *"""),
        {"bill": payload.bill_id, "amount": payload.amount, "reason": payload.reason,
         "method": payload.method, "user": user.id}).mappings().first()
    if payload.method == "cash":
        db.execute(text("""CREATE TABLE IF NOT EXISTS cash_refund_links (
            refund_id UUID PRIMARY KEY REFERENCES bill_refunds(id) ON DELETE CASCADE,
            drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
            linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
        )"""))
        open_shift = db.execute(text("SELECT id FROM cash_drawer_shifts WHERE status='open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE")).first()
        if open_shift:
            entry_id = db.execute(text("""INSERT INTO cash_drawer_entries
                (shift_id,entry_type,amount,reference,notes,created_by,created_at)
                VALUES(:shift,'refund',:amount,:reference,:notes,:user,:created_at) RETURNING id"""),
                {"shift": open_shift.id, "amount": payload.amount, "reference": bill["bill_number"],
                 "notes": payload.reason, "user": user.id, "created_at": row["created_at"]}).scalar_one()
            db.execute(text("""INSERT INTO cash_refund_links(refund_id,drawer_entry_id,linked_by)
                VALUES(:refund,:entry,:user)"""), {"refund": row["id"], "entry": entry_id, "user": user.id})
    audit(db, user.id, "bill.refund", f"Bill {bill['bill_number']}: NPR {payload.amount}; {payload.reason}")
    db.commit()
    return dict(row)


@router.get("/suppliers/ledger")
def supplier_ledger(supplier_id: str | None = None, db: Session = Depends(get_db),
                    user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT l.*,s.name supplier_name FROM supplier_ledger l
        JOIN suppliers s ON s.id=l.supplier_id
        WHERE (:supplier IS NULL OR l.supplier_id=:supplier)
        ORDER BY l.created_at DESC LIMIT 1000"""), {"supplier": supplier_id}).mappings().all()
    return [dict(row) for row in rows]


@router.get("/suppliers/balances")
def supplier_balances(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT s.id,s.name,s.phone,
        COALESCE(SUM(CASE WHEN l.entry_type IN ('purchase','adjustment') THEN l.amount
                          WHEN l.entry_type IN ('payment','return') THEN -l.amount ELSE 0 END),0) balance
        FROM suppliers s LEFT JOIN supplier_ledger l ON l.supplier_id=s.id
        WHERE s.is_active=TRUE GROUP BY s.id,s.name,s.phone ORDER BY balance DESC,s.name""")).mappings().all()
    return [dict(row) for row in rows]


@router.post("/suppliers/ledger")
def add_supplier_ledger_entry(payload: SupplierEntry, db: Session = Depends(get_db),
                              user=Depends(require_roles(*MANAGERS))):
    supplier = db.execute(text("SELECT id FROM suppliers WHERE id=:id AND is_active=TRUE"),
                           {"id": payload.supplier_id}).first()
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    row = db.execute(text("""INSERT INTO supplier_ledger(supplier_id,entry_type,amount,reference,notes,created_by)
        VALUES(:supplier,:type,:amount,:reference,:notes,:user) RETURNING *"""),
        {"supplier": payload.supplier_id, "type": payload.entry_type, "amount": payload.amount,
         "reference": payload.reference, "notes": payload.notes, "user": user.id}).mappings().first()
    audit(db, user.id, f"supplier.{payload.entry_type}", f"Supplier {payload.supplier_id}: NPR {payload.amount}")
    db.commit()
    return dict(row)


@router.get("/loyalty/settings")
def get_loyalty_settings(db: Session = Depends(get_db), user=Depends(require_roles(*CASHIERS))):
    row = db.execute(text("SELECT * FROM loyalty_settings WHERE id=1")).mappings().one()
    return dict(row)


@router.put("/loyalty/settings")
def update_loyalty_settings(payload: LoyaltySettings, db: Session = Depends(get_db),
                            user=Depends(require_roles(*MANAGERS))):
    db.execute(text("""UPDATE loyalty_settings SET enabled=:enabled,spend_per_point=:spend,
        point_value=:value WHERE id=1"""),
        {"enabled": payload.enabled, "spend": payload.spend_per_point, "value": payload.point_value})
    audit(db, user.id, "loyalty.settings.update", f"Enabled={payload.enabled}, spend_per_point={payload.spend_per_point}, point_value={payload.point_value}")
    db.commit()
    return {"ok": True}


@router.get("/loyalty/accounts")
def loyalty_accounts(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT a.*,c.name,c.phone FROM loyalty_accounts a
        JOIN customers c ON c.id=a.customer_id ORDER BY a.points_balance DESC LIMIT 500""")).mappings().all()
    return [dict(row) for row in rows]


@router.post("/loyalty/adjust")
def adjust_loyalty(payload: LoyaltyAdjustment, db: Session = Depends(get_db),
                    user=Depends(require_roles(*MANAGERS))):
    account = db.execute(text("""INSERT INTO loyalty_accounts(customer_id) VALUES(:customer)
        ON CONFLICT(customer_id) DO UPDATE SET updated_at=NOW() RETURNING *"""),
        {"customer": payload.customer_id}).mappings().first()
    current = Decimal(str(account["points_balance"]))
    new_balance = current + payload.points
    if new_balance < 0:
        raise HTTPException(409, "Adjustment would make the points balance negative")
    db.execute(text("""UPDATE loyalty_accounts SET points_balance=:balance,
        lifetime_points=lifetime_points+GREATEST(:points,0),updated_at=NOW() WHERE id=:id"""),
        {"balance": new_balance, "points": payload.points, "id": account["id"]})
    db.execute(text("""INSERT INTO loyalty_transactions(customer_id,points,transaction_type,notes,created_by)
        VALUES(:customer,:points,'adjust',:notes,:user)"""),
        {"customer": payload.customer_id, "points": payload.points, "notes": payload.notes, "user": user.id})
    audit(db, user.id, "loyalty.adjust", f"Customer {payload.customer_id}: {payload.points} points")
    db.commit()
    return {"points_balance": str(new_balance)}


@router.get("/loyalty/customers/{customer_id}")
def customer_loyalty(customer_id: str, db: Session = Depends(get_db),
                      user=Depends(require_roles(*CASHIERS))):
    account = db.execute(text("""SELECT a.*,c.name,c.phone FROM loyalty_accounts a
        JOIN customers c ON c.id=a.customer_id WHERE a.customer_id=:id"""), {"id": customer_id}).mappings().first()
    if not account:
        return {"customer_id": customer_id, "points_balance": "0", "lifetime_points": "0", "transactions": []}
    transactions = db.execute(text("""SELECT * FROM loyalty_transactions WHERE customer_id=:id
        ORDER BY created_at DESC LIMIT 100"""), {"id": customer_id}).mappings().all()
    return dict(account) | {"transactions": [dict(row) for row in transactions]}


# Payment reconciliation -----------------------------------------------------
# A dedicated link table gives each original cash payment a durable, unique
# relationship to its drawer entry. It avoids fragile bill-number/amount-only
# matching when a bill has split or repeated payments.
def _ensure_cash_payment_links(db: Session) -> None:
    db.execute(text("""CREATE TABLE IF NOT EXISTS cash_payment_links (
        payment_id UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
        linked_by UUID REFERENCES users(id),
        linked_at TIMESTAMP NOT NULL DEFAULT NOW(),
        source VARCHAR(24) NOT NULL DEFAULT 'automatic'
    )"""))
    db.execute(text("CREATE INDEX IF NOT EXISTS ix_cash_payment_links_drawer_entry ON cash_payment_links(drawer_entry_id)"))
    db.flush()


def _backfill_unambiguous_cash_links(db: Session) -> int:
    # Link legacy drawer rows only when the payment and drawer-entry match is
    # exactly one-to-one. Ambiguous rows remain visible for manual review.
    result = db.execute(text("""WITH candidates AS (
        SELECT p.id payment_id,e.id entry_id,
               COUNT(*) OVER (PARTITION BY p.id) payment_matches,
               COUNT(*) OVER (PARTITION BY e.id) entry_matches
        FROM payments p
        JOIN bills b ON b.id=p.bill_id
        JOIN cash_drawer_entries e
          ON e.reference=b.bill_number AND e.entry_type='sale' AND e.amount=p.amount
        WHERE p.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_payment_links l WHERE l.payment_id=p.id)
          AND NOT EXISTS (SELECT 1 FROM cash_payment_links l WHERE l.drawer_entry_id=e.id)
    )
    INSERT INTO cash_payment_links(payment_id,drawer_entry_id,source)
    SELECT payment_id,entry_id,'legacy_match' FROM candidates
    WHERE payment_matches=1 AND entry_matches=1
    ON CONFLICT DO NOTHING"""))
    return max(result.rowcount or 0, 0)


@router.get("/qr-payments")
def qr_received_payments(start: date | None = None, end: date | None = None,
                         db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if start and end and end < start:
        raise HTTPException(422, "End date must not precede start date")
    rows = db.execute(text("""SELECT p.id payment_id,b.id bill_id,b.bill_number,b.business_date,
        p.created_at,p.amount,p.method,c.name customer_name,u.full_name received_by_name
        FROM payments p JOIN bills b ON b.id=p.bill_id
        LEFT JOIN customers c ON c.id=b.customer_id
        LEFT JOIN users u ON u.id=p.received_by
        WHERE p.method='qr' AND b.sale_status='active'
          AND (:start IS NULL OR p.created_at::date>=:start)
          AND (:end IS NULL OR p.created_at::date<=:end)
        ORDER BY p.created_at DESC LIMIT 2000"""), {"start": start, "end": end}).mappings().all()
    refunds = db.execute(text("""SELECT r.id refund_id,b.bill_number,b.business_date,r.created_at,
        r.amount,r.method,r.reason,u.full_name received_by_name
        FROM bill_refunds r JOIN bills b ON b.id=r.bill_id
        LEFT JOIN users u ON u.id=r.created_by
        WHERE r.method='qr' AND b.sale_status='active'
          AND (:start IS NULL OR r.created_at::date>=:start)
          AND (:end IS NULL OR r.created_at::date<=:end)
        ORDER BY r.created_at DESC LIMIT 1000"""), {"start": start, "end": end}).mappings().all()
    received, payment_count = db.execute(text("""SELECT COALESCE(SUM(p.amount),0),COUNT(*)
        FROM payments p JOIN bills b ON b.id=p.bill_id
        WHERE p.method='qr' AND b.sale_status='active'
          AND (:start IS NULL OR p.created_at::date>=:start)
          AND (:end IS NULL OR p.created_at::date<=:end)"""),
        {"start": start, "end": end}).one()
    refunded = db.execute(text("""SELECT COALESCE(SUM(r.amount),0) FROM bill_refunds r
        JOIN bills b ON b.id=r.bill_id WHERE r.method='qr' AND b.sale_status='active'
          AND (:start IS NULL OR r.created_at::date>=:start)
          AND (:end IS NULL OR r.created_at::date<=:end)"""),
        {"start": start, "end": end}).scalar_one()
    return {"received_total": str(received), "refunded_total": str(refunded),
            "net_qr_received": str(Decimal(str(received))-Decimal(str(refunded))),
            "payment_count": int(payment_count), "payments": [dict(row) for row in rows],
            "refunds": [dict(row) for row in refunds], "list_truncated": len(rows) >= 2000 or len(refunds) >= 1000}


@router.get("/cash-payments/unassigned")
def unassigned_cash_payments(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    _ensure_cash_payment_links(db)
    db.execute(text("""ALTER TABLE balance_transactions
        ADD COLUMN IF NOT EXISTS method VARCHAR(24) NOT NULL DEFAULT 'legacy_unclassified'"""))
    db.execute(text("""CREATE TABLE IF NOT EXISTS cash_repayment_links (
        transaction_id UUID PRIMARY KEY REFERENCES balance_transactions(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    db.execute(text("""CREATE TABLE IF NOT EXISTS cash_refund_links (
        refund_id UUID PRIMARY KEY REFERENCES bill_refunds(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    _backfill_unambiguous_cash_links(db)
    rows = db.execute(text("""SELECT p.id payment_id,'payment' source_type,b.id bill_id,b.bill_number,b.business_date,
        p.created_at,p.amount,c.name customer_name,u.full_name received_by_name,
        (SELECT COUNT(*) FROM cash_drawer_entries e
         WHERE e.entry_type='sale' AND e.reference=b.bill_number AND e.amount=p.amount) matching_drawer_rows
        FROM payments p JOIN bills b ON b.id=p.bill_id
        LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN users u ON u.id=p.received_by
        WHERE p.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_payment_links l WHERE l.payment_id=p.id)
        UNION ALL
        SELECT bt.id payment_id,'repayment' source_type,b.id bill_id,b.bill_number,b.business_date,
        bt.created_at,bt.amount,c.name customer_name,u.full_name received_by_name,
        (SELECT COUNT(*) FROM cash_drawer_entries e
         WHERE e.entry_type='sale' AND e.reference=('Credit repayment ' || b.bill_number) AND e.amount=bt.amount) matching_drawer_rows
        FROM balance_transactions bt JOIN customer_balances cb ON cb.id=bt.customer_balance_id
        JOIN bills b ON b.id=cb.bill_id LEFT JOIN customers c ON c.id=cb.customer_id
        LEFT JOIN users u ON u.id=bt.received_by
        WHERE bt.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_repayment_links l WHERE l.transaction_id=bt.id)
        UNION ALL
        SELECT r.id payment_id,'refund' source_type,b.id bill_id,b.bill_number,b.business_date,
        r.created_at,r.amount,c.name customer_name,u.full_name received_by_name,
        (SELECT COUNT(*) FROM cash_drawer_entries e
         WHERE e.entry_type='refund' AND e.reference=b.bill_number AND e.amount=r.amount) matching_drawer_rows
        FROM bill_refunds r JOIN bills b ON b.id=r.bill_id
        LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN users u ON u.id=r.created_by
        WHERE r.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_refund_links l WHERE l.refund_id=r.id)
        ORDER BY created_at ASC LIMIT 3000""")).mappings().all()
    count, total = db.execute(text("""SELECT COUNT(*),COALESCE(SUM(amount),0) FROM (
        SELECT p.amount FROM payments p JOIN bills b ON b.id=p.bill_id
        WHERE p.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_payment_links l WHERE l.payment_id=p.id)
        UNION ALL
        SELECT bt.amount FROM balance_transactions bt
        JOIN customer_balances cb ON cb.id=bt.customer_balance_id JOIN bills b ON b.id=cb.bill_id
        WHERE bt.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_repayment_links l WHERE l.transaction_id=bt.id)
    ) unassigned""")).one()
    refund_count, refund_total = db.execute(text("""SELECT COUNT(*),COALESCE(SUM(r.amount),0)
        FROM bill_refunds r JOIN bills b ON b.id=r.bill_id
        WHERE r.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_refund_links l WHERE l.refund_id=r.id)""")).one()
    db.commit()
    return {"count": int(count), "total": str(total), "refund_count": int(refund_count),
            "refund_total": str(refund_total), "payments": [dict(row) for row in rows],
            "list_truncated": int(count)+int(refund_count) > len(rows)}


class CashPaymentAssign(BaseModel):
    shift_id: str
    notes: str | None = None


@router.post("/cash-payments/{payment_id}/assign")
def assign_cash_payment(payment_id: str, payload: CashPaymentAssign,
                        db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    _ensure_cash_payment_links(db)
    db.execute(text("""ALTER TABLE balance_transactions
        ADD COLUMN IF NOT EXISTS method VARCHAR(24) NOT NULL DEFAULT 'legacy_unclassified'"""))
    db.execute(text("""CREATE TABLE IF NOT EXISTS cash_repayment_links (
        transaction_id UUID PRIMARY KEY REFERENCES balance_transactions(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    db.execute(text("""CREATE TABLE IF NOT EXISTS cash_refund_links (
        refund_id UUID PRIMARY KEY REFERENCES bill_refunds(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    payment = db.execute(text("""SELECT p.id source_id,p.bill_id,p.method,p.amount,p.created_at,b.bill_number,b.sale_status,
        'payment' source_type,b.bill_number reference,'sale' drawer_type
        FROM payments p JOIN bills b ON b.id=p.bill_id WHERE p.id=:id FOR UPDATE OF p,b"""),
        {"id": payment_id}).mappings().first()
    if payment:
        link_table, source_column = "cash_payment_links", "payment_id"
    else:
        payment = db.execute(text("""SELECT bt.id source_id,cb.bill_id,bt.method,bt.amount,bt.created_at,b.bill_number,b.sale_status,
            'repayment' source_type,('Credit repayment ' || b.bill_number) reference,'sale' drawer_type
            FROM balance_transactions bt JOIN customer_balances cb ON cb.id=bt.customer_balance_id
            JOIN bills b ON b.id=cb.bill_id WHERE bt.id=:id FOR UPDATE OF bt,b"""),
            {"id": payment_id}).mappings().first()
        link_table, source_column = "cash_repayment_links", "transaction_id"
    if not payment:
        payment = db.execute(text("""SELECT r.id source_id,r.bill_id,r.method,r.amount,r.created_at,b.bill_number,b.sale_status,
            'refund' source_type,b.bill_number reference,'refund' drawer_type
            FROM bill_refunds r JOIN bills b ON b.id=r.bill_id WHERE r.id=:id FOR UPDATE OF r,b"""),
            {"id": payment_id}).mappings().first()
        link_table, source_column = "cash_refund_links", "refund_id"
    if not payment:
        raise HTTPException(404, "Cash payment, repayment or refund not found")
    if payment["method"] != "cash" or payment["sale_status"] != "active":
        raise HTTPException(409, "Only active cash receipts or refunds can be assigned")
    if db.execute(text(f"SELECT 1 FROM {link_table} WHERE {source_column}=:id"), {"id": payment_id}).first():
        raise HTTPException(409, "This cash record is already linked to a drawer entry")
    shift = db.execute(text("SELECT id,status,opening_float,counted_cash FROM cash_drawer_shifts WHERE id=:id FOR UPDATE"),
                       {"id": payload.shift_id}).mappings().first()
    if not shift:
        raise HTTPException(404, "Selected cash drawer shift was not found")
    candidates = db.execute(text("""SELECT e.id,e.shift_id FROM cash_drawer_entries e
        WHERE e.entry_type=:entry_type AND e.reference=:reference AND e.amount=:amount
          AND NOT EXISTS (SELECT 1 FROM cash_payment_links l WHERE l.drawer_entry_id=e.id)
          AND NOT EXISTS (SELECT 1 FROM cash_repayment_links l WHERE l.drawer_entry_id=e.id)
          AND NOT EXISTS (SELECT 1 FROM cash_refund_links l WHERE l.drawer_entry_id=e.id)
        ORDER BY e.created_at"""),
        {"entry_type": payment["drawer_type"], "reference": payment["reference"],
         "amount": payment["amount"]}).mappings().all()
    if len(candidates) > 1:
        raise HTTPException(409, "Multiple matching historical drawer rows exist. Resolve the duplicate manually before linking.")
    if candidates:
        entry_id = candidates[0]["id"]
        if str(candidates[0]["shift_id"]) != str(payload.shift_id):
            raise HTTPException(409, "A matching drawer entry already belongs to a different shift. Select that shift to link it.")
    else:
        entry_id = db.execute(text("""INSERT INTO cash_drawer_entries
            (shift_id,entry_type,amount,reference,notes,created_by,created_at)
            VALUES(:shift,:entry_type,:amount,:reference,:notes,:user,:created_at) RETURNING id"""),
            {"shift": payload.shift_id, "entry_type": payment["drawer_type"], "amount": payment["amount"],
             "reference": payment["reference"],
             "notes": payload.notes or ("Historical cash refund assigned" if payment["source_type"] == "refund"
                                        else "Historical cash receipt assigned"),
             "user": user.id, "created_at": payment["created_at"]}).scalar_one()
    if payment["source_type"] == "payment":
        db.execute(text("""INSERT INTO cash_payment_links(payment_id,drawer_entry_id,linked_by,source)
            VALUES(:source,:entry,:user,'manual_assignment')"""),
            {"source": payment_id, "entry": entry_id, "user": user.id})
    elif payment["source_type"] == "repayment":
        db.execute(text("""INSERT INTO cash_repayment_links(transaction_id,drawer_entry_id,linked_by)
            VALUES(:source,:entry,:user)"""),
            {"source": payment_id, "entry": entry_id, "user": user.id})
    else:
        db.execute(text("""INSERT INTO cash_refund_links(refund_id,drawer_entry_id,linked_by)
            VALUES(:source,:entry,:user)"""),
            {"source": payment_id, "entry": entry_id, "user": user.id})
    if shift["status"] == "closed":
        totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries WHERE shift_id=:id GROUP BY entry_type"""),
            {"id": payload.shift_id}).mappings().all()
        values = {row["entry_type"]: Decimal(str(row["amount"])) for row in totals}
        expected = (Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0))
            + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0))
            - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0)))
        difference = Decimal(str(shift["counted_cash"] or 0)) - expected
        db.execute(text("UPDATE cash_drawer_shifts SET expected_cash=:expected,cash_difference=:difference WHERE id=:id"),
                   {"expected": expected, "difference": difference, "id": payload.shift_id})
    audit(db, user.id, "cash_record.assigned",
          f"{payment['source_type']} {payment_id} for {payment['bill_number']} NPR {payment['amount']} linked to shift {payload.shift_id}")
    db.commit()
    return {"ok": True, "payment_id": payment_id, "source_type": payment["source_type"],
            "drawer_entry_id": str(entry_id), "shift_id": payload.shift_id,
            "created_historical_entry": not bool(candidates)}


@router.get("/payment-reconciliation")
def payment_reconciliation(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    _ensure_cash_payment_links(db)
    db.execute(text("""ALTER TABLE balance_transactions
        ADD COLUMN IF NOT EXISTS method VARCHAR(24) NOT NULL DEFAULT 'legacy_unclassified'"""))
    db.execute(text("""CREATE TABLE IF NOT EXISTS cash_repayment_links (
        transaction_id UUID PRIMARY KEY REFERENCES balance_transactions(id) ON DELETE CASCADE,
        drawer_entry_id UUID NOT NULL UNIQUE REFERENCES cash_drawer_entries(id) ON DELETE CASCADE,
        linked_by UUID REFERENCES users(id), linked_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    linked_legacy = _backfill_unambiguous_cash_links(db)
    payment_totals = db.execute(text("""SELECT method,COUNT(*) transactions,COALESCE(SUM(amount),0) amount FROM (
        SELECT p.method,p.amount FROM payments p JOIN bills b ON b.id=p.bill_id WHERE b.sale_status='active'
        UNION ALL
        SELECT bt.method,bt.amount FROM balance_transactions bt
        JOIN customer_balances cb ON cb.id=bt.customer_balance_id
        JOIN bills b ON b.id=cb.bill_id WHERE b.sale_status='active'
    ) tender GROUP BY method ORDER BY method""")).mappings().all()
    missing_cash = db.execute(text("""SELECT COUNT(*),COALESCE(SUM(amount),0) FROM (
        SELECT p.id receipt_id,p.amount FROM payments p JOIN bills b ON b.id=p.bill_id
        WHERE p.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_payment_links l WHERE l.payment_id=p.id)
        UNION ALL
        SELECT bt.id receipt_id,bt.amount FROM balance_transactions bt
        JOIN customer_balances cb ON cb.id=bt.customer_balance_id
        JOIN bills b ON b.id=cb.bill_id
        WHERE bt.method='cash' AND b.sale_status='active'
          AND NOT EXISTS (SELECT 1 FROM cash_repayment_links l WHERE l.transaction_id=bt.id)
    ) unassigned""")).first()
    bill_mismatches = db.execute(text("""SELECT COUNT(*) FROM bills b
        WHERE b.sale_status='active' AND ABS(b.amount_paid -
          (COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.bill_id=b.id),0) +
           COALESCE((SELECT SUM(bt.amount) FROM balance_transactions bt
             JOIN customer_balances cb ON cb.id=bt.customer_balance_id WHERE cb.bill_id=b.id),0))) > 0.01""")).scalar_one()
    credit_mismatches = db.execute(text("""SELECT COUNT(*) FROM customer_balances cb
        JOIN bills b ON b.id=cb.bill_id
        WHERE ABS(cb.remaining_amount - GREATEST(cb.original_amount -
          COALESCE((SELECT SUM(bt.amount) FROM balance_transactions bt WHERE bt.customer_balance_id=cb.id),0),0)) > 0.01
           OR ABS(cb.remaining_amount-b.outstanding_amount)>0.01""")).scalar_one()
    qr_refunds = db.execute(text("SELECT COALESCE(SUM(amount),0) FROM bill_refunds WHERE method='qr'")).scalar_one()
    result = {"legacy_drawer_rows_linked": linked_legacy,
        "payment_methods": [dict(row) for row in payment_totals],
        "unassigned_cash_count": int(missing_cash[0]), "unassigned_cash_total": str(missing_cash[1]),
        "bill_payment_mismatches": int(bill_mismatches), "credit_balance_mismatches": int(credit_mismatches),
        "qr_refunds_total": str(qr_refunds)}
    db.commit()
    return result
