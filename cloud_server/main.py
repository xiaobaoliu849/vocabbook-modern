import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from contextlib import asynccontextmanager
from base import engine, Base
from config import settings
from routers import app_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_runtime()
    # Startup: Create tables (Dev only - use Alembic in Prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
