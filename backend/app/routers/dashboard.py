from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app import models
from app.deps import require_roles

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

BUSINESS_TIMEZONE = ZoneInfo("Asia/Kathmandu")


def _business_window(start_date: date, end_date: date):
    """Convert Nepal-local date boundaries to naive UTC timestamps stored by the app."""
    start = datetime.combine(start_date, time.min, tzinfo=BUSINESS_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime.combine(end_date, time.min, tzinfo=BUSINESS_TIMEZONE).astimezone(timezone.utc).replace(tzinfo=None)
    return start, end


def _net_collection_sales(db: Session, start: datetime, end: datetime):
    value = db.execute(text("""SELECT COALESCE(SUM(x.amount *
        (b.grand_total - b.tax_amount - b.service_charge_amount) / NULLIF(b.grand_total,0)),0)
        FROM (
          SELECT p.bill_id,p.amount FROM payments p WHERE p.created_at >= :start AND p.created_at < :end
          UNION ALL
          SELECT cb.bill_id,bt.amount FROM balance_transactions bt
          JOIN customer_balances cb ON cb.id=bt.customer_balance_id
          WHERE bt.created_at >= :start AND bt.created_at < :end
        ) x JOIN bills b ON b.id=x.bill_id WHERE b.sale_status='active'"""),
        {"start": start, "end": end}).scalar_one()
    return value or 0


def _collection_amounts(db: Session, start: datetime, end: datetime):
    rows = db.execute(text("""SELECT x.bill_id,SUM(x.amount) AS collected_amount
        FROM (
          SELECT p.bill_id,p.amount FROM payments p WHERE p.created_at >= :start AND p.created_at < :end
          UNION ALL
          SELECT cb.bill_id,bt.amount FROM balance_transactions bt
          JOIN customer_balances cb ON cb.id=bt.customer_balance_id
          WHERE bt.created_at >= :start AND bt.created_at < :end
        ) x JOIN bills b ON b.id=x.bill_id WHERE b.sale_status='active'
        GROUP BY x.bill_id ORDER BY MAX(b.created_at) DESC"""),
        {"start": start, "end": end}).mappings().all()
    return {str(row["bill_id"]): row["collected_amount"] for row in rows}


def _sales_details_for_period(db: Session, start: datetime, end: datetime):
    collected = _collection_amounts(db, start, end)
    if not collected:
        return []
    bills = db.query(models.Bill).filter(
        models.Bill.id.in_(list(collected.keys())), models.Bill.sale_status == "active"
    ).order_by(models.Bill.created_at.desc()).all()
    result = []
    for bill in bills:
        order = db.query(models.Order).filter(models.Order.id == bill.order_id).first()
        customer = db.query(models.Customer).filter(models.Customer.id == bill.customer_id).first() if bill.customer_id else None
        service = db.execute(text("SELECT service_type,customer_name,phone FROM order_service_details WHERE order_id=:id"),
                             {"id": bill.order_id}).mappings().first()
        items = db.execute(text("""SELECT mi.name,oi.quantity,oi.unit_price,(oi.quantity * oi.unit_price) total
            FROM order_items oi JOIN menu_items mi ON mi.id=oi.menu_item_id
            WHERE oi.order_id=:order_id AND oi.is_cancelled=FALSE ORDER BY mi.name"""),
            {"order_id": bill.order_id}).mappings().all()
        result.append({
            "id": bill.id, "bill_number": bill.bill_number, "created_at": bill.created_at,
            "customer_name": customer.name if customer else (service["customer_name"] if service else "Walk-in"),
            "customer_phone": customer.phone if customer else (service["phone"] if service else None),
            "service_type": service["service_type"] if service else "dine_in",
            "table_name": service["service_type"].title() if service else (order.table.name if order and order.table else ""),
            "grand_total": str(bill.grand_total), "collected_amount": str(collected[str(bill.id)]),
            "amount_paid": str(bill.amount_paid), "outstanding_amount": str(bill.outstanding_amount),
            "items": [{**dict(item), "unit_price": str(item["unit_price"]), "total": str(item["total"])} for item in items],
        })
    return result



def _sum_amount(db: Session, model, column, start: datetime, end: datetime, date_column=None):
    date_column = date_column or model.created_at
    return db.query(func.coalesce(func.sum(column), 0)).filter(
        date_column >= start, date_column < end
    ).scalar()


@router.get("/summary")
def dashboard_summary(report_date: date | None = None, db: Session = Depends(get_db), user=Depends(require_roles(
    models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier,
))):
    target = report_date or datetime.now(BUSINESS_TIMEZONE).date()
    month_date_start = target.replace(day=1)
    month_date_end = (month_date_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    year_date_start, year_date_end = date(target.year, 1, 1), date(target.year + 1, 1, 1)
    daily_start, daily_end = _business_window(target, target + timedelta(days=1))
    month_start, month_end = _business_window(month_date_start, month_date_end)
    year_start, year_end = _business_window(year_date_start, year_date_end)
    # Sales are recognized when money is received: initial bill payments plus credit repayments.
    # Unpaid credit remains only in Customer Credit until a repayment is recorded.
    def net_sales(start: datetime, end: datetime):
        return _net_collection_sales(db, start, end)

    def estimated_cogs(start: datetime, end: datetime):
        value = db.execute(text("""SELECT COALESCE(SUM(ri.quantity * oi.quantity * i.average_cost /
            NULLIF(r.yield_quantity,0)),0) FROM bills b
            JOIN orders o ON o.id=b.order_id
            JOIN order_items oi ON oi.order_id=o.id AND oi.is_cancelled=FALSE
            JOIN recipes r ON r.menu_item_id=oi.menu_item_id
            JOIN recipe_items ri ON ri.recipe_id=r.id
            JOIN inventory_items i ON i.id=ri.item_id
            WHERE b.business_date >= CAST(:start AS DATE) AND b.business_date < CAST(:end AS DATE)
              AND b.sale_status='active'"""),
            {"start": start.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TIMEZONE).date(),
             "end": end.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TIMEZONE).date()}).scalar_one()
        return value or 0

    daily_sales = net_sales(daily_start, daily_end)
    monthly_sales = net_sales(month_start, month_end)
    yearly_sales = net_sales(year_start, year_end)
    daily_cogs = estimated_cogs(daily_start, daily_end)
    monthly_cogs = estimated_cogs(month_start, month_end)
    yearly_cogs = estimated_cogs(year_start, year_end)
    daily_expenses = _sum_amount(db, models.Expense, models.Expense.amount, daily_start, daily_end, models.Expense.expense_date)
    monthly_expenses = _sum_amount(db, models.Expense, models.Expense.amount, month_start, month_end, models.Expense.expense_date)
    yearly_expenses = _sum_amount(db, models.Expense, models.Expense.amount, year_start, year_end, models.Expense.expense_date)
    def payroll_cost(start: datetime, end: datetime):
        return db.execute(text("""SELECT COALESCE(SUM(gross_pay),0) FROM payroll_entries
            WHERE period_end >= :start_date AND period_end < :end_date"""),
            {"start_date": start.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TIMEZONE).date(),
             "end_date": end.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TIMEZONE).date()}).scalar_one()

    daily_payroll = payroll_cost(daily_start, daily_end)
    monthly_payroll = payroll_cost(month_start, month_end)
    yearly_payroll = payroll_cost(year_start, year_end)
    daily_expenses += daily_payroll
    monthly_expenses += monthly_payroll
    yearly_expenses += yearly_payroll

    total_recorded_expenses = db.query(func.coalesce(func.sum(models.Expense.amount), 0)).scalar() or 0
    total_payroll_expenses = db.execute(text("SELECT COALESCE(SUM(gross_pay),0) FROM payroll_entries")).scalar_one() or 0
    total_expenses = Decimal(str(total_recorded_expenses)) + Decimal(str(total_payroll_expenses))

    outstanding = db.query(func.coalesce(func.sum(models.CustomerBalance.remaining_amount), 0)).filter(
        models.CustomerBalance.remaining_amount > 0
    ).scalar()
    occupied_tables = db.query(models.DiningTable).filter(
        models.DiningTable.status == models.TableStatus.occupied
    ).count()
    return {
        "report_date": target.isoformat(),
        "daily_sales": str(daily_sales), "monthly_sales": str(monthly_sales), "yearly_sales": str(yearly_sales),
        "daily_expenses": str(daily_expenses), "monthly_expenses": str(monthly_expenses), "yearly_expenses": str(yearly_expenses),
        "total_expenses": str(total_expenses),
        "daily_profit": str(daily_sales - daily_cogs - daily_expenses),
        "monthly_profit": str(monthly_sales - monthly_cogs - monthly_expenses) if user.role == models.RoleName.admin else None,
        "yearly_profit": str(yearly_sales - yearly_cogs - yearly_expenses) if user.role == models.RoleName.admin else None,
        "daily_estimated_cogs": str(daily_cogs), "monthly_estimated_cogs": str(monthly_cogs),
        "yearly_estimated_cogs": str(yearly_cogs),
        "daily_payroll_expense": str(daily_payroll), "monthly_payroll_expense": str(monthly_payroll),
        "yearly_payroll_expense": str(yearly_payroll),
        "outstanding": str(outstanding),
        "occupied_tables": occupied_tables,
    }


@router.delete("/sales")
def clear_sales(db: Session = Depends(get_db), user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager))):
    # Delete restrictive FK dependants before bills; otherwise PostgreSQL rejects
    # the bulk bill deletion and the whole transaction rolls back.
    db.query(models.BalanceTransaction).delete(synchronize_session=False)
    db.query(models.CustomerBalance).delete(synchronize_session=False)
    db.query(models.Payment).delete(synchronize_session=False)
    db.execute(text("DELETE FROM bill_refunds"))
    db.execute(text("DELETE FROM loyalty_transactions"))
    db.execute(text("UPDATE loyalty_accounts SET points_balance = 0, lifetime_points = 0, updated_at = NOW()"))
    deleted_bills = db.query(models.Bill).delete(synchronize_session=False)
    db.query(models.KOT).filter(models.KOT.status.notin_([models.KOTStatus.served, models.KOTStatus.cancelled])).update(
        {models.KOT.status: models.KOTStatus.cancelled}, synchronize_session=False
    )
    db.query(models.Order).filter(models.Order.status != models.OrderStatus.cancelled).update(
        {models.Order.status: models.OrderStatus.cancelled}, synchronize_session=False
    )
    db.query(models.DiningTable).update({models.DiningTable.status: models.TableStatus.available}, synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted_bills": deleted_bills}


@router.get("/low-stock")
def dashboard_low_stock(db: Session = Depends(get_db), user=Depends(require_roles(
    models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier,
))):
    rows = db.execute(text("""SELECT id,name,quantity,unit,reorder_level
        FROM inventory_items WHERE is_active=TRUE AND quantity<=reorder_level
        ORDER BY name""")).mappings().all()
    return [dict(row) for row in rows]


@router.get("/daily-sales")
def daily_sales_details(report_date: date | None = None, db: Session = Depends(get_db),
                        user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager))):
    target = report_date or datetime.now(BUSINESS_TIMEZONE).date()
    start, end = _business_window(target, target + timedelta(days=1))
    return _sales_details_for_period(db, start, end)


@router.get("/monthly-sales")
def monthly_sales_details(report_date: date | None = None, db: Session = Depends(get_db),
                          user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier))):
    target = report_date or datetime.utcnow().date()
    month_start = target.replace(day=1)
    month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    start, end = _business_window(month_start, month_end)
    return _sales_details_for_period(db, start, end)


@router.get("/yearly-sales")
def yearly_sales_details(report_date: date | None = None, db: Session = Depends(get_db),
                         user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier))):
    target = report_date or datetime.utcnow().date()
    start, end = _business_window(date(target.year, 1, 1), date(target.year + 1, 1, 1))
    return _sales_details_for_period(db, start, end)


@router.get("/summary.pdf")
def dashboard_summary_pdf(report_date: date | None = None, db: Session = Depends(get_db),
                           user=Depends(require_roles(models.RoleName.admin))):
    from xml.sax.saxutils import escape
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    target = report_date or datetime.utcnow().date()
    year_start, year_end = date(target.year, 1, 1), date(target.year + 1, 1, 1)
    summary = dashboard_summary(target, db, user)
    monthly_rows = []
    for month in range(1, 13):
        start = date(target.year, month, 1)
        end = date(target.year + (month == 12), 1 if month == 12 else month + 1, 1)
        sales_start, sales_end = _business_window(start, end)
        sales = _net_collection_sales(db, sales_start, sales_end)
        expenses = db.query(func.coalesce(func.sum(models.Expense.amount),0)).filter(
            models.Expense.expense_date>=datetime.combine(start,time.min),models.Expense.expense_date<datetime.combine(end,time.min)).scalar() or 0
        payroll = db.execute(text("SELECT COALESCE(SUM(gross_pay),0) FROM payroll_entries WHERE period_end>=:s AND period_end<:e"),
            {"s":start,"e":end}).scalar_one() or 0
        cogs = db.execute(text("""SELECT COALESCE(SUM(ri.quantity*oi.quantity*i.average_cost/NULLIF(r.yield_quantity,0)),0)
            FROM bills b JOIN orders o ON o.id=b.order_id JOIN order_items oi ON oi.order_id=o.id AND oi.is_cancelled=FALSE
            JOIN recipes r ON r.menu_item_id=oi.menu_item_id JOIN recipe_items ri ON ri.recipe_id=r.id
            JOIN inventory_items i ON i.id=ri.item_id WHERE b.business_date>=:s AND b.business_date<:e AND b.sale_status='active'"""),
            {"s":start,"e":end}).scalar_one() or 0
        count=db.query(func.count(models.Bill.id)).filter(models.Bill.business_date>=start,models.Bill.business_date<end,models.Bill.sale_status=="active").scalar() or 0
        monthly_rows.append([start.strftime("%b"),sales,expenses+payroll,cogs,sales-expenses-payroll-cogs,count])
    bills=db.query(models.Bill).filter(models.Bill.business_date>=year_start,models.Bill.business_date<year_end,
        models.Bill.sale_status=="active").order_by(models.Bill.business_date,models.Bill.created_at).all()
    bill_rows=[]
    for bill in bills:
        customer=db.query(models.Customer).filter(models.Customer.id==bill.customer_id).first() if bill.customer_id else None
        bill_rows.append([bill.bill_number,bill.business_date.isoformat(),customer.name if customer else "Walk-in",
            bill.subtotal,bill.discount_amount,bill.tax_amount,bill.service_charge_amount,bill.grand_total,bill.amount_paid,bill.outstanding_amount])
    expenses=db.query(models.Expense).filter(models.Expense.expense_date>=datetime.combine(year_start,time.min),
        models.Expense.expense_date<datetime.combine(year_end,time.min)).order_by(models.Expense.expense_date).all()
    output=BytesIO()
    doc=SimpleDocTemplate(output,pagesize=landscape(A4),rightMargin=13*mm,leftMargin=13*mm,topMargin=20*mm,bottomMargin=18*mm,
        title=f"Royal Skye Management Report {target.year}",author="Royal Skye Restaurant POS")
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name="BrandTitle",parent=styles["Title"],fontSize=23,leading=27,textColor=colors.HexColor("#33241f"),alignment=1,spaceAfter=4))
    styles.add(ParagraphStyle(name="Subtle",parent=styles["Normal"],fontSize=8,textColor=colors.HexColor("#78685e"),alignment=1))
    styles.add(ParagraphStyle(name="Section",parent=styles["Heading2"],fontSize=12,leading=15,textColor=colors.HexColor("#762d2b"),spaceBefore=12,spaceAfter=7))
    styles.add(ParagraphStyle(name="SmallCell",parent=styles["BodyText"],fontSize=7,leading=9))
    def money(v): return "NPR "+format(float(v or 0),",.2f")
    def footer(canvas,document):
        canvas.saveState(); w,h=landscape(A4); canvas.setStrokeColor(colors.HexColor("#d8c7b5"))
        canvas.line(13*mm,13*mm,w-13*mm,13*mm); canvas.setFont("Helvetica",7); canvas.setFillColor(colors.HexColor("#78685e"))
        canvas.drawString(13*mm,8*mm,"ROYAL SKYE  |  CONFIDENTIAL MANAGEMENT REPORT")
        canvas.drawRightString(w-13*mm,8*mm,f"Page {document.page}"); canvas.restoreState()
    story=[Paragraph("ROYAL SKYE",styles["BrandTitle"]),Paragraph("RESTAURANT MANAGEMENT & FINANCIAL REPORT",styles["Subtle"]),
        Paragraph(f"Selected date: {target.isoformat()}  ·  Financial year: {target.year}",styles["Subtle"]),Spacer(1,8*mm),
        Paragraph("Executive overview",styles["Section"])]
    overview=[["PERIOD","NET SALES","EXPENSES + PAYROLL","EST. COGS","EST. PROFIT / LOSS"],
        ["Selected day",money(summary["daily_sales"]),money(summary["daily_expenses"]),money(summary["daily_estimated_cogs"]),money(summary["daily_profit"])],
        ["Selected month",money(summary["monthly_sales"]),money(summary["monthly_expenses"]),money(summary["monthly_estimated_cogs"]),money(summary["monthly_profit"])],
        [str(target.year),money(summary["yearly_sales"]),money(summary["yearly_expenses"]),money(summary["yearly_estimated_cogs"]),money(summary["yearly_profit"])]]
    t=Table(overview,colWidths=[32*mm,43*mm,48*mm,40*mm,48*mm],repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#482c27")),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("BACKGROUND",(0,1),(-1,-1),colors.HexColor("#fbf7f1")),("GRID",(0,0),(-1,-1),.35,colors.HexColor("#e2d7cb")),
        ("FONTSIZE",(0,0),(-1,-1),8),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("ALIGN",(1,1),(-1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),7)]))
    story += [t,Spacer(1,4*mm),Paragraph("Operating indicators",styles["Section"])]
    extra=[["INDICATOR","VALUE"],["Outstanding customer credit",money(summary["outstanding"])],
        ["Occupied tables on selected date",str(summary["occupied_tables"])],["Active bills in financial year",str(len(bills))]]
    et=Table(extra,colWidths=[75*mm,45*mm])
    et.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#8a5b3d")),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("GRID",(0,0),(-1,-1),.35,colors.HexColor("#e2d7cb")),("FONTSIZE",(0,0),(-1,-1),8),("PADDING",(0,0),(-1,-1),6)]))
    story += [et,Paragraph("Monthly performance · full financial year",styles["Section"])]
    mr=[["MONTH","NET SALES","EXPENSES + PAYROLL","EST. COGS","EST. PROFIT / LOSS","BILLS"]]
    mr += [[r[0],money(r[1]),money(r[2]),money(r[3]),money(r[4]),str(r[5])] for r in monthly_rows]
    mt=Table(mr,colWidths=[25*mm,42*mm,48*mm,38*mm,48*mm,18*mm],repeatRows=1)
    mt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#482c27")),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("GRID",(0,0),(-1,-1),.3,colors.HexColor("#e2d7cb")),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#faf6f0")]),
        ("FONTSIZE",(0,0),(-1,-1),7),("ALIGN",(1,1),(-1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),5)]))
    story += [mt,Paragraph("Annual bill register · active bills only",styles["Section"])]
    br=[["BILL","DATE","CUSTOMER","SUBTOTAL","DISCOUNT","TAX","SERVICE","GRAND TOTAL","PAID","DUE"]]
    br += [[str(v) if i<3 else money(v) for i,v in enumerate(row)] for row in bill_rows]
    if len(br)==1: br.append(["—","—","No active bills","","","","","","",""])
    bt=Table(br,colWidths=[24*mm,22*mm,34*mm,27*mm,23*mm,22*mm,23*mm,28*mm,25*mm,23*mm],repeatRows=1)
    bt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#482c27")),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("GRID",(0,0),(-1,-1),.25,colors.HexColor("#e2d7cb")),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#faf6f0")]),
        ("FONTSIZE",(0,0),(-1,-1),6.5),("ALIGN",(3,1),(-1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),4)]))
    story += [bt,Paragraph("Expense register · selected financial year",styles["Section"])]
    er=[["DATE","CATEGORY","DESCRIPTION","AMOUNT"]]
    er += [[e.expense_date.strftime("%Y-%m-%d"),e.category,Paragraph(escape(e.description or ""),styles["SmallCell"]),money(e.amount)] for e in expenses]
    if len(er)==1: er.append(["—","—","No expenses recorded","NPR 0.00"])
    rt=Table(er,colWidths=[30*mm,42*mm,155*mm,34*mm],repeatRows=1)
    rt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#762d2b")),("TEXTCOLOR",(0,0),(-1,0),colors.white),
        ("GRID",(0,0),(-1,-1),.3,colors.HexColor("#e2d7cb")),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#faf6f0")]),
        ("FONTSIZE",(0,0),(-1,-1),7),("ALIGN",(-1,1),(-1,-1),"RIGHT"),("PADDING",(0,0),(-1,-1),5)]))
    story += [rt,Spacer(1,5),Paragraph("Methodology: net sales exclude tax and service-charge collections. Discounts are already reflected in bill totals and are not deducted twice. Estimated profit/loss uses recipe-linked COGS plus recorded operating expenses and payroll. Menu items without complete recipe/cost data may not be fully represented.",styles["Subtle"])]
    doc.build(story,onFirstPage=footer,onLaterPages=footer); output.seek(0)
    return StreamingResponse(output,media_type="application/pdf",headers={"Content-Disposition":f"attachment; filename=royal-skye-management-report-{target.isoformat()}.pdf"})


@router.get("/summary.xlsx")
def dashboard_summary_excel(report_date: date | None = None, db: Session = Depends(get_db),
                             user=Depends(require_roles(models.RoleName.admin))):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
    from openpyxl.utils import get_column_letter
    target=report_date or datetime.utcnow().date()
    year_start,year_end=date(target.year,1,1),date(target.year+1,1,1)
    summary=dashboard_summary(target,db,user)
    wb=Workbook(); overview=wb.active; overview.title="Executive Summary"
    overview.append(["ROYAL SKYE | RESTAURANT MANAGEMENT REPORT"]); overview.append([f"Selected date: {target.isoformat()} | Financial year: {target.year}"]); overview.append([])
    overview.append(["PERIOD","NET SALES (NPR)","EXPENSES + PAYROLL (NPR)","EST. COGS (NPR)","EST. PROFIT / LOSS (NPR)"])
    for label,prefix in [("Selected day","daily"),("Selected month","monthly"),(str(target.year),"yearly")]:
        overview.append([label,float(summary[prefix+"_sales"]),float(summary[prefix+"_expenses"]),float(summary[prefix+"_estimated_cogs"]),float(summary[prefix+"_profit"])])
    overview.append([]); overview.append(["OPERATING INDICATOR","VALUE"])
    overview.append(["Outstanding customer credit (NPR)",float(summary["outstanding"])]); overview.append(["Occupied tables on selected date",summary["occupied_tables"]])
    overview.append(["Methodology","Net sales exclude tax/service charge. Profit is estimated from recipe-linked COGS and recorded expenses + payroll."])
    monthly=wb.create_sheet("Monthly Performance")
    monthly.append(["MONTH","NET SALES (NPR)","EXPENSES + PAYROLL (NPR)","EST. COGS (NPR)","EST. PROFIT / LOSS (NPR)","ACTIVE BILLS"])
    bill_list=db.query(models.Bill).filter(models.Bill.business_date>=year_start,models.Bill.business_date<year_end,models.Bill.sale_status=="active").order_by(models.Bill.business_date).all()
    for month in range(1,13):
        start=date(target.year,month,1); end=date(target.year+(month==12),1 if month==12 else month+1,1)
        sales=db.query(func.coalesce(func.sum(models.Bill.grand_total-models.Bill.tax_amount-models.Bill.service_charge_amount),0)).filter(
            models.Bill.business_date>=start,models.Bill.business_date<end,models.Bill.sale_status=="active").scalar() or 0
        exp=db.query(func.coalesce(func.sum(models.Expense.amount),0)).filter(models.Expense.expense_date>=datetime.combine(start,time.min),
            models.Expense.expense_date<datetime.combine(end,time.min)).scalar() or 0
        payroll=db.execute(text("SELECT COALESCE(SUM(gross_pay),0) FROM payroll_entries WHERE period_end>=:s AND period_end<:e"),{"s":start,"e":end}).scalar_one() or 0
        cogs=db.execute(text("""SELECT COALESCE(SUM(ri.quantity*oi.quantity*i.average_cost/NULLIF(r.yield_quantity,0)),0)
            FROM bills b JOIN orders o ON o.id=b.order_id JOIN order_items oi ON oi.order_id=o.id AND oi.is_cancelled=FALSE
            JOIN recipes r ON r.menu_item_id=oi.menu_item_id JOIN recipe_items ri ON ri.recipe_id=r.id
            JOIN inventory_items i ON i.id=ri.item_id WHERE b.business_date>=:s AND b.business_date<:e AND b.sale_status='active'"""),
            {"s":start,"e":end}).scalar_one() or 0
        monthly.append([start.strftime("%B"),float(sales),float(exp+payroll),float(cogs),float(sales-exp-payroll-cogs),sum(1 for b in bill_list if b.business_date.month==month)])
    bills_ws=wb.create_sheet("Bills"); bills_ws.append(["BILL NUMBER","BUSINESS DATE","CUSTOMER","SUBTOTAL","DISCOUNT","TAX","SERVICE CHARGE","GRAND TOTAL","PAID","OUTSTANDING","STATUS"])
    for b in bill_list:
        customer=db.query(models.Customer).filter(models.Customer.id==b.customer_id).first() if b.customer_id else None
        bills_ws.append([b.bill_number,b.business_date.isoformat(),customer.name if customer else "Walk-in",float(b.subtotal),float(b.discount_amount),
            float(b.tax_amount),float(b.service_charge_amount),float(b.grand_total),float(b.amount_paid),float(b.outstanding_amount),b.sale_status])
    items_ws=wb.create_sheet("Bill Items"); items_ws.append(["BILL NUMBER","DATE","CUSTOMER","ITEM","QUANTITY","UNIT PRICE (NPR)","LINE TOTAL (NPR)"])
    item_rows=db.execute(text("""SELECT b.bill_number,b.business_date,COALESCE(c.name,'Walk-in') customer,mi.name,oi.quantity,oi.unit_price,
        (oi.quantity*oi.unit_price) line_total FROM bills b JOIN orders o ON o.id=b.order_id JOIN order_items oi ON oi.order_id=o.id
        JOIN menu_items mi ON mi.id=oi.menu_item_id LEFT JOIN customers c ON c.id=b.customer_id
        WHERE b.business_date>=:s AND b.business_date<:e AND b.sale_status='active' AND oi.is_cancelled=FALSE
        ORDER BY b.business_date,b.bill_number,mi.name"""),{"s":year_start,"e":year_end}).mappings().all()
    for row in item_rows: items_ws.append([row["bill_number"],row["business_date"].isoformat(),row["customer"],row["name"],row["quantity"],float(row["unit_price"]),float(row["line_total"])])
    exp_ws=wb.create_sheet("Expenses"); exp_ws.append(["DATE","CATEGORY","DESCRIPTION","AMOUNT (NPR)"])
    expense_rows=db.query(models.Expense).filter(models.Expense.expense_date>=datetime.combine(year_start,time.min),
        models.Expense.expense_date<datetime.combine(year_end,time.min)).order_by(models.Expense.expense_date).all()
    for e in expense_rows: exp_ws.append([e.expense_date.isoformat(),e.category,e.description,float(e.amount)])
    pay_ws=wb.create_sheet("Payment Methods"); pay_ws.append(["PAYMENT METHOD","TOTAL COLLECTED (NPR)","TRANSACTIONS"])
    payment_rows=db.query(models.Payment.method,func.sum(models.Payment.amount),func.count(models.Payment.id)).join(
        models.Bill,models.Payment.bill_id==models.Bill.id).filter(models.Bill.business_date>=year_start,models.Bill.business_date<year_end,
        models.Bill.sale_status=="active").group_by(models.Payment.method).all()
    for method,amount,count in payment_rows: pay_ws.append([str(method.value if hasattr(method,"value") else method),float(amount or 0),count])
    title_fill=PatternFill("solid",fgColor="482C27"); pale=PatternFill("solid",fgColor="F7F1E9")
    white=Font(name="Aptos",bold=True,color="FFFFFF",size=10); title=Font(name="Aptos Display",bold=True,color="482C27",size=16)
    thin=Side(style="thin",color="E3D8CC")
    for ws in wb.worksheets:
        ws.sheet_view.showGridLines=False; header=4 if ws.title=="Executive Summary" else 1
        ws.freeze_panes="A5" if ws.title=="Executive Summary" else "A2"
        if ws.title=="Executive Summary":
            ws.merge_cells("A1:E1"); ws["A1"].font=title; ws.row_dimensions[1].height=28
        for cell in ws[header]:
            cell.fill=title_fill; cell.font=white; cell.alignment=Alignment(horizontal="center",vertical="center",wrap_text=True)
        ws.row_dimensions[header].height=32
        for row in ws.iter_rows(min_row=header+1):
            for cell in row:
                cell.border=Border(bottom=thin)
                if cell.row%2==0: cell.fill=pale
                heading=str(ws.cell(header,cell.column).value or "").upper()
                if isinstance(cell.value,(int,float)) and any(k in heading for k in ["NPR","SALES","EXPENSE","COGS","PROFIT","TOTAL","PRICE","PAID","OUTSTANDING"]):
                    cell.number_format='"NPR" #,##0.00;[Red]-"NPR" #,##0.00'
        for col in range(1,ws.max_column+1):
            widths=[len(str(ws.cell(row,col).value or "")) for row in range(1,min(ws.max_row,150)+1)]
            ws.column_dimensions[get_column_letter(col)].width=min(max(14,max(widths,default=10)+2),42)
        if ws.max_row>=header+1: ws.auto_filter.ref=ws.dimensions
    output=BytesIO(); wb.save(output); output.seek(0)
    return StreamingResponse(output,media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":f"attachment; filename=royal-skye-financial-report-{target.isoformat()}.xlsx"})


@router.get("/operations-guide.pdf")
def website_operations_guide(user=Depends(require_roles(models.RoleName.admin,models.RoleName.manager,models.RoleName.cashier,models.RoleName.waiter))):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    output=BytesIO()
    doc=SimpleDocTemplate(output,pagesize=A4,rightMargin=19*mm,leftMargin=19*mm,topMargin=22*mm,bottomMargin=19*mm,
        title="Royal Skye Website Operational Guide",author="Royal Skye Restaurant")
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name="GuideTitle",parent=styles["Title"],fontSize=26,leading=31,textColor=colors.HexColor("#34251f"),alignment=1,spaceAfter=8))
    styles.add(ParagraphStyle(name="GuideSub",parent=styles["Normal"],fontSize=9,textColor=colors.HexColor("#92775e"),alignment=1,leading=14))
    styles.add(ParagraphStyle(name="GuideH",parent=styles["Heading2"],fontSize=13,leading=17,textColor=colors.HexColor("#762d2b"),spaceBefore=12,spaceAfter=5))
    styles.add(ParagraphStyle(name="GuideBody",parent=styles["BodyText"],fontSize=9,leading=14,textColor=colors.HexColor("#443831"),spaceAfter=5))
    styles.add(ParagraphStyle(name="GuideSmall",parent=styles["BodyText"],fontSize=7.5,leading=11,textColor=colors.HexColor("#75675d")))
    def p(value,style="GuideBody"): return Paragraph(value,styles[style])
    story=[Spacer(1,28*mm),p("ROYAL SKYE","GuideTitle"),p("RESTAURANT POS · WEBSITE OPERATIONAL GUIDE","GuideSub"),
        Spacer(1,10*mm),p("A practical handbook for daily restaurant service, management and reporting.","GuideSub"),Spacer(1,20*mm)]
    cover=Table([[p("<b>WHAT THIS GUIDE COVERS</b><br/>Login and role access · Dashboard · Tables and POS · Billing and payments · Menu and customers · Inventory and expenses · Cash drawer · Control Center · Business settings and settings search · Staff and payroll · Reports · Backup and restore")]],colWidths=[165*mm])
    cover.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#F7F1E9")),("BOX",(0,0),(-1,-1),.8,colors.HexColor("#D8C7B5")),("PADDING",(0,0),(-1,-1),14)]))
    story += [cover,Spacer(1,18*mm),p("Prepared for the Royal Skye Restaurant website. Screen names may change as the system is updated; follow the labels shown in your live account.","GuideSmall"),PageBreak()]
    sections=[
    ("1. Sign in and role access",["Sign in with the username and password issued by the administrator. Never share credentials or leave an authenticated terminal unattended.","Access is role-based. Admins have full management access. Managers do not see Staff Accounts or admin-only backup controls. Cashiers and waiters see service functions assigned to their roles.","If access is denied, ask an administrator to confirm that the account is active and the role is correct."]),
    ("2. Dashboard and daily overview",["Dashboard shows sales, expenses, estimated profit/loss, occupied tables and outstanding customer credit for the selected report date.","Change the report date to review another business day. The financial overview compares the selected day, month and year. Click sales metrics to inspect bills where available.","Premium PDF downloads a formatted management report. Excel Workbook downloads separate sheets for summary, monthly performance, bills, bill items, expenses and payment methods. Daily Savings appears at the bottom of the admin dashboard."]),
    ("3. Tables and POS",["Open Tables & POS, select an available table, add menu items and quantities, and save/send the order using the on-screen workflow.","Check table, item names, quantities and notes before confirming. Do not create duplicate orders when the screen is slow; check the table/order before retrying.","When service is complete, open Billing & Orders to settle the bill."]),
    ("4. Billing, discounts and payments",["Open Billing & Orders to review bills, payment status and outstanding balances.","Apply reductions in the Discount field. A discount reduces the bill total and must not be entered as a surcharge.","Cash overpayment/change is supported for cash payments only. QR and other non-cash payments should be recorded for the exact amount received. Use split payments when needed and confirm that payment amounts reconcile with the bill.","For partial or credit payments, verify amount paid and outstanding balance before saving."]),
    ("5. Menu Management",["Open Menu Management. Create categories first, then add dishes with the correct name, price, description and availability.","Mark temporarily unavailable dishes as unavailable rather than deleting them. Use search and category filters to locate menu items.","Review menu prices and availability before service starts."]),
    ("6. Customer Management",["Open Customer Management to review customer records and purchase history.","Use customer and date filters to review visits, ordered items, total spending, payments and outstanding balances. Verify phone numbers when names are similar.","Records linked to bill or credit history may be protected from deletion."]),
    ("7. Inventory and expenses",["Review quantities, units, reorder levels, stock costs and low-stock alerts in Inventory. Record purchases, consumption, wastage, returns and stock adjustments accurately.","Use consistent units and check expiry dates. Do not mix kilograms with pieces or litres with millilitres.","Record operating expenses with an accurate description, amount and date. Supplier information is optional for simple expenses when the form allows it."]),
    ("8. Cash Drawer and Control Center",["Use Cash Drawer to review opening float, cash received, cash paid out and closing reconciliation where enabled. Count physical cash and compare with recorded cash transactions.","Control Center contains administrative controls. Restricted or destructive operations must be handled only by authorized users after checking the action and its impact.","Do not clear records, reset sales or restore a backup during normal service. Create a fresh backup before approved maintenance."]),
    ("9. Staff Accounts, attendance and payroll",["Staff Accounts is admin-only. Admins can create logins, assign roles, enable/disable access, change passwords and remove accounts.","Give each employee a unique login and minimum required role. Hand temporary passwords over privately.","Record payroll periods and partial cash-outs accurately. Verify the remaining salary balance before paying."]),
    ("10. Reports and financial definitions",["Premium PDF includes selected-day, selected-month and selected-year overview, monthly performance for the calendar year, active bill register and expense register.","Excel Workbook includes Executive Summary, Monthly Performance, Bills, Bill Items, Expenses and Payment Methods. Use worksheet filters to analyze the selected financial year.","Net sales exclude tax and service-charge collections. Discounts are already reflected in bill totals. Estimated profit/loss uses recipe-linked COGS plus recorded operating expenses and payroll. It is an estimate; menu items without complete recipes or cost data may not be fully represented."]),
    ("11. Backup and restore",["Control Center → Backup & Restore is admin-only. A full database backup includes restaurant records such as sales, bills, expenses, inventory, customers, staff/payroll, cash drawer, settings and other database data.","Store dated backups securely with restricted access. Keep multiple copies and periodically verify that files can be read.","Restore replaces the live database state. Verify the file and restaurant/database before restoring. Create a fresh backup of the current live database first. Never restore during service or without explicit authorization."]),
    ("12. Settings search (admin only)",["On the Dashboard, administrators can use Search all settings to find a setting by its name or a related keyword.","Search results open the relevant Admin Controls section. Available entries include restaurant profile and contact details, PAN/VAT and currency, receipt footer and branding, payment QR, VAT/tax, service charge, loyalty points, staff accounts and roles, backup/restore, and the audit trail.","If a setting is not listed, use Admin Controls → System & security and check the Business settings section. Search visibility does not grant additional permissions; the server still enforces administrator access."]),
    ("13. Mobile phones and responsive use",["The POS is designed to adapt to compact and large phone screens, including iPhone X-sized layouts, recent iPhones, foldable phone screens and common Samsung Galaxy devices.","On phones, use the navigation menu in the top bar. Swipe horizontally inside wide data tables when needed; the page itself should remain within the screen width.","For iPhone browsers, the interface respects display safe areas around the notch and home indicator. On Android, including Galaxy M51 with Banana OS, use an up-to-date Chrome or Samsung Internet browser and keep the browser zoom at its normal setting for the intended layout.","The layout is intended to cover common CSS widths from 360px through 440px and wider unfolded screens. Actual viewport size can vary with display zoom, browser chrome and orientation; verify the live device after major UI changes."]),
    ("14. Daily checklist and troubleshooting",["Opening: sign in with your own account; review dashboard date; check tables and menu availability; review low stock and expiry dates; confirm cash float.","During service: create one order per table/service; verify items and quantities; settle bills with the correct payment method; record expenses and stock changes promptly.","Closing: reconcile cash and non-cash payments; review unpaid balances; record expenses and payroll cash-outs; check inventory variances; review daily sales and estimated result; create a backup according to the restaurant schedule.","If data does not load, check the network and refresh once. If a payment or order appears stuck, verify whether it was saved before retrying. Report persistent errors with the bill/order reference. Do not repeatedly submit a payment."])]
    for title,items in sections:
        story.append(p(title,"GuideH"))
        for item in items: story.append(p("• "+item))
    story += [Spacer(1,8),p("SECURITY REMINDER: Protect customer information, employee accounts, financial reports and database backups. Use only the access assigned to you.","GuideSmall")]
    def footer(canvas,document):
        canvas.saveState(); w,h=A4; canvas.setStrokeColor(colors.HexColor("#D8C7B5")); canvas.line(19*mm,13*mm,w-19*mm,13*mm)
        canvas.setFont("Helvetica",7); canvas.setFillColor(colors.HexColor("#78685E")); canvas.drawString(19*mm,8*mm,"ROYAL SKYE · WEBSITE OPERATIONAL GUIDE")
        canvas.drawRightString(w-19*mm,8*mm,f"Page {document.page}"); canvas.restoreState()
    doc.build(story,onFirstPage=footer,onLaterPages=footer); output.seek(0)
    return StreamingResponse(output,media_type="application/pdf",headers={"Content-Disposition":"attachment; filename=royal-skye-website-operational-guide.pdf"})
