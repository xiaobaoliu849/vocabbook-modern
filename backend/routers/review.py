"""
Review API Router
复习相关操作
"""
import hashlib
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field
from datetime import datetime, date, timedelta
import time

from repositories.review_repository import ReviewRepository
from services.blocking_io import run_db_blocking
from services.multi_dict_service import clean_chinese_text
from utils.db import get_db
from utils.evermem_helpers import (
    extract_bearer_token,
    can_use_evermem,
    normalize_scope_value,
    extract_sub_from_jwt,
    prime_evermem_runtime,
)
import logging

logger = logging.getLogger(__name__)

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


def get_review_repository() -> ReviewRepository:
    return ReviewRepository(get_db())


def _resolve_evermem_user_id(authorization: Optional[str], x_client_id: Optional[str] = None) -> str:
    token = extract_bearer_token(authorization)
    if not token:
        if isinstance(x_client_id, str) and x_client_id.strip():
            return f"guest_{normalize_scope_value(x_client_id)}"
        return "guest"

    sub = extract_sub_from_jwt(token)
    if sub:
        return f"cloud_{normalize_scope_value(sub)}"

    token_fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return f"token_{token_fingerprint}"


def _current_iso_week_tag() -> str:
    """Return the current ISO year-week string, e.g. '2025-W20'."""
    iso = date.today().isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _review_group_id_for_user(user_id: Optional[str], week_tag: Optional[str] = None) -> Optional[str]:
    """Return the weekly review group_id for this user.

    Format: ``{user_id}::review::{YYYY-WNN}``
    Scoping review records by ISO week prevents old records from polluting
    AI recall searches — the assistant only needs to scan the last few weeks.
    """
    if not isinstance(user_id, str) or not user_id.strip():
        return None
    tag = week_tag or _current_iso_week_tag()
    return f"{user_id}::review::{tag}"


def _review_group_ids_recent(user_id: Optional[str], weeks: int = 4) -> Optional[List[str]]:
    """Return the group_ids for the last *weeks* ISO weeks (inclusive of current).

    Used by AI recall so it can pass a targeted group_ids list instead of
    searching across all historical review data.
    """
    if not isinstance(user_id, str) or not user_id.strip():
        return None
    today = date.today()
    group_ids = []
    # Walk backwards week by week
    for offset in range(weeks):
        target = today - timedelta(weeks=offset)
        iso = target.isocalendar()
        tag = f"{iso.year}-W{iso.week:02d}"
        group_ids.append(f"{user_id}::review::{tag}")
    return group_ids if group_ids else None


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


def _format_learning_focus_summary(summary: dict, limit: int = 5) -> str:
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
async def get_due_words(
    limit: int = Query(20, ge=1, le=100),
    include_total: bool = False,
):
    """获取待复习的单词"""
    words, total = await run_db_blocking(
        get_review_repository().get_due_words,
        limit,
        include_total,
    )

    response = {
        "words": _clean_review_words(words),
        "count": len(words),
    }
    if include_total:
        response["total_due"] = total
    return response


@router.get("/due-count")
async def get_due_count():
    """获取当前待复习数量（轻量接口）"""
    return {"due_count": await run_db_blocking(get_review_repository().get_due_count)}


@router.get("/new")
async def get_new_words(limit: int = Query(10, ge=1, le=50)):
    """获取新单词（未开始复习的）"""
    words, total = await run_db_blocking(get_review_repository().get_new_words, limit)
    
    return {
        "words": _clean_review_words(words),
        "count": len(words),
        "total_new": total
    }


@router.get("/difficult")
async def get_difficult_words(limit: int = Query(20, ge=1, le=100)):
    """获取困难词（错误次数 >= 1 的单词）"""
    words = await run_db_blocking(get_review_repository().get_difficult_words, limit)

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
    repo = get_review_repository()
    evermem_user_id = _resolve_evermem_user_id(authorization, x_client_id) if can_use_evermem(authorization) else None

    word_data = await run_db_blocking(repo.get_word, review.word)
    if not word_data:
        raise HTTPException(status_code=404, detail=f"Word '{review.word}' not found")
    
    # Import review service
    from services.review_service import ReviewService
    
    # Calculate SM-2
    easiness, interval, repetitions = ReviewService.calculate_sm2(review.quality, word_data)
    next_time = ReviewService.calculate_next_review_time(interval, review.quality)
    next_review_in_hours = round(max(0, next_time - time.time()) / 3600, 1)
    
    # Update database
    await run_db_blocking(
        repo.update_sm2_status,
        word=review.word,
        easiness=easiness,
        interval=interval,
        repetitions=repetitions,
        next_time=next_time,
        rating=review.quality,
    )
    updated_word_data = await run_db_blocking(repo.get_word, review.word) or word_data
    remaining_due_count = await run_db_blocking(repo.get_due_count)

    # Store learning record to EverMemOS (fire-and-forget)
    try:
        evermem, _, evermem_enabled, _ = prime_evermem_runtime(
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
                    async_mode=False,  # Synchronous: guarantee write before returning
                )
                if result is not None:
                    status = result.get("status", "unknown")
                    logger.debug(f"[EverMem Review] Stored review record user={evermem_user_id} group_id={review_group_id} word={review.word} quality={review.quality} status={status}")

            asyncio.create_task(_store_review_record())
        elif evermem_enabled:
            logger.warning(
                "[EverMem Review] Skipped review record "
                f"user_id={evermem_user_id} service_available={bool(evermem)}"
            )
    except Exception as e:
        logger.error(f"[EverMem] Failed to store review record: {e}")
    
    return {
        "message": "Review submitted",
        "word": review.word,
        "quality": review.quality,
        "next_review": datetime.fromtimestamp(next_time).strftime('%Y-%m-%d %H:%M'),
        "interval_days": interval,
        "next_review_in_hours": next_review_in_hours,
        "easiness": round(easiness, 2),
        "error_count_incremented": review.quality <= 2,
        "remaining_due_count": remaining_due_count,
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
    repo = get_review_repository()
    await run_db_blocking(repo.log_study_session, session.duration, session.review_count)

    evermem_user_id = _resolve_evermem_user_id(authorization, x_client_id) if can_use_evermem(authorization) else None
    try:
        evermem, _, evermem_enabled, _ = prime_evermem_runtime(
            authorization=authorization,
            x_evermem_enabled=x_evermem_enabled,
            x_evermem_url=x_evermem_url,
            x_evermem_key=x_evermem_key,
        )
        if evermem and evermem_user_id:
            import asyncio
            focus_summary = _format_learning_focus_summary(
                await run_db_blocking(repo.get_learning_focus_summary, 5),
                limit=5,
            )
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
                        async_mode=False,  # Synchronous: session summary is high-value data
                    )
                    if result is not None:
                        status = result.get("status", "unknown")
                        logger.debug(f"[EverMem Review] Stored review session summary user={evermem_user_id} group_id={review_group_id} reviewed={session.review_count} status={status}")

                asyncio.create_task(_store_review_session())

                foresight_group_id = f"{evermem_user_id}::foresight"
                valid_until = (date.today() + timedelta(days=3)).isoformat()
                foresight_content = (
                    f"[FORESIGHT] Review reminder (valid until {valid_until}). "
                    f"{focus_summary} "
                    f"Suggested action: Practice these words in your next AI chat or review session."
                )

                async def _store_foresight_reminder():
                    try:
                        existing = await evermem.get_memories(
                            user_id=evermem_user_id,
                            group_ids=[foresight_group_id],
                            memory_type="foresight",
                            page_size=10,
                        )
                        if len(existing) >= 3:
                            for old in existing[:-2]:
                                mid = old.get("memory_id")
                                if mid:
                                    await evermem.delete_memories(memory_id=mid)

                        result = await evermem.add_memory(
                            content=foresight_content,
                            user_id=evermem_user_id,
                            sender="tutor_vocab",
                            sender_name="VocabBook Tutor",
                            flush=True,
                            group_id=foresight_group_id,
                            group_name=foresight_group_id,
                            async_mode=False,
                        )
                        if result is not None:
                            status = result.get("status", "unknown")
                            logger.debug(f"[EverMem Foresight] Stored foresight user={evermem_user_id} group_id={foresight_group_id} status={status}")
                    except Exception as exc:
                        logger.error(f"[EverMem Foresight] Failed to store foresight: {exc}")

                asyncio.create_task(_store_foresight_reminder())
        elif evermem_enabled:
            logger.warning(
                "[EverMem Review] Skipped review session "
                f"user_id={evermem_user_id} service_available={bool(evermem)}"
            )
    except Exception as e:
        logger.error(f"[EverMem] Failed to store review session summary: {e}")
    
    return {
        "message": "Session logged",
        "duration": session.duration,
        "review_count": session.review_count
    }


@router.get("/heatmap")
async def get_heatmap_data():
    """获取复习热力图数据"""
    data = await run_db_blocking(get_review_repository().get_heatmap_data)
    return {"heatmap": data}


@router.get("/history/{word}")
async def get_word_history(word: str):
    """获取单词复习历史"""
    word_data, history = await run_db_blocking(get_review_repository().get_word_history, word)
    if not word_data:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found")
    return {
        "word": word,
        "history": history
    }
