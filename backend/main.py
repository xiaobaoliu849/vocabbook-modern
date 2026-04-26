"""
VocabBook Modern - FastAPI Backend
智能生词本现代化后端 API
"""
import os
import sys
from contextlib import asynccontextmanager
from time import perf_counter
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import StreamingResponse

# Add parent dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from routers import words, review, dictionary, stats, ai, tts, import_words
from models.database import DatabaseManager
from services.request_metrics import (
    classify_request_bucket,
    request_metrics,
    resolve_route_label,
)
from services.blocking_io import shutdown_blocking_executors

# Global database instance
db: DatabaseManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    global db
    # Startup
    data_dir = os.environ.get("VOCABBOOK_DATA_DIR", os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.environ.get("VOCABBOOK_DB_PATH", os.path.join(data_dir, "vocab.db"))
    db = DatabaseManager(db_path=db_path)
    # Release the startup thread's connection so runtime DB work can be centralized.
    db.close_connection()
    print(f"[VocabBook] API started with database: {db_path}")
    yield
    # Shutdown
    if db:
        db.close_connection()
    shutdown_blocking_executors()
    print("[VocabBook] API shutdown")


app = FastAPI(
    title="VocabBook Modern API",
    description="智能生词本现代化后端 API - 支持 AI 增强学习",
    version="2.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def record_request_metrics(request: Request, call_next):
    started_at = perf_counter()
    finalized = False

    def finalize(status_code: int) -> float:
        nonlocal finalized
        if finalized:
            return 0.0
        finalized = True
        duration_ms = (perf_counter() - started_at) * 1000.0
        request_metrics.record(
            bucket=classify_request_bucket(request.url.path),
            route=resolve_route_label(request.scope, request.url.path),
            method=request.method,
            duration_ms=duration_ms,
            status_code=status_code,
        )
        return duration_ms

    try:
        response = await call_next(request)
    except Exception:
        finalize(500)
        raise

    request_bucket = classify_request_bucket(request.url.path)
    response.headers["X-Request-Bucket"] = request_bucket

    if isinstance(response, StreamingResponse):
        original_iterator = response.body_iterator

        async def instrumented_iterator():
            try:
                async for chunk in original_iterator:
                    yield chunk
            finally:
                finalize(response.status_code)

        response.body_iterator = instrumented_iterator()
        return response

    duration_ms = finalize(response.status_code)
    response.headers["X-Request-Duration-Ms"] = f"{duration_ms:.2f}"
    response.headers["Server-Timing"] = f"app;dur={duration_ms:.2f}"
    return response

# Routers
app.include_router(words.router, prefix="/api/words", tags=["Words"])
app.include_router(review.router, prefix="/api/review", tags=["Review"])
app.include_router(dictionary.router, prefix="/api/dict", tags=["Dictionary"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])
app.include_router(tts.router, prefix="/api/tts", tags=["TTS"])
app.include_router(import_words.router, prefix="/api/import", tags=["Import"])


@app.get("/")
async def root():
    return {
        "name": "VocabBook Modern API",
        "version": "2.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "database": db is not None}


def get_db() -> DatabaseManager:
    """Get database instance for dependency injection"""
    return db


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000)
