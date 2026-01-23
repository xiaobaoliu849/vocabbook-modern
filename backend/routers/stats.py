"""
Statistics API Router
统计数据
"""
from fastapi import APIRouter

router = APIRouter()


def get_db():
    from main import get_db as main_get_db
    return main_get_db()


@router.get("")
async def get_statistics():
    """获取学习统计信息"""
    db = get_db()
    stats = db.get_statistics()
    
    return {
        "total_words": stats.get("total", 0),
        "mastered": stats.get("mastered", 0),
        "learning": stats.get("learning", 0),
        "new": stats.get("new", 0),
        "due_today": stats.get("due_today", 0),
        "reviewed_today": stats.get("reviewed_today", 0),
        "streak_days": stats.get("streak_days", 0),
    }


@router.get("/study-time")
async def get_study_time():
    """获取学习时长统计"""
    db = get_db()
    total_seconds = db.get_total_study_time()
    
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    
    return {
        "total_seconds": total_seconds,
        "total_hours": round(total_seconds / 3600, 1),
        "formatted": f"{hours}小时{minutes}分钟"
    }


@router.get("/progress")
async def get_progress():
    """获取学习进度"""
    db = get_db()
    stats = db.get_statistics()
    
    total = stats.get("total", 0)
    mastered = stats.get("mastered", 0)
    
    progress = (mastered / total * 100) if total > 0 else 0
    
    return {
        "total": total,
        "mastered": mastered,
        "progress_percent": round(progress, 1),
        "remaining": total - mastered
    }


@router.get("/heatmap")
async def get_heatmap():
    """获取复习热力图数据"""
    db = get_db()
    data = db.get_review_heatmap_data()
    return {"heatmap": data}


@router.get("/words-count")
async def get_words_count():
    """获取单词总数"""
    db = get_db()
    count = db.get_words_count()
    return {"count": count}
