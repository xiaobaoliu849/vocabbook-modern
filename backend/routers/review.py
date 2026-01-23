"""
Review API Router
复习相关操作
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


class ReviewSubmit(BaseModel):
    """提交复习结果"""
    word: str
    quality: int  # 0-5 SM-2 rating
    time_spent: float = 0  # 花费时间（秒）


class ReviewSession(BaseModel):
    """复习会话"""
    duration: int  # 总时长（秒）
    review_count: int  # 复习单词数


def get_db():
    from main import get_db as main_get_db
    return main_get_db()


@router.get("/due")
async def get_due_words(limit: int = Query(20, ge=1, le=100)):
    """获取待复习的单词"""
    db = get_db()
    now = datetime.now().timestamp()
    
    # Get words that are due for review
    words, total = db.search_words(
        status_filter="review",
        sort_by="next_review_time",
        sort_order="ASC",
        limit=limit,
        offset=0
    )
    
    # Filter words that are actually due
    due_words = [w for w in words if w.get("next_review_time", 0) <= now and not w.get("mastered", False)]
    
    return {
        "words": due_words,
        "count": len(due_words),
        "total_due": total
    }


@router.get("/new")
async def get_new_words(limit: int = Query(10, ge=1, le=50)):
    """获取新单词（未开始复习的）"""
    db = get_db()
    
    words, total = db.search_words(
        status_filter="new",
        sort_by="date",
        sort_order="DESC",
        limit=limit,
        offset=0
    )
    
    return {
        "words": words,
        "count": len(words),
        "total_new": total
    }


@router.post("/submit")
async def submit_review(review: ReviewSubmit):
    """提交单词复习结果（SM-2 算法）"""
    db = get_db()
    
    word_data = db.get_word(review.word)
    if not word_data:
        raise HTTPException(status_code=404, detail=f"Word '{review.word}' not found")
    
    # Import review service
    from services.review_service import ReviewService
    
    # Calculate SM-2
    easiness, interval, repetitions = ReviewService.calculate_sm2(review.quality, word_data)
    next_time = ReviewService.calculate_next_review_time(interval)
    
    # Update database
    db.update_sm2_status(
        word=review.word,
        easiness=easiness,
        interval=interval,
        repetitions=repetitions,
        next_time=next_time,
        rating=review.quality
    )
    
    return {
        "message": "Review submitted",
        "word": review.word,
        "quality": review.quality,
        "next_review": datetime.fromtimestamp(next_time).strftime('%Y-%m-%d %H:%M'),
        "interval_days": interval,
        "easiness": round(easiness, 2)
    }


@router.post("/session")
async def log_session(session: ReviewSession):
    """记录复习会话"""
    db = get_db()
    db.log_study_session(session.duration, session.review_count)
    
    return {
        "message": "Session logged",
        "duration": session.duration,
        "review_count": session.review_count
    }


@router.get("/heatmap")
async def get_heatmap_data():
    """获取复习热力图数据"""
    db = get_db()
    data = db.get_review_heatmap_data()
    return {"heatmap": data}


@router.get("/history/{word}")
async def get_word_history(word: str):
    """获取单词复习历史"""
    db = get_db()
    
    word_data = db.get_word(word)
    if not word_data:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found")
    
    history = db.get_word_review_history(word_data.get("id"))
    return {
        "word": word,
        "history": history
    }
