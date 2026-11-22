from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, SessionLocal
from app import models
from app.security import hash_password
from app.routers import auth, floors, menu, orders, billing, customers, credit, dashboard, expenses, settings as settings_router, operations, admin_control, users

app = FastAPI(title="Royal Skye Birds POS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(floors.router)
app.include_router(menu.router)
app.include_router(orders.router)
app.include_router(billing.router)
app.include_router(customers.router)
app.include_router(credit.router)
app.include_router(dashboard.router)
app.include_router(expenses.router)
app.include_router(settings_router.router)
app.include_router(operations.router)
app.include_router(admin_control.router)


@app.on_event("startup")
def on_startup():
    # Create core ORM tables, then apply versioned operational/admin migrations.
    Base.metadata.create_all(bind=engine)
    backend_dir = Path(__file__).resolve().parents[1]
    migration_config = Config(str(backend_dir / "alembic.ini"))
    migration_config.set_main_option("script_location", str(backend_dir / "alembic"))
    migration_config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("%", "%%"))
    command.upgrade(migration_config, "head")

    # Keep all existing dining tables, including G8, and add the two staff tables.
    db = SessionLocal()
    try:
        ground_floor = db.query(models.Floor).filter(
            models.Floor.name.ilike("Ground Floor"), models.Floor.is_active.is_(True)
        ).first()
        if ground_floor:
            dining_tables = db.query(models.DiningTable).filter(
                models.DiningTable.floor_id == ground_floor.id
            ).all()
            existing_names = set()
            for dining_table in dining_tables:
                normalized_name = dining_table.name.strip().casefold()
                existing_names.add(normalized_name)
                if normalized_name in {"g8", "g8 table"}:
                    dining_table.is_active = True

            next_order = max((table.sort_order or 0 for table in dining_tables), default=0) + 1
            for table_name in ("Staff Table 1", "Staff Table 2"):
                if table_name.casefold() not in existing_names:
                    db.add(models.DiningTable(
                        floor_id=ground_floor.id,
                        name=table_name,
                        capacity=4,
                        sort_order=next_order,
                        is_active=True,
                    ))
                    next_order += 1
            db.commit()
    finally:
        db.close()

    # Bootstrap exactly one administrator only on a genuinely empty database.
    # The password is supplied through a Render secret; the administrator can rotate it after signing in.
    if settings.INITIAL_ADMIN_PASSWORD:
        db = SessionLocal()
        try:
            if db.query(models.User).count() == 0:
                db.add(models.User(
                    username=settings.INITIAL_ADMIN_USERNAME,
                    full_name=settings.INITIAL_ADMIN_FULL_NAME,
                    password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                    role=models.RoleName.admin,
                    is_active=True,
                    must_change_password=False,
                ))
                db.commit()
        finally:
            db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}
