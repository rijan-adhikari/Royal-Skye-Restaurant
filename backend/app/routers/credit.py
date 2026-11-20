from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.deps import require_roles

router = APIRouter(prefix="/api/credit", tags=["credit"])


@router.get("")
def list_credit(search: str = "", db: Session = Depends(get_db),
                user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier))):
    customers = db.query(models.Customer).order_by(models.Customer.name).all()
    normalized = search.strip().lower()
    result = []
    for customer in customers:
        if normalized and normalized not in customer.name.lower() and normalized not in (customer.phone or "").lower():
            continue
        balances = db.query(models.CustomerBalance).filter(
            models.CustomerBalance.customer_id == customer.id,
            models.CustomerBalance.remaining_amount > 0,
        ).all()
        balance_rows = []
        for balance in balances:
            bill = db.query(models.Bill).filter(models.Bill.id == balance.bill_id).first()
            order = db.query(models.Order).filter(models.Order.id == bill.order_id).first() if bill else None
            items = db.execute(text("""SELECT mi.name,oi.quantity,oi.unit_price,
                (oi.quantity*oi.unit_price) AS line_total
                FROM order_items oi JOIN menu_items mi ON mi.id=oi.menu_item_id
                WHERE oi.order_id=:order_id AND oi.is_cancelled=FALSE
                ORDER BY mi.name"""), {"order_id": bill.order_id}).mappings().all() if bill else []
            service = db.execute(text("SELECT service_type,customer_name FROM order_service_details WHERE order_id=:id"),
                                 {"id": bill.order_id}).mappings().first() if bill else None
            balance_rows.append({
                "id": balance.id,
                "bill_id": balance.bill_id,
                "bill_number": bill.bill_number if bill else balance.bill_id,
                "business_date": bill.business_date if bill else None,
                "service_type": service["service_type"] if service else "dine_in",
                "table_name": order.table.name if order and order.table else "",
                "original_amount": str(balance.original_amount),
                "remaining_amount": str(balance.remaining_amount),
                "created_at": balance.created_at,
                "items": [{"name": item["name"], "quantity": item["quantity"],
                           "unit_price": str(item["unit_price"]), "line_total": str(item["line_total"])}
                          for item in items],
            })
        result.append({
            "customer_id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "total_due": str(sum((balance.remaining_amount for balance in balances), Decimal("0"))),
            "balances": balance_rows,
        })
    return result


@router.get("/{customer_id}")
def credit_details(customer_id: str, db: Session = Depends(get_db),
                   user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager, models.RoleName.cashier))):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    balances = db.query(models.CustomerBalance).filter(
        models.CustomerBalance.customer_id == customer_id,
        models.CustomerBalance.remaining_amount > 0,
    ).all()
    return {
        "customer_id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "total_due": str(sum((balance.remaining_amount for balance in balances), Decimal("0"))),
        "balances": [{
            "id": balance.id,
            "bill_id": balance.bill_id,
            "original_amount": str(balance.original_amount),
            "remaining_amount": str(balance.remaining_amount),
            "created_at": balance.created_at,
        } for balance in balances],
    }
