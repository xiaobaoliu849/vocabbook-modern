"""
VocabBook Modern - FastAPI Backend
智能生词本现代化后端 API
"""
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add parent dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from routers import words, review, dictionary, stats, ai, tts
from models.database import DatabaseManager

# Global database instance
db: DatabaseManager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management"""
    global db
    # Startup
    db_path = os.environ.get("VOCABBOOK_DB_PATH", "vocab.db")
    db = DatabaseManager(db_path=db_path)
    print(f"[VocabBook] API started with database: {db_path}")
    yield
    # Shutdown
    if db:
        db.close_connection()
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

# Routers
app.include_router(words.router, prefix="/api/words", tags=["Words"])
app.include_router(review.router, prefix="/api/review", tags=["Review"])
app.include_router(dictionary.router, prefix="/api/dict", tags=["Dictionary"])
app.include_router(stats.router, prefix="/api/stats", tags=["Statistics"])
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])
app.include_router(tts.router, prefix="/api/tts", tags=["TTS"])


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
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
