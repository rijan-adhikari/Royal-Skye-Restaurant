from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.deps import get_current_user, require_roles

router = APIRouter(prefix="/api", tags=["menu"])


@router.get("/categories", response_model=list[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.Category).order_by(models.Category.sort_order).all()


@router.post("/categories", response_model=schemas.CategoryOut)
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db),
                    user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager))):
    category = models.Category(name=payload.name.strip(), sort_order=payload.sort_order)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/menu-items", response_model=list[schemas.MenuItemOut])
def list_menu_items(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(models.MenuItem).order_by(models.MenuItem.sort_order).all()


@router.post("/menu-items", response_model=schemas.MenuItemOut)
def create_menu_item(payload: schemas.MenuItemCreate, db: Session = Depends(get_db),
                      user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager))):
    item = models.MenuItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/menu-items/{item_id}", response_model=schemas.MenuItemOut)
def update_menu_item(item_id: str, payload: schemas.MenuItemCreate, db: Session = Depends(get_db),
                      user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager))):
    item = db.query(models.MenuItem).filter(models.MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    for k, v in payload.model_dump().items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/categories/{category_id}")
def delete_category(category_id: str, db: Session = Depends(get_db),
                    user=Depends(require_roles(models.RoleName.admin))):
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    if db.query(models.MenuItem).filter(models.MenuItem.category_id == category_id).first():
        raise HTTPException(409, "This category still contains menu items. Move or remove those items first.")
    db.add(models.AuditLog(user_id=user.id, action="category.deleted", details=f"Deleted category {category.name}"))
    db.delete(category)
    db.commit()
    return {"ok": True}


@router.delete("/menu-items/{item_id}")
def delete_menu_item(item_id: str, db: Session = Depends(get_db),
                     user=Depends(require_roles(models.RoleName.admin, models.RoleName.manager))):
    item = db.query(models.MenuItem).filter(models.MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Menu item not found")
    historical_use = db.query(models.OrderItem).filter(models.OrderItem.menu_item_id == item_id).first()
    if historical_use:
        item.is_available = False
        action = "menu_item.archived"
        result = {"ok": True, "archived": True, "message": "This item has order history, so it was hidden from POS instead of being permanently deleted."}
    else:
        db.delete(item)
        action = "menu_item.deleted"
        result = {"ok": True, "archived": False}
    db.add(models.AuditLog(user_id=user.id, action=action, details=f"Removed menu item {item.name}"))
    db.commit()
    return result


@router.get("/menu-items/export.pdf")
def export_food_menu_pdf(db: Session = Depends(get_db), user=Depends(get_current_user)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    categories = db.query(models.Category).filter(models.Category.is_active.is_(True)).order_by(models.Category.sort_order, models.Category.name).all()
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, title="Royal Skye Food Menu",
        rightMargin=16, leftMargin=16, topMargin=24, bottomMargin=24, author="Royal Skye Restaurant")
    styles = getSampleStyleSheet()
    ink=colors.HexColor("#080A0D"); crimson=colors.HexColor("#C8102E")
    paper=colors.HexColor("#F3F5F7")
    styles.add(ParagraphStyle(name="MenuTitle",parent=styles["Title"],fontName="Helvetica-Bold",
        fontSize=24,leading=28,textColor=colors.white,alignment=1))
    styles.add(ParagraphStyle(name="MenuCategory",parent=styles["Heading2"],fontName="Helvetica-Bold",
        fontSize=13,leading=16,textColor=crimson,spaceBefore=12,spaceAfter=6))
    masthead=Table([[Paragraph("ROYAL SKYE",styles["MenuTitle"])],
        [Paragraph("FOOD MENU  /  CURRENTLY AVAILABLE",ParagraphStyle(name="MenuMeta",parent=styles["Normal"],
            fontSize=8,textColor=colors.HexColor("#C6CDD5"),alignment=1))]],colWidths=[178*mm])
    masthead.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),ink),("BOX",(0,0),(-1,-1),1,crimson),
        ("LINEBELOW",(0,0),(-1,0),2,crimson),("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10)]))
    story = [masthead, Spacer(1, 10)]
    for category in categories:
        items = db.query(models.MenuItem).filter(
            models.MenuItem.category_id == category.id,
            models.MenuItem.is_available.is_(True)
        ).order_by(models.MenuItem.sort_order, models.MenuItem.name).all()
        if not items:
            continue
        story.append(Paragraph(category.name, styles["MenuCategory"]))
        rows = [["Food item", "Description", "Price (NPR)"]] + [
            [item.name, item.description or "", f"{item.price:.2f}"] for item in items
        ]
        table = Table(rows, colWidths=[150, 270, 75], repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ink),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D9DEE5")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, paper]),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        story.extend([table, Spacer(1, 14)])
    if len(story) == 2:
        story.append(Paragraph("No available food items have been added yet.", styles["Normal"]))
    def menu_footer(canvas, doc):
        canvas.saveState()
        width, _ = A4
        canvas.setFillColor(ink); canvas.rect(0,0,width,15,fill=1,stroke=0)
        canvas.setStrokeColor(crimson); canvas.setLineWidth(1.2); canvas.line(16,15,width-16,15)
        canvas.setFont("Helvetica-Bold",7); canvas.setFillColor(colors.white)
        canvas.drawString(16,6,"ROYAL SKYE  /  FOOD MENU")
        canvas.setFillColor(colors.HexColor("#B9C1CB")); canvas.drawRightString(width-16,6,f"PAGE {doc.page}")
        canvas.restoreState()
    document.build(story, onFirstPage=menu_footer, onLaterPages=menu_footer)
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=royal-skye-food-menu.pdf"})
