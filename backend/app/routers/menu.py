from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from decimal import Decimal
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
    import json
    import urllib.parse
    import urllib.request
    from pathlib import Path
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
    from xml.sax.saxutils import escape

    categories = db.query(models.Category).filter(
        models.Category.is_active.is_(True)
    ).order_by(models.Category.sort_order, models.Category.name).all()

    ink = colors.HexColor("#241A17")
    brown = colors.HexColor("#594034")
    crimson = colors.HexColor("#A52A36")
    gold = colors.HexColor("#C6A16A")
    cream = colors.HexColor("#F8F3EB")
    muted = colors.HexColor("#786A60")
    white = colors.white
    output = BytesIO()
    document = SimpleDocTemplate(
        output, pagesize=A4, title="Royal Skye | Food & Beverage Menu",
        rightMargin=15*mm, leftMargin=15*mm, topMargin=17*mm, bottomMargin=19*mm,
        author="Royal Skye Restaurant"
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="RSBrand", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=25, leading=29, textColor=white, alignment=1, spaceAfter=2))
    styles.add(ParagraphStyle(name="RSSub", parent=styles["Normal"], fontName="Helvetica",
        fontSize=8, leading=12, textColor=colors.HexColor("#E8D8C7"), alignment=1))
    styles.add(ParagraphStyle(name="RSCategory", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=15, leading=18, textColor=crimson, spaceBefore=12, spaceAfter=7))
    styles.add(ParagraphStyle(name="RSItem", parent=styles["Heading3"], fontName="Helvetica-Bold",
        fontSize=9.5, leading=12, textColor=ink, spaceAfter=3))
    styles.add(ParagraphStyle(name="RSDescription", parent=styles["BodyText"], fontName="Helvetica",
        fontSize=7.5, leading=10, textColor=muted))
    styles.add(ParagraphStyle(name="RSPrice", parent=styles["Normal"], fontName="Helvetica-Bold",
        fontSize=10, leading=13, textColor=crimson, alignment=2))
    styles.add(ParagraphStyle(name="RSAttribution", parent=styles["Normal"], fontName="Helvetica",
        fontSize=5.2, leading=6, textColor=muted))

    def commons_photo(item_name, category_name):
        query = urllib.parse.quote(f'"{item_name}" food dish')
        api = ("https://commons.wikimedia.org/w/api.php?action=query&generator=search"
               f"&gsrsearch={query}&gsrnamespace=6&gsrlimit=1&prop=imageinfo"
               "&iiprop=url%7Cextmetadata&iiurlwidth=420&format=json")
        try:
            request = urllib.request.Request(api, headers={"User-Agent": "RoyalSkyeMenu/1.0 (restaurant menu artwork)"})
            with urllib.request.urlopen(request, timeout=4) as response:
                data = json.loads(response.read().decode("utf-8"))
            pages = (data.get("query") or {}).get("pages") or {}
            if not pages:
                return None, ""
            info = next(iter(pages.values())).get("imageinfo", [{}])[0]
            image_url = info.get("thumburl") or info.get("url")
            if not image_url:
                return None, ""
            image_request = urllib.request.Request(image_url, headers={"User-Agent": "RoyalSkyeMenu/1.0"})
            with urllib.request.urlopen(image_request, timeout=5) as response:
                image_data = response.read()
            metadata = info.get("extmetadata") or {}
            license_name = (metadata.get("LicenseShortName") or {}).get("value", "Wikimedia Commons")
            artist_html = (metadata.get("Artist") or {}).get("value", "")
            artist_text = __import__("re").sub("<[^>]+>", "", artist_html)
            attribution = f"Photo: {escape(artist_text[:90])} · {escape(license_name[:45])}" if artist_text else f"Photo: Wikimedia Commons · {escape(license_name[:45])}"
            return Image(BytesIO(image_data), width=27*mm, height=23*mm, kind="proportional"), attribution
        except Exception:
            return None, ""

    # Logo is shipped with the web frontend; use it when present and retain a
    # typographic Royal Skye masthead when the backend image is not mounted.
    logo_cell = Paragraph("RS", ParagraphStyle("RSMonogram", fontName="Helvetica-Bold",
        fontSize=20, textColor=gold, alignment=1))
    logo_path = Path(__file__).resolve().parents[3] / "frontend" / "public" / "images" / "logo.jpg"
    if logo_path.exists():
        try:
            logo_cell = Image(str(logo_path), width=23*mm, height=19*mm, kind="proportional")
        except Exception:
            pass
    masthead = Table([[logo_cell, [
        Paragraph("ROYAL SKYE", styles["RSBrand"]),
        Paragraph("RESTAURANT  ·  FOOD &amp; BEVERAGE", styles["RSSub"]),
        Paragraph("A MENU MADE FOR GOOD MOMENTS", ParagraphStyle("RSTag", parent=styles["RSSub"], fontSize=6.5, textColor=gold))
    ]]], colWidths=[31*mm, 149*mm], rowHeights=[29*mm])
    masthead.setStyle(TableStyle([
        ("BACKGROUND", (0,0),(-1,-1), ink), ("BOX",(0,0),(-1,-1),1.2,crimson),
        ("LINEBELOW",(0,0),(-1,-1),2,gold), ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("LEFTPADDING",(0,0),(-1,-1),8), ("RIGHTPADDING",(0,0),(-1,-1),8),
        ("TOPPADDING",(0,0),(-1,-1),5), ("BOTTOMPADDING",(0,0),(-1,-1),5),
    ]))
    story = [masthead, Spacer(1, 5*mm),
        Paragraph("OUR MENU", ParagraphStyle("RSIntro", parent=styles["Heading1"],
            fontName="Helvetica-Bold", fontSize=17, textColor=ink, alignment=1, spaceAfter=2)),
        Paragraph("Freshly prepared favourites · Prices in Nepalese Rupees (NPR)",
            ParagraphStyle("RSIntroSub", parent=styles["Normal"], fontSize=8, textColor=muted, alignment=1, spaceAfter=5*mm))]

    total_items = 0
    for category in categories:
        items = db.query(models.MenuItem).filter(
            models.MenuItem.category_id == category.id,
            models.MenuItem.is_available.is_(True)
        ).order_by(models.MenuItem.sort_order, models.MenuItem.name).all()
        if not items:
            continue
        total_items += len(items)
        story.append(Paragraph(escape(category.name.upper()), styles["RSCategory"]))
        cards = []
        for item in items:
            photo, attribution = commons_photo(item.name, category.name)
            if photo is None:
                photo = Table([[Paragraph("RS", ParagraphStyle("RSFoodFallback", fontName="Helvetica-Bold",
                    fontSize=17, textColor=gold, alignment=1))]], colWidths=[27*mm], rowHeights=[23*mm])
                photo.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),cream),("BOX",(0,0),(-1,-1),0.5,gold),("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
            description = escape((item.description or "Prepared fresh at Royal Skye.").strip())
            details = [
                Paragraph(escape(item.name), styles["RSItem"]),
                Paragraph(description[:220], styles["RSDescription"]),
                Spacer(1, 2),
                Paragraph(f"NPR {Decimal(item.price):,.2f}", styles["RSPrice"]),
            ]
            if attribution:
                details.append(Paragraph(attribution, styles["RSAttribution"]))
            card = Table([[photo, KeepTogether(details)]], colWidths=[31*mm, 56*mm])
            card.setStyle(TableStyle([
                ("BACKGROUND",(0,0),(-1,-1),white),("BOX",(0,0),(-1,-1),0.45,colors.HexColor("#E6DDD2")),
                ("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),5),
                ("RIGHTPADDING",(0,0),(-1,-1),5),("TOPPADDING",(0,0),(-1,-1),6),
                ("BOTTOMPADDING",(0,0),(-1,-1),6),
            ]))
            cards.append(card)
        # Two balanced columns; each cell remains independently flowable.
        rows = []
        for index in range(0, len(cards), 2):
            rows.append([cards[index], cards[index+1] if index+1 < len(cards) else ""])
        grid = Table(rows, colWidths=[90*mm, 90*mm], hAlign="LEFT")
        grid.setStyle(TableStyle([
            ("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),
            ("RIGHTPADDING",(0,0),(-1,-1),3),("TOPPADDING",(0,0),(-1,-1),3),
            ("BOTTOMPADDING",(0,0),(-1,-1),3),
        ]))
        story.extend([grid, Spacer(1, 2*mm)])

    if total_items == 0:
        story.append(Paragraph("Our menu is being refreshed. Please ask our team for today's selection.", styles["RSDescription"]))

    def menu_footer(canvas, doc):
        canvas.saveState()
        width, _ = A4
        canvas.setFillColor(ink); canvas.rect(0,0,width,13*mm,fill=1,stroke=0)
        canvas.setStrokeColor(gold); canvas.setLineWidth(1); canvas.line(15*mm,13*mm,width-15*mm,13*mm)
        canvas.setFont("Helvetica-Bold",7); canvas.setFillColor(white)
        canvas.drawString(15*mm,5*mm,"ROYAL SKYE  ·  GOOD FOOD, GOOD COMPANY")
        canvas.setFillColor(colors.HexColor("#D8C9B9"))
        canvas.drawRightString(width-15*mm,5*mm,f"PAGE {doc.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=menu_footer, onLaterPages=menu_footer)
    output.seek(0)
    return StreamingResponse(output, media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=royal-skye-food-menu.pdf"})
