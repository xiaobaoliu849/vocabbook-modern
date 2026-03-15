"""
Review API Router
复习相关操作
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field
from datetime import datetime
import time
import sqlite3 # Import at top level
import base64
import hashlib
import json
import re

from services.multi_dict_service import clean_chinese_text

router = APIRouter()


class ReviewSubmit(BaseModel):
    """提交复习结果"""
    word: str
    quality: int = Field(..., ge=1, le=5)  # 1-5 SM-2 rating
    time_spent: float = 0  # 花费时间（秒）


class ReviewSession(BaseModel):
    """复习会话"""
    duration: int  # 总时长（秒）
    review_count: int  # 复习单词数


def get_db():
    from main import get_db as main_get_db
    return main_get_db()


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        return token or None
    return None


def _can_use_evermem(authorization: Optional[str]) -> bool:
    """Long-term memory writes require authenticated requests."""
    return _extract_bearer_token(authorization) is not None


def _normalize_scope_value(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return normalized or "guest"


def _extract_sub_from_jwt(token: str) -> Optional[str]:
    try:
        payload_part = token.split(".")[1]
        padded = payload_part + ("=" * (-len(payload_part) % 4))
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8"))
        sub = payload.get("sub")
        if isinstance(sub, str) and sub.strip():
            return sub.strip()
    except Exception:
        pass
    return None


def _resolve_evermem_user_id(authorization: Optional[str], x_client_id: Optional[str] = None) -> str:
    token = _extract_bearer_token(authorization)
    if not token:
        if isinstance(x_client_id, str) and x_client_id.strip():
            return f"guest_{_normalize_scope_value(x_client_id)}"
        return "guest"

    sub = _extract_sub_from_jwt(token)
    if sub:
        return f"cloud_{_normalize_scope_value(sub)}"

    token_fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return f"token_{token_fingerprint}"


def _review_group_id_for_user(user_id: Optional[str]) -> Optional[str]:
    if not isinstance(user_id, str) or not user_id.strip():
        return None
    return f"{user_id}::review"


def _prime_evermem_runtime(
    authorization: Optional[str],
    x_evermem_enabled: Optional[str],
    x_evermem_url: Optional[str],
    x_evermem_key: Optional[str],
):
    from routers.ai import _is_enabled
    from services.evermem_config import save_config, get_service

    evermem_requested = _is_enabled(x_evermem_enabled)
    evermem_enabled = evermem_requested and _can_use_evermem(authorization)

    if evermem_enabled and isinstance(x_evermem_key, str) and x_evermem_key.strip():
        save_config(enabled=True, url=x_evermem_url, key=x_evermem_key)
    elif not evermem_enabled:
        save_config(enabled=False, url=x_evermem_url, key=None)

    service = get_service()
    if not service:
        print(
            "[EverMem Review] Runtime unavailable "
            f"requested={evermem_requested} enabled={evermem_enabled} "
            f"has_auth={_can_use_evermem(authorization)} has_key={bool((x_evermem_key or '').strip())}"
        )
    return service, evermem_enabled


def _clean_review_words(words: List[dict]) -> List[dict]:
    """Clean Chinese text in review word list."""
    for w in words:
        if 'meaning' in w and w['meaning']:
            w['meaning'] = clean_chinese_text(w['meaning'])
        if 'example' in w and w['example']:
            w['example'] = clean_chinese_text(w['example'])
        if 'context_cn' in w and w['context_cn']:
            w['context_cn'] = clean_chinese_text(w['context_cn'])
    return words


def _format_learning_focus_summary(db, limit: int = 5) -> str:
    summary = db.get_learning_focus_summary(limit=limit)
    weak_words = summary.get("weak_words", [])
    if not weak_words:
        return ""

    parts = []
    for item in weak_words[:limit]:
        word = str(item.get("word", "")).strip()
        if not word:
            continue
        meaning = str(item.get("meaning", "")).strip()
        error_count = int(item.get("error_count", 0) or 0)
        easiness = float(item.get("easiness", 2.5) or 2.5)
        due_tag = "due now" if item.get("is_due") else "reviewing"
        if meaning:
            parts.append(f"{word} ({meaning}; mistakes={error_count}, ease={easiness:.2f}, {due_tag})")
        else:
            parts.append(f"{word} (mistakes={error_count}, ease={easiness:.2f}, {due_tag})")

    if not parts:
        return ""

    return (
        f"Current weaker review words: {'; '.join(parts)}. "
        f"Due now: {summary.get('due_count', 0)}. Difficult words tracked: {summary.get('difficult_count', 0)}."
    )


@router.get("/due")
async def get_due_words(limit: int = Query(20, ge=1, le=100)):
    """获取待复习的单词"""
    db = get_db()
    now = datetime.now().timestamp()
    
    # Get words that are due for review
    words, total = db.search_words(
        status_filter="due",
        sort_by="next_review_time",
        sort_order="ASC",
        limit=limit,
        offset=0
    )
    
    return {
        "words": _clean_review_words(words),
        "count": len(words),
        "total_due": total
    }


@router.get("/new")
async def get_new_words(limit: int = Query(10, ge=1, le=50)):
    """获取新单词（未开始复习的）"""
    db = get_db()
    
    words, total = db.search_words(
        status_filter="new",
        sort_by="date_added",
        sort_order="DESC",
        limit=limit,
        offset=0
    )
    
    return {
        "words": _clean_review_words(words),
        "count": len(words),
        "total_new": total
    }


@router.get("/difficult")
async def get_difficult_words(limit: int = Query(20, ge=1, le=100)):
    """获取困难词（错误次数 >= 1 的单词）"""
    db = get_db()

    # Use direct SQL for now as search_words might not support error_count filtering yet
    conn = db.get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM words
        WHERE error_count >= 1
        ORDER BY error_count DESC, next_review_time ASC
        LIMIT ?
    ''', (limit,))

    rows = cursor.fetchall()
    words = []
    for row in rows:
        d = dict(row)
        d['mastered'] = bool(d['mastered'])
        d['date'] = d['date_added']
        # Ensure text fields are not None
        for key in ['phonetic', 'meaning', 'example', 'context_en', 'context_cn', 'roots', 'synonyms', 'tags']:
            if d.get(key) is None:
                d[key] = ""
        words.append(d)

    return {
        "words": _clean_review_words(words),
        "count": len(words)
    }


@router.post("/submit")
async def submit_review(
    review: ReviewSubmit,
    authorization: Optional[str] = Header(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
    x_evermem_enabled: Optional[str] = Header("false", alias="X-EverMem-Enabled"),
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
):
    """提交单词复习结果（SM-2 算法）"""
    db = get_db()
    evermem_user_id = _resolve_evermem_user_id(authorization, x_client_id) if _can_use_evermem(authorization) else None
    
    word_data = db.get_word(review.word)
    if not word_data:
        raise HTTPException(status_code=404, detail=f"Word '{review.word}' not found")
    
    # Import review service
    from services.review_service import ReviewService
    
    # Calculate SM-2
    easiness, interval, repetitions = ReviewService.calculate_sm2(review.quality, word_data)
    next_time = ReviewService.calculate_next_review_time(interval, review.quality)
    next_review_in_hours = round(max(0, next_time - time.time()) / 3600, 1)
    
    # Update database
    db.update_sm2_status(
        word=review.word,
        easiness=easiness,
        interval=interval,
        repetitions=repetitions,
        next_time=next_time,
        rating=review.quality
    )
    updated_word_data = db.get_word(review.word) or word_data

    # Store learning record to EverMemOS (fire-and-forget)
    try:
        evermem, evermem_enabled = _prime_evermem_runtime(
            authorization=authorization,
            x_evermem_enabled=x_evermem_enabled,
            x_evermem_url=x_evermem_url,
            x_evermem_key=x_evermem_key,
        )
        if evermem and evermem_user_id:
            import asyncio
            meaning = word_data.get('meaning', '')
            review_group_id = _review_group_id_for_user(evermem_user_id)
            # Build structured learning record
            quality_labels = {
                0: "完全不认识", 1: "勉强见过", 2: "有印象但想不起来",
                3: "有些犹豫但答对了", 4: "比较熟悉", 5: "完全掌握"
            }
            label = quality_labels.get(review.quality, f"评分{review.quality}")
            interval_text = f"{next_review_in_hours}小时后" if review.quality <= 2 else f"{interval}天后"
            error_count = int(updated_word_data.get("error_count") or 0)
            weakness_signal = (
                "This word is still weak for the user."
                if review.quality <= 2 or error_count >= 2
                else "This word seems reasonably stable for the user."
            )
            record = (
                f"[REVIEW_RECORD] 复习单词 '{review.word}' ({meaning}). "
                f"评分: {review.quality}/5 ({label}). "
                f"下次复习: {interval_text}. "
                f"当前难度信号: error_count={error_count}, easiness={round(easiness, 2)}, repetitions={repetitions}. "
                f"{weakness_signal}"
            )
            async def _store_review_record():
                result = await evermem.add_memory(
                    content=record,
                    user_id=evermem_user_id,
                    sender="tutor_vocab",
                    sender_name="VocabBook Tutor",
                    flush=True,
                    group_id=review_group_id,
                    group_name=review_group_id,
                )
                if result is not None:
                    print(f"[EverMem Review] Stored review record user={evermem_user_id} group_id={review_group_id} word={review.word} quality={review.quality}")

            asyncio.create_task(_store_review_record())
        elif evermem_enabled:
            print(
                "[EverMem Review] Skipped review record "
                f"user_id={evermem_user_id} service_available={bool(evermem)}"
            )
    except Exception as e:
        print(f"[EverMem] Failed to store review record: {e}")
    
    return {
        "message": "Review submitted",
        "word": review.word,
        "quality": review.quality,
        "next_review": datetime.fromtimestamp(next_time).strftime('%Y-%m-%d %H:%M'),
        "interval_days": interval,
        "next_review_in_hours": next_review_in_hours,
        "easiness": round(easiness, 2),
        "error_count_incremented": review.quality <= 2
    }


@router.post("/session")
async def log_session(
    session: ReviewSession,
    authorization: Optional[str] = Header(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
    x_evermem_enabled: Optional[str] = Header("false", alias="X-EverMem-Enabled"),
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
):
    """记录复习会话"""
    db = get_db()
    db.log_study_session(session.duration, session.review_count)

    evermem_user_id = _resolve_evermem_user_id(authorization, x_client_id) if _can_use_evermem(authorization) else None
    try:
        evermem, evermem_enabled = _prime_evermem_runtime(
            authorization=authorization,
            x_evermem_enabled=x_evermem_enabled,
            x_evermem_url=x_evermem_url,
            x_evermem_key=x_evermem_key,
        )
        if evermem and evermem_user_id:
            import asyncio
            focus_summary = _format_learning_focus_summary(db, limit=5)
            if focus_summary:
                review_group_id = _review_group_id_for_user(evermem_user_id)
                session_record = (
                    f"[REVIEW_SESSION] Review session completed. Duration: {session.duration} seconds. "
                    f"Reviewed words: {session.review_count}. "
                    f"{focus_summary}"
                )
                async def _store_review_session():
                    result = await evermem.add_memory(
                        content=session_record,
                        user_id=evermem_user_id,
                        sender="tutor_vocab",
                        sender_name="VocabBook Tutor",
                        flush=True,
                        group_id=review_group_id,
                        group_name=review_group_id,
                    )
                    if result is not None:
                        print(f"[EverMem Review] Stored review session summary user={evermem_user_id} group_id={review_group_id} reviewed={session.review_count}")

                asyncio.create_task(_store_review_session())
        elif evermem_enabled:
            print(
                "[EverMem Review] Skipped review session "
                f"user_id={evermem_user_id} service_available={bool(evermem)}"
            )
    except Exception as e:
        print(f"[EverMem] Failed to store review session summary: {e}")
    
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
