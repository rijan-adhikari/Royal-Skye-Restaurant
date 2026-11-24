from __future__ import annotations

import csv
import io
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.deps import require_roles

router = APIRouter(prefix="/api/operations", tags=["restaurant operations"])
ADMIN = (models.RoleName.admin,)
MANAGERS = (models.RoleName.admin, models.RoleName.manager)
UNITS = {"kg": ("weight", Decimal("1000")), "g": ("weight", Decimal("1")),
         "litre": ("volume", Decimal("1000")), "ml": ("volume", Decimal("1")),
         "dozen": ("count", Decimal("12")), "pcs": ("count", Decimal("1")),
         "bottle": ("bottle", Decimal("1")), "packet": ("packet", Decimal("1")),
         "box": ("box", Decimal("1")), "case": ("case", Decimal("1"))}


def item_requires_expiry(name: str, category: str) -> bool:
    # Expiry policy is determined strictly by the restaurant's inventory category.
    # Perishable: Kitchen, KITCHEN ITEMS, MEAT. All other current categories are non-expiring.
    return category.strip().casefold() in {"kitchen", "kitchen items", "meat"}


def decimal_value(value: Any, label: str = "value") -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise HTTPException(422, f"Invalid {label}")
    if not result.is_finite():
        raise HTTPException(422, f"Invalid {label}")
    return result


def convert_quantity(quantity: Decimal, source: str, target: str) -> Decimal:
    if source not in UNITS or target not in UNITS:
        raise HTTPException(422, "Unsupported unit")
    if UNITS[source][0] != UNITS[target][0]:
        raise HTTPException(422, f"Cannot convert {source} to {target}")
    return quantity * UNITS[source][1] / UNITS[target][1]


class InventoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sku: str | None = None
    category: str = "General"
    unit: str
    quantity: Decimal = Decimal("0")
    reorder_level: Decimal = Decimal("0")
    average_cost: Decimal = Decimal("0")
    supplier_id: str | None = None
    expiry_date: date | None = None


class InventoryCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class MovementCreate(BaseModel):
    movement_type: str
    quantity: Decimal
    unit_cost: Decimal = Decimal("0")
    expiry_date: date | None = None
    reference: str | None = None
    notes: str | None = None


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    tax_number: str | None = None
    notes: str | None = None


class PurchaseLine(BaseModel):
    item_id: str
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)


class PurchaseCreate(BaseModel):
    supplier_id: str
    items: list[PurchaseLine] = Field(min_length=1)
    notes: str | None = None


class SupplierReturnCreate(BaseModel):
    supplier_id: str
    item_id: str
    quantity: Decimal = Field(gt=0)
    unit_cost: Decimal = Field(ge=0)
    reference: str | None = None
    notes: str | None = None


class RecipeLine(BaseModel):
    item_id: str
    quantity: Decimal = Field(gt=0)


class RecipeUpdate(BaseModel):
    menu_item_id: str
    yield_quantity: Decimal = Field(default=Decimal("1"), gt=0)
    instructions: str | None = None
    items: list[RecipeLine] = Field(min_length=1)


class ExpenseCreate(BaseModel):
    category: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0)
    expense_date: datetime | None = None
    department: str = "General"
    payment_status: str = "paid"
    payment_method: Literal["cash", "qr"] = "cash"
    supplier_id: str | None = None
    receipt_reference: str | None = None
    notes: str | None = None


class AttendanceCreate(BaseModel):
    user_id: str
    notes: str | None = None


class PayrollCreate(BaseModel):
    user_id: str
    period_start: date
    period_end: date
    gross_pay: Decimal = Field(ge=0)
    deductions: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None


class PayrollCashout(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_date: date = Field(default_factory=date.today)
    notes: str | None = None


class ReservationCreate(BaseModel):
    customer_name: str
    phone: str | None = None
    party_size: int = Field(gt=0)
    reserved_for: datetime
    table_id: str | None = None
    notes: str | None = None


@router.get("/units")
def units(user=Depends(require_roles(*MANAGERS))):
    return {"units": list(UNITS), "conversions": ["kg<->g", "litre<->ml", "dozen<->pcs"]}


@router.get("/inventory/categories")
def list_inventory_categories(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    # Ensure a dedicated kitchen category is available for perishable ingredients.
    db.execute(text("INSERT INTO inventory_categories(name) VALUES ('Kitchen') ON CONFLICT (lower(name)) DO NOTHING"))
    # Backfill category names already present on stock records without changing those records.
    db.execute(text("""INSERT INTO inventory_categories(name)
        SELECT DISTINCT COALESCE(NULLIF(BTRIM(category), ''), 'General')
        FROM inventory_items
        ON CONFLICT (lower(name)) DO NOTHING"""))
    db.commit()
    rows = db.execute(text("SELECT id,name,created_at FROM inventory_categories WHERE is_active=TRUE ORDER BY name")).mappings().all()
    return [dict(row) for row in rows]


@router.post("/inventory/categories")
def create_inventory_category(payload: InventoryCategoryCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    name = payload.name.strip()
    if not name:
        raise HTTPException(422, "Category name is required")
    try:
        row = db.execute(text("INSERT INTO inventory_categories(name) VALUES(:name) RETURNING id,name,created_at"), {"name": name}).mappings().first()
        db.commit()
        return dict(row)
    except Exception as exc:
        db.rollback()
        if "unique" in str(exc).lower():
            raise HTTPException(409, "This inventory category already exists")
        raise


@router.delete("/inventory/categories/{category_id}")
def delete_inventory_category(category_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    category = db.execute(text("SELECT * FROM inventory_categories WHERE id=:id AND is_active=TRUE FOR UPDATE"), {"id": category_id}).mappings().first()
    if not category:
        raise HTTPException(404, "Inventory category not found")
    used = db.execute(text("SELECT COUNT(*) FROM inventory_items WHERE is_active=TRUE AND lower(category)=lower(:name)"), {"name": category["name"]}).scalar_one()
    if used:
        raise HTTPException(409, f"Cannot delete {category['name']}: {used} stock item(s) are assigned to it")
    db.execute(text("DELETE FROM inventory_categories WHERE id=:id"), {"id": category_id})
    db.commit()
    return {"ok": True, "deleted_id": category_id}


@router.get("/inventory")
def list_inventory(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT i.*, s.name supplier_name FROM inventory_items i
        LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE i.is_active=TRUE ORDER BY i.name""")).mappings().all()
    return [dict(row) | {"low_stock": row["quantity"] <= row["reorder_level"],
                         "stock_value": str(row["quantity"] * row["average_cost"])} for row in rows]


@router.post("/inventory")
def create_inventory(payload: InventoryCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if payload.unit not in UNITS:
        raise HTTPException(422, "Unsupported unit")
    if payload.quantity < 0 or payload.reorder_level < 0 or payload.average_cost < 0:
        raise HTTPException(422, "Stock, reorder level and cost cannot be negative")
    expiry = payload.expiry_date if item_requires_expiry(payload.name, payload.category) else None
    if item_requires_expiry(payload.name, payload.category) and payload.quantity > 0 and expiry is None:
        raise HTTPException(422, "Expiry date is required for perishable kitchen stock")
    row = db.execute(text("""INSERT INTO inventory_items(name,sku,category,unit,quantity,reorder_level,average_cost,supplier_id,expiry_date)
        VALUES(:name,:sku,:category,:unit,:quantity,:reorder,:cost,:supplier,:expiry) RETURNING *"""),
        {"name": payload.name.strip(), "sku": payload.sku.strip() or None if payload.sku else None, "category": payload.category,
         "unit": payload.unit, "quantity": payload.quantity, "reorder": payload.reorder_level,
         "cost": payload.average_cost, "supplier": payload.supplier_id, "expiry": expiry}).mappings().first()
    if payload.quantity:
        db.execute(text("""INSERT INTO stock_movements(item_id,movement_type,quantity,unit_cost,notes,created_by)
            VALUES(:id,'opening',:qty,:cost,'Opening stock',:user)"""),
            {"id": row["id"], "qty": payload.quantity, "cost": payload.average_cost, "user": user.id})
    db.commit()
    return dict(row)


@router.patch("/inventory/{item_id}")
def update_inventory_item(item_id: str, payload: InventoryCreate, db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    if payload.unit not in UNITS:
        raise HTTPException(422, "Unsupported unit")
    if payload.quantity < 0 or payload.reorder_level < 0 or payload.average_cost < 0:
        raise HTTPException(422, "Stock, reorder level and cost cannot be negative")
    expiry = payload.expiry_date if item_requires_expiry(payload.name, payload.category) else None
    if item_requires_expiry(payload.name, payload.category) and payload.quantity > 0 and expiry is None:
        raise HTTPException(422, "Expiry date is required for perishable kitchen stock")
    item = db.execute(text("SELECT * FROM inventory_items WHERE id=:id AND is_active=TRUE FOR UPDATE"), {"id": item_id}).mappings().first()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    if payload.unit != item["unit"]:
        used = db.execute(text("SELECT COUNT(*) FROM recipe_items WHERE item_id=:id"), {"id": item_id}).scalar_one()
        if used:
            raise HTTPException(409, "Cannot change the unit while this item is used in menu recipes")
    if payload.quantity != Decimal(str(item["quantity"])):
        raise HTTPException(422, "Use a stock adjustment movement to change quantity so the stock ledger stays accurate")
    row = db.execute(text("""UPDATE inventory_items SET name=:name,sku=:sku,category=:category,unit=:unit,
        reorder_level=:reorder,average_cost=:cost,supplier_id=:supplier,expiry_date=:expiry,updated_at=NOW()
        WHERE id=:id RETURNING *"""),
        {"id": item_id, "name": payload.name.strip(), "sku": payload.sku.strip() or None if payload.sku else None,
         "category": payload.category, "unit": payload.unit, "reorder": payload.reorder_level,
         "cost": payload.average_cost, "supplier": payload.supplier_id, "expiry": expiry}).mappings().first()
    db.commit()
    return dict(row)


@router.delete("/inventory/{item_id}")
def delete_inventory_item(item_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    item = db.execute(text("SELECT id,name FROM inventory_items WHERE id=:id AND is_active=TRUE FOR UPDATE"), {"id": item_id}).mappings().first()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    # Archive instead of hard-delete: retain movements, recipe links and bill audit history.
    db.execute(text("UPDATE inventory_items SET is_active=FALSE,updated_at=NOW() WHERE id=:id"), {"id": item_id})
    db.commit()
    return {"ok": True, "archived_id": item_id, "name": item["name"]}


@router.post("/inventory/{item_id}/movements")
def stock_movement(item_id: str, payload: MovementCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if payload.movement_type not in {"purchase", "consumption", "waste", "adjustment", "return"}:
        raise HTTPException(422, "Invalid stock movement type")
    qty = decimal_value(payload.quantity, "quantity")
    if qty < 0 or (qty == 0 and payload.movement_type != "adjustment"):
        raise HTTPException(422, "Quantity must be positive (zero is allowed only for an adjustment)")
    if payload.unit_cost < 0:
        raise HTTPException(422, "Unit cost cannot be negative")
    item = db.execute(text("SELECT * FROM inventory_items WHERE id=:id AND is_active=TRUE FOR UPDATE"), {"id": item_id}).mappings().first()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    delta = -qty if payload.movement_type in {"consumption", "waste"} else qty
    if payload.movement_type == "adjustment":
        delta = qty - Decimal(str(item["quantity"]))
    new_qty = Decimal(str(item["quantity"])) + delta
    if new_qty < 0:
        raise HTTPException(409, "Insufficient stock")
    if payload.movement_type == "purchase":
        if item_requires_expiry(item["name"], item["category"]) and payload.expiry_date is None:
            raise HTTPException(422, "Expiry date is required when receiving perishable kitchen stock")
        old_qty = Decimal(str(item["quantity"]))
        old_value = old_qty * Decimal(str(item["average_cost"]))
        new_average = (old_value + qty * payload.unit_cost) / new_qty if new_qty else payload.unit_cost
        db.execute(text("UPDATE inventory_items SET quantity=:qty,average_cost=:cost,expiry_date=:expiry,updated_at=NOW() WHERE id=:id"),
                   {"qty": new_qty, "cost": new_average, "expiry": payload.expiry_date if item_requires_expiry(item["name"], item["category"]) else None, "id": item_id})
    else:
        db.execute(text("UPDATE inventory_items SET quantity=:qty,updated_at=NOW() WHERE id=:id"), {"qty": new_qty, "id": item_id})
    db.execute(text("""INSERT INTO stock_movements(item_id,movement_type,quantity,unit_cost,reference,notes,created_by)
        VALUES(:id,:type,:qty,:cost,:reference,:notes,:user)"""),
        {"id": item_id, "type": payload.movement_type, "qty": abs(delta), "cost": payload.unit_cost,
         "reference": payload.reference, "notes": payload.notes, "user": user.id})
    db.commit()
    return {"item_id": item_id, "previous_quantity": str(item["quantity"]), "quantity": str(new_qty), "delta": str(delta)}


@router.get("/inventory/{item_id}/movements")
def inventory_history(item_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("SELECT * FROM stock_movements WHERE item_id=:id ORDER BY created_at DESC LIMIT 250"), {"id": item_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("SELECT * FROM suppliers WHERE is_active=TRUE ORDER BY name")).mappings().all()
    return [dict(r) for r in rows]


@router.post("/suppliers")
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    row = db.execute(text("""INSERT INTO suppliers(name,phone,email,address,tax_number,notes)
        VALUES(:name,:phone,:email,:address,:tax,:notes) RETURNING *"""),
        {"name": payload.name.strip(), "phone": payload.phone, "email": payload.email,
         "address": payload.address, "tax": payload.tax_number, "notes": payload.notes}).mappings().first()
    db.commit()
    return dict(row)


@router.post("/purchases")
def create_purchase(payload: PurchaseCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if not db.execute(text("SELECT id FROM suppliers WHERE id=:id AND is_active=TRUE"), {"id": payload.supplier_id}).first():
        raise HTTPException(404, "Supplier not found")
    total = sum((line.quantity * line.unit_cost for line in payload.items), Decimal("0"))
    number = "PO-" + datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    po = db.execute(text("""INSERT INTO purchase_orders(order_number,supplier_id,status,subtotal,notes,created_by)
        VALUES(:number,:supplier,'received',:total,:notes,:user) RETURNING *"""),
        {"number": number, "supplier": payload.supplier_id, "total": total, "notes": payload.notes, "user": user.id}).mappings().first()
    for line in payload.items:
        item = db.execute(text("SELECT * FROM inventory_items WHERE id=:id AND is_active=TRUE FOR UPDATE"), {"id": line.item_id}).mappings().first()
        if not item:
            raise HTTPException(404, f"Inventory item {line.item_id} not found")
        old_qty = Decimal(str(item["quantity"]))
        new_qty = old_qty + line.quantity
        old_value = old_qty * Decimal(str(item["average_cost"]))
        new_average = (old_value + line.quantity * line.unit_cost) / new_qty if new_qty else line.unit_cost
        db.execute(text("UPDATE inventory_items SET quantity=:qty,average_cost=:cost,updated_at=NOW() WHERE id=:id"),
                   {"qty": new_qty, "cost": new_average, "id": line.item_id})
        db.execute(text("""INSERT INTO purchase_order_items(purchase_order_id,item_id,quantity,unit_cost,line_total)
            VALUES(:po,:item,:qty,:cost,:total)"""),
            {"po": po["id"], "item": line.item_id, "qty": line.quantity, "cost": line.unit_cost, "total": line.quantity * line.unit_cost})
        db.execute(text("""INSERT INTO stock_movements(item_id,movement_type,quantity,unit_cost,reference,created_by)
            VALUES(:item,'purchase',:qty,:cost,:ref,:user)"""),
            {"item": line.item_id, "qty": line.quantity, "cost": line.unit_cost, "ref": number, "user": user.id})
    db.execute(text("UPDATE purchase_orders SET received_at=NOW() WHERE id=:id"), {"id": po["id"]})
    db.execute(text("""INSERT INTO supplier_ledger(supplier_id,entry_type,amount,reference,notes,created_by)
        VALUES(:supplier,'purchase',:amount,:reference,:notes,:user)"""),
        {"supplier": payload.supplier_id, "amount": total, "reference": number,
         "notes": "Stock purchase received", "user": user.id})
    db.commit()
    return {"id": po["id"], "order_number": number, "status": "received", "subtotal": str(total)}


@router.post("/supplier-returns")
def create_supplier_return(payload: SupplierReturnCreate, db: Session = Depends(get_db),
                           user=Depends(require_roles(*MANAGERS))):
    supplier = db.execute(text("SELECT id FROM suppliers WHERE id=:id AND is_active=TRUE"),
                           {"id": payload.supplier_id}).first()
    if not supplier:
        raise HTTPException(404, "Supplier not found")
    item = db.execute(text("SELECT * FROM inventory_items WHERE id=:id AND is_active=TRUE FOR UPDATE"),
                      {"id": payload.item_id}).mappings().first()
    if not item:
        raise HTTPException(404, "Inventory item not found")
    current = Decimal(str(item["quantity"]))
    if payload.quantity > current:
        raise HTTPException(409, f"Cannot return {payload.quantity}; only {current} {item['unit']} is in stock")
    new_quantity = current - payload.quantity
    amount = payload.quantity * payload.unit_cost
    db.execute(text("UPDATE inventory_items SET quantity=:quantity,updated_at=NOW() WHERE id=:id"),
               {"quantity": new_quantity, "id": payload.item_id})
    reference = payload.reference or "SUP-RET-" + datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    db.execute(text("""INSERT INTO stock_movements(item_id,movement_type,quantity,unit_cost,reference,notes,created_by)
        VALUES(:item,'supplier_return',:quantity,:cost,:reference,:notes,:user)"""),
        {"item": payload.item_id, "quantity": payload.quantity, "cost": payload.unit_cost,
         "reference": reference, "notes": payload.notes or "Returned stock to supplier", "user": user.id})
    db.execute(text("""INSERT INTO supplier_ledger(supplier_id,entry_type,amount,reference,notes,created_by)
        VALUES(:supplier,'return',:amount,:reference,:notes,:user)"""),
        {"supplier": payload.supplier_id, "amount": amount, "reference": reference,
         "notes": payload.notes or f"Returned {payload.quantity} {item['unit']} of {item['name']}", "user": user.id})
    db.commit()
    return {"reference": reference, "item_id": payload.item_id, "previous_quantity": str(current),
            "quantity": str(new_quantity), "return_amount": str(amount)}


@router.get("/purchases")
def list_purchases(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT p.*,s.name supplier_name FROM purchase_orders p
        JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.ordered_at DESC LIMIT 300""")).mappings().all()
    return [dict(r) for r in rows]


@router.get("/recipes")
def list_recipes(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT r.id,r.menu_item_id,m.name menu_item_name,r.yield_quantity,r.instructions,
        COALESCE(SUM(ri.quantity*i.average_cost),0) recipe_cost,
        COALESCE(json_agg(json_build_object('item_id',i.id,'item_name',i.name,'quantity',ri.quantity,'unit',i.unit,'cost',ri.quantity*i.average_cost))
            FILTER (WHERE ri.id IS NOT NULL),'[]'::json) ingredients
        FROM recipes r JOIN menu_items m ON m.id=r.menu_item_id
        LEFT JOIN recipe_items ri ON ri.recipe_id=r.id LEFT JOIN inventory_items i ON i.id=ri.item_id
        GROUP BY r.id,m.name ORDER BY m.name""")).mappings().all()
    return [dict(r) for r in rows]


@router.post("/recipes")
def save_recipe(payload: RecipeUpdate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if not payload.yield_quantity.is_finite() or payload.yield_quantity <= 0:
        raise HTTPException(422, "Recipe yield must be a positive finite number")
    for line in payload.items:
        if not line.quantity.is_finite() or line.quantity <= 0:
            raise HTTPException(422, "Ingredient quantities must be positive finite numbers")
    if not db.execute(text("SELECT id FROM menu_items WHERE id=:id"), {"id": payload.menu_item_id}).first():
        raise HTTPException(404, "Menu item not found")
    for line in payload.items:
        if not db.execute(text("SELECT id FROM inventory_items WHERE id=:id AND is_active=TRUE"), {"id": line.item_id}).first():
            raise HTTPException(404, "Ingredient not found")
    recipe = db.execute(text("""INSERT INTO recipes(menu_item_id,yield_quantity,instructions)
        VALUES(:menu,:yield,:instructions) ON CONFLICT(menu_item_id) DO UPDATE SET
        yield_quantity=EXCLUDED.yield_quantity,instructions=EXCLUDED.instructions,updated_at=NOW() RETURNING id"""),
        {"menu": payload.menu_item_id, "yield": payload.yield_quantity, "instructions": payload.instructions}).first()
    db.execute(text("DELETE FROM recipe_items WHERE recipe_id=:id"), {"id": recipe.id})
    ingredient_quantities: dict[str, Decimal] = {}
    for line in payload.items:
        ingredient_quantities[line.item_id] = ingredient_quantities.get(line.item_id, Decimal("0")) + line.quantity
    for item_id, quantity in ingredient_quantities.items():
        db.execute(text("INSERT INTO recipe_items(recipe_id,item_id,quantity) VALUES(:recipe,:item,:qty)"),
                   {"recipe": recipe.id, "item": item_id, "qty": quantity})
    db.commit()
    return {"id": recipe.id, "ingredients": len(ingredient_quantities)}


@router.get("/expenses")
def list_detailed_expenses(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("""SELECT e.*,s.name supplier_name FROM expenses e LEFT JOIN suppliers s ON s.id=e.supplier_id
        ORDER BY e.expense_date DESC LIMIT 500""")).mappings().all()
    return [dict(r) for r in rows]


@router.post("/expenses")
def create_detailed_expense(payload: ExpenseCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if payload.payment_status not in {"paid", "unpaid", "partial"}:
        raise HTTPException(422, "Invalid payment status")

    # A paid cash expense is a real drawer outflow; a paid QR expense is a bank-account outflow.
    # Keep the expense and its payment-channel movement in one database transaction.
    expense_id = str(uuid.uuid4())
    if payload.payment_status == "paid" and payload.payment_method == "cash":
        shift = db.execute(text("""SELECT id,opening_float FROM cash_drawer_shifts
            WHERE status='open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE""")).mappings().first()
        if not shift:
            raise HTTPException(409, "Open a cash drawer session before recording a cash-paid expense.")
        totals = db.execute(text("""SELECT entry_type,COALESCE(SUM(amount),0) amount
            FROM cash_drawer_entries e WHERE e.shift_id=:shift
            AND NOT ((e.entry_type='sale' AND EXISTS (
                SELECT 1 FROM bills b WHERE b.bill_number=e.reference
                AND EXISTS (SELECT 1 FROM payments p WHERE p.bill_id=b.id AND p.method='qr' AND p.amount=e.amount)
                AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.bill_id=b.id AND p.method='cash' AND p.amount=e.amount)))
            OR (e.entry_type='refund' AND EXISTS (
                SELECT 1 FROM bills b WHERE b.bill_number=e.reference
                AND EXISTS (SELECT 1 FROM bill_refunds r WHERE r.bill_id=b.id AND r.method='qr' AND r.amount=e.amount)
                AND NOT EXISTS (SELECT 1 FROM bill_refunds r WHERE r.bill_id=b.id AND r.method='cash' AND r.amount=e.amount))))
            GROUP BY entry_type"""), {"shift": shift["id"]}).mappings().all()
        values = {r["entry_type"]: Decimal(str(r["amount"])) for r in totals}
        available = (Decimal(str(shift["opening_float"])) + values.get("sale", Decimal(0))
            + values.get("cash_in", Decimal(0)) - values.get("refund", Decimal(0))
            - values.get("cash_out", Decimal(0)) - values.get("payout", Decimal(0)))
        if payload.amount > available:
            raise HTTPException(422, f"Cash expense exceeds available drawer cash of NPR {available}.")
    elif payload.payment_status == "paid" and payload.payment_method == "qr":
        settings_row = db.execute(text("SELECT opening_balance,opening_balance_at FROM qr_account_settings WHERE id=1 FOR UPDATE")).mappings().first()
        opening = Decimal(str(settings_row["opening_balance"])) if settings_row else Decimal("0")
        since = settings_row["opening_balance_at"] if settings_row else datetime.min
        receipts = Decimal(str(db.execute(text("SELECT COALESCE(SUM(amount),0) FROM payments WHERE method='qr' AND created_at>=:since"), {"since": since}).scalar_one()))
        refunds = Decimal(str(db.execute(text("SELECT COALESCE(SUM(amount),0) FROM bill_refunds WHERE method='qr' AND created_at>=:since"), {"since": since}).scalar_one()))
        qr_expenses = Decimal(str(db.execute(text("""SELECT COALESCE(SUM(amount),0) FROM expenses
            WHERE payment_method='qr' AND payment_status='paid' AND created_at>=:since"""), {"since": since}).scalar_one()))
        available = opening + receipts - refunds - qr_expenses
        if payload.amount > available:
            raise HTTPException(422, f"QR account expense exceeds available recorded balance of NPR {available}.")

    row = db.execute(text("""INSERT INTO expenses(id,category,description,amount,expense_date,created_by,department,
        payment_status,payment_method,supplier_id,receipt_reference,notes,created_at)
        VALUES(:id,:category,:description,:amount,:date,:user,:department,:status,:method,:supplier,:receipt,:notes,NOW()) RETURNING *"""),
        {"id": expense_id, "category": payload.category, "description": payload.description, "amount": payload.amount,
         "date": payload.expense_date or datetime.utcnow(), "user": user.id, "department": payload.department,
         "status": payload.payment_status, "method": payload.payment_method, "supplier": payload.supplier_id,
         "receipt": payload.receipt_reference, "notes": payload.notes}).mappings().first()

    if payload.payment_status == "paid" and payload.payment_method == "cash":
        db.execute(text("""INSERT INTO cash_drawer_entries(shift_id,entry_type,amount,reference,notes,created_by,expense_id)
            VALUES(:shift,'cash_out',:amount,:reference,:notes,:user,:expense)"""), {
                "shift": shift["id"], "amount": payload.amount,
                "reference": payload.receipt_reference or f"Expense: {payload.description[:90]}",
                "notes": payload.notes or f"Expense record {expense_id}",
                "user": user.id, "expense": expense_id})
    db.execute(text("INSERT INTO audit_logs(id,user_id,action,details) VALUES(:id,:user,'expense.created',:details)"), {
        "id": str(uuid.uuid4()), "user": user.id,
        "details": f"Recorded {payload.payment_method} expense {payload.description}: NPR {payload.amount} (status: {payload.payment_status})"
    })
    db.commit()
    return dict(row)


@router.get("/reports/profit-loss")
def profit_loss(start: date = Query(default_factory=lambda: date.today().replace(day=1)),
                end: date = Query(default_factory=date.today), db: Session = Depends(get_db),
                user=Depends(require_roles(*ADMIN))):
    if end < start:
        raise HTTPException(422, "End date must not be before start date")
    sales = db.execute(text("""SELECT COALESCE(SUM(grand_total),0) total,
        COALESCE(SUM(subtotal),0) gross_sales, COALESCE(SUM(discount_amount),0) discounts,
        COALESCE(SUM(tax_amount),0) tax, COALESCE(SUM(service_charge_amount),0) service_charge,
        COUNT(*) bill_count FROM bills WHERE created_at::date BETWEEN :start AND :end"""),
        {"start": start, "end": end}).mappings().one()
    expenses = db.execute(text("""SELECT COALESCE(SUM(amount),0) total,
        COALESCE(json_agg(json_build_object('category',category,'amount',amount,'department',department)),'[]'::json) breakdown
        FROM expenses WHERE expense_date::date BETWEEN :start AND :end"""), {"start": start, "end": end}).mappings().one()
    payroll = db.execute(text("""SELECT COALESCE(SUM(gross_pay),0) FROM payroll_entries
        WHERE period_end BETWEEN :start AND :end"""), {"start": start, "end": end}).scalar_one()
    snapshot_cogs = db.execute(text("""SELECT COALESCE(SUM(s.total_cost),0)
        FROM bill_cost_snapshots s JOIN bills b ON b.id=s.bill_id
        WHERE b.created_at::date BETWEEN :start AND :end"""),
        {"start": start, "end": end}).scalar_one()
    # Older bills created before snapshots existed retain a clearly labelled current-cost estimate.
    legacy_cogs = db.execute(text("""SELECT COALESCE(SUM(ri.quantity * oi.quantity * i.average_cost / r.yield_quantity),0)
        FROM bills b JOIN orders o ON o.id=b.order_id
        JOIN order_items oi ON oi.order_id=o.id AND oi.is_cancelled=FALSE
        JOIN recipes r ON r.menu_item_id=oi.menu_item_id
        JOIN recipe_items ri ON ri.recipe_id=r.id
        JOIN inventory_items i ON i.id=ri.item_id
        WHERE b.created_at::date BETWEEN :start AND :end
          AND NOT EXISTS (SELECT 1 FROM bill_cost_snapshots s WHERE s.bill_id=b.id)"""),
        {"start": start, "end": end}).scalar_one()
    cogs = Decimal(str(snapshot_cogs)) + Decimal(str(legacy_cogs))
    refunds = db.execute(text("""SELECT COALESCE(SUM(r.amount),0) FROM bill_refunds r
        JOIN bills b ON b.id=r.bill_id WHERE b.created_at::date BETWEEN :start AND :end"""),
        {"start": start, "end": end}).scalar_one()
    # Bill grand_total already has discounts deducted and tax/service added.
    # Revenue excludes tax collected; do not subtract the discount a second time.
    net_sales = Decimal(str(sales["gross_sales"])) - Decimal(str(sales["discounts"])) - Decimal(str(refunds))
    gross_profit = net_sales - Decimal(str(cogs))
    payroll_expense = Decimal(str(payroll))
    total_operating_expenses = Decimal(str(expenses["total"])) + payroll_expense
    operating_profit = gross_profit - total_operating_expenses
    return {"period": {"start": start, "end": end}, "bill_count": sales["bill_count"],
        "gross_billed": str(sales["total"]), "gross_sales_before_discount": str(sales["gross_sales"]),
        "discounts": str(sales["discounts"]), "refunds": str(refunds), "tax_collected": str(sales["tax"]),
        "service_charge": str(sales["service_charge"]), "net_sales": str(net_sales),
        "cost_of_goods_sold_estimate": str(cogs), "gross_profit_estimate": str(gross_profit),
        "operating_expenses": str(expenses["total"]), "payroll_expense": str(payroll_expense),
        "total_operating_expenses": str(total_operating_expenses),
        "operating_profit_estimate": str(operating_profit),
        "expense_breakdown": expenses["breakdown"],
        "note": "New bills use ingredient cost snapshots captured at finalization. Older bills without snapshots use current average costs as estimates; this is not an audited financial statement."}


@router.get("/reports/stock")
def stock_report(db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    rows = db.execute(text("""SELECT name,category,unit,quantity,reorder_level,average_cost,
        quantity*average_cost stock_value,(quantity<=reorder_level) low_stock,expiry_date
        FROM inventory_items WHERE is_active=TRUE ORDER BY category,name""")).mappings().all()
    return {"items": [dict(r) for r in rows], "total_stock_value": str(sum((r["stock_value"] for r in rows), Decimal("0"))),
            "low_stock_count": sum(1 for r in rows if r["low_stock"])}


@router.get("/reports/stock.csv")
def stock_csv(db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    rows = db.execute(text("SELECT name,sku,category,unit,quantity,reorder_level,average_cost,quantity*average_cost stock_value FROM inventory_items WHERE is_active=TRUE ORDER BY name")).mappings().all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["name","sku","category","unit","quantity","reorder_level","average_cost","stock_value"])
    writer.writeheader()
    for row in rows:
        writer.writerow({k: str(v) if v is not None else "" for k,v in row.items()})
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=royal-skye-stock-report.csv"})


@router.get("/staff/attendance")
def attendance(db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    rows = db.execute(text("""SELECT a.*,u.full_name,u.username FROM staff_attendance a JOIN users u ON u.id=a.user_id
        ORDER BY a.clock_in DESC LIMIT 300""")).mappings().all()
    return [dict(r) for r in rows]


@router.post("/staff/clock-in")
def clock_in(payload: AttendanceCreate, db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    active = db.execute(text("SELECT id FROM staff_attendance WHERE user_id=:id AND clock_out IS NULL"), {"id": payload.user_id}).first()
    if active:
        raise HTTPException(409, "Staff member already has an open shift")
    row = db.execute(text("INSERT INTO staff_attendance(user_id,notes) VALUES(:id,:notes) RETURNING *"),
                     {"id": payload.user_id, "notes": payload.notes}).mappings().first()
    db.commit()
    return dict(row)


@router.post("/staff/{attendance_id}/clock-out")
def clock_out(attendance_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*ADMIN))):
    row = db.execute(text("UPDATE staff_attendance SET clock_out=NOW() WHERE id=:id AND clock_out IS NULL RETURNING *"),
                     {"id": attendance_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Open attendance record not found")
    db.commit()
    return dict(row)


def _ensure_payroll_payments_table(db: Session):
    db.execute(text("""CREATE TABLE IF NOT EXISTS payroll_payments (
        id BIGSERIAL PRIMARY KEY,
        payroll_id UUID NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        created_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"""))
    db.commit()


@router.get("/staff/payroll/staff")
def list_payroll_staff(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.query(models.User).filter(
        models.User.is_active.is_(True),
        models.User.role.in_([models.RoleName.waiter, models.RoleName.cashier, models.RoleName.kitchen, models.RoleName.bar]),
    ).order_by(models.User.full_name).all()
    return [{"id": row.id, "full_name": row.full_name, "username": row.username, "role": row.role.value} for row in rows]


@router.get("/staff/payroll")
def list_payroll(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    _ensure_payroll_payments_table(db)
    rows = db.execute(text("""SELECT p.*,u.full_name,
        COALESCE(pay.total_paid, CASE WHEN p.paid_at IS NOT NULL THEN p.gross_pay-p.deductions ELSE 0 END) total_paid,
        GREATEST(p.gross_pay-p.deductions-COALESCE(pay.total_paid,
            CASE WHEN p.paid_at IS NOT NULL THEN p.gross_pay-p.deductions ELSE 0 END),0) remaining_balance,
        COALESCE(pay.payments,'[]'::json) payments
        FROM payroll_entries p JOIN users u ON u.id=p.user_id
        LEFT JOIN LATERAL (
            SELECT SUM(amount) total_paid,
                json_agg(json_build_object('id',id,'amount',amount,'payment_date',payment_date,'notes',notes,'created_at',created_at)
                    ORDER BY payment_date DESC, id DESC) payments
            FROM payroll_payments WHERE payroll_id=p.id
        ) pay ON TRUE
        ORDER BY p.period_end DESC LIMIT 300""")).mappings().all()
    return [dict(r) for r in rows]


@router.post("/staff/payroll")
def create_payroll(payload: PayrollCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    if payload.period_end < payload.period_start or payload.deductions > payload.gross_pay:
        raise HTTPException(422, "Invalid payroll period or deductions")
    staff_member = db.query(models.User).filter(
        models.User.id == payload.user_id, models.User.is_active.is_(True),
        models.User.role.in_([models.RoleName.waiter, models.RoleName.cashier, models.RoleName.kitchen, models.RoleName.bar]),
    ).first()
    if not staff_member:
        raise HTTPException(404, "Active staff member not found")
    row = db.execute(text("""INSERT INTO payroll_entries(user_id,period_start,period_end,gross_pay,deductions,notes)
        VALUES(:user,:start,:end,:gross,:deductions,:notes) RETURNING *"""),
        {"user": payload.user_id, "start": payload.period_start, "end": payload.period_end,
         "gross": payload.gross_pay, "deductions": payload.deductions, "notes": payload.notes}).mappings().first()
    db.commit()
    return dict(row)


@router.post("/staff/payroll/{payroll_id}/cashout")
def cashout_payroll(payroll_id: str, payload: PayrollCashout, db: Session = Depends(get_db),
                    user=Depends(require_roles(*MANAGERS))):
    _ensure_payroll_payments_table(db)
    payroll = db.execute(text("SELECT * FROM payroll_entries WHERE id=:id FOR UPDATE"), {"id": payroll_id}).mappings().first()
    if not payroll:
        raise HTTPException(404, "Payroll entry not found")
    net_pay = Decimal(str(payroll["gross_pay"])) - Decimal(str(payroll["deductions"]))
    paid = Decimal(str(db.execute(text("SELECT COALESCE(SUM(amount),0) FROM payroll_payments WHERE payroll_id=:id"), {"id": payroll_id}).scalar_one()))
    if payroll["paid_at"] is not None and paid == 0:
        paid = net_pay
    remaining = max(net_pay-paid, Decimal("0"))
    if payload.amount > remaining:
        raise HTTPException(422, f"Cash-out exceeds remaining salary balance of {remaining}")
    db.execute(text("""INSERT INTO payroll_payments(payroll_id,amount,payment_date,notes,created_by)
        VALUES(:payroll,:amount,:date,:notes,:user)"""),
        {"payroll": payroll_id, "amount": payload.amount, "date": payload.payment_date, "notes": payload.notes, "user": user.id})
    new_total = paid + payload.amount
    if new_total >= net_pay:
        db.execute(text("UPDATE payroll_entries SET paid_at=COALESCE(paid_at,NOW()) WHERE id=:id"), {"id": payroll_id})
    db.commit()
    return {"ok": True, "total_paid": str(new_total), "remaining_balance": str(max(net_pay-new_total, Decimal("0")))}


@router.delete("/staff/payroll/{payroll_id}")
def delete_payroll(payroll_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    _ensure_payroll_payments_table(db)
    exists = db.execute(text("SELECT id FROM payroll_entries WHERE id=:id FOR UPDATE"), {"id": payroll_id}).first()
    if not exists:
        raise HTTPException(404, "Payroll entry not found")
    payments = db.execute(text("SELECT COUNT(*) FROM payroll_payments WHERE payroll_id=:id"), {"id": payroll_id}).scalar_one()
    if payments:
        raise HTTPException(409, "This payroll has salary cash-outs. Delete is blocked to preserve payment history.")
    db.execute(text("DELETE FROM payroll_entries WHERE id=:id"), {"id": payroll_id})
    db.commit()
    return {"ok": True, "deleted_id": payroll_id}


@router.post("/staff/payroll/{payroll_id}/pay")
def mark_payroll_paid(payroll_id: str, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    _ensure_payroll_payments_table(db)
    payroll = db.execute(text("SELECT * FROM payroll_entries WHERE id=:id FOR UPDATE"), {"id": payroll_id}).mappings().first()
    if not payroll:
        raise HTTPException(404, "Payroll entry not found")
    net_pay = Decimal(str(payroll["gross_pay"])) - Decimal(str(payroll["deductions"]))
    paid = Decimal(str(db.execute(text("SELECT COALESCE(SUM(amount),0) FROM payroll_payments WHERE payroll_id=:id"), {"id": payroll_id}).scalar_one()))
    if payroll["paid_at"] is not None or paid >= net_pay:
        raise HTTPException(409, "Payroll is already fully paid")
    remaining = net_pay-paid
    db.execute(text("""INSERT INTO payroll_payments(payroll_id,amount,payment_date,notes,created_by)
        VALUES(:payroll,:amount,CURRENT_DATE,'Full remaining salary payment',:user)"""),
        {"payroll": payroll_id, "amount": remaining, "user": user.id})
    db.execute(text("UPDATE payroll_entries SET paid_at=NOW() WHERE id=:id"), {"id": payroll_id})
    db.commit()
    return {"ok": True, "total_paid": str(net_pay), "remaining_balance": "0"}


@router.post("/reservations")
def create_reservation(payload: ReservationCreate, db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    reserved_for = payload.reserved_for
    if reserved_for.tzinfo is not None:
        from datetime import timezone
        reserved_for = reserved_for.astimezone(timezone.utc).replace(tzinfo=None)
    if reserved_for < datetime.utcnow():
        raise HTTPException(422, "Reservation must be in the future")
    if payload.table_id and not db.execute(text("SELECT id FROM tables WHERE id=:id AND is_active=TRUE"), {"id": payload.table_id}).first():
        raise HTTPException(404, "Selected table not found")
    row = db.execute(text("""INSERT INTO reservations(customer_name,phone,party_size,reserved_for,table_id,notes)
        VALUES(:name,:phone,:size,:date,:table,:notes) RETURNING *"""),
        {"name": payload.customer_name, "phone": payload.phone, "size": payload.party_size,
         "date": reserved_for, "table": payload.table_id, "notes": payload.notes}).mappings().first()
    db.commit()
    return dict(row)


@router.get("/reservations")
def list_reservations(db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    rows = db.execute(text("SELECT * FROM reservations ORDER BY reserved_for DESC LIMIT 300")).mappings().all()
    return [dict(r) for r in rows]


@router.patch("/reservations/{reservation_id}/status")
def update_reservation(reservation_id: str, status: str = Query(pattern="^(booked|seated|cancelled|completed)$"),
                       db: Session = Depends(get_db), user=Depends(require_roles(*MANAGERS))):
    row = db.execute(text("UPDATE reservations SET status=:status WHERE id=:id RETURNING *"),
                     {"status": status, "id": reservation_id}).mappings().first()
    if not row:
        raise HTTPException(404, "Reservation not found")
    db.commit()
    return dict(row)
