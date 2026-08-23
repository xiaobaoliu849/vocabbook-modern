import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from contextlib import asynccontextmanager
from sqlalchemy import func, select
from base import engine, Base
from config import settings
from models import User
from routers import app_router

logger = logging.getLogger(__name__)


async def _run_startup_migrations(conn) -> None:
    """Lightweight SQLite migrations for columns/data create_all won't touch."""
    # 1) orders.license_days (added after first release; create_all can't
    #    ALTER an existing table).
    columns = (await conn.execute(text("PRAGMA table_info(orders)"))).fetchall()
    if columns and "license_days" not in {col[1] for col in columns}:
        await conn.execute(text("ALTER TABLE orders ADD COLUMN license_days INTEGER"))
        logger.info("Added orders.license_days column")

    # 2) Normalize legacy mixed-case emails to the storage convention.
    rows = (
        await conn.execute(select(User).where(User.email != func.lower(User.email)))
    ).scalars().all()
    for user in rows:
        target = user.email.strip().lower()
        conflict = (
            await conn.execute(select(User.id).where(User.email == target))
        ).scalar()
        if conflict is not None:
            logger.error(
                "Skipping email normalization for user %s: %s already exists",
                user.id, target,
            )
            continue
        await conn.execute(
            text("UPDATE users SET email = :target WHERE id = :uid"),
            {"target": target, "uid": user.id},
        )
        logger.info("Normalized email case for user %s", user.id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_runtime()
    # Startup: Create tables (Dev only - use Alembic in Prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _run_startup_migrations(conn)
    yield

app = FastAPI(title="VocabBook Cloud API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(app_router)

@app.get("/")
def root():
    return {"status": "Cloud Server Running", "version": "1.0.0"}


@app.get("/health")
async def health():
    database_ok = False
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        database_ok = True
    except Exception:
        database_ok = False

    return {
        "status": "healthy" if database_ok else "degraded",
        "database": database_ok,
        "environment": "production" if settings.is_production else "development",
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
