"""
Dictionary API Router
词典查询服务
"""
import asyncio
import re
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from repositories.dictionary_repository import DictionaryRepository
from services.blocking_io import run_db_blocking, run_io_blocking
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class TranslateRequest(BaseModel):
    """翻译请求"""
    text: str


def get_dictionary_repository() -> DictionaryRepository:
    from main import get_db as main_get_db

    return DictionaryRepository(main_get_db())


def _get_db():
    from main import get_db as main_get_db
    return main_get_db()


@router.get("/search/{word}")
async def search_word(word: str, sources: Optional[str] = None):
    """
    在线词典搜索单词
    sources: comma separated list of enabled dicts (e.g. "youdao,cambridge,bing")
    Parallelizes dictionary search with audio pre-fetch and is_saved check.
    """
    from services.dict_service import DictService
    from services.audio_service import AudioService

    trimmed = word.strip()
    source_list = sources.split(",") if sources else None

    async def _safe_ensure_audio(w: str):
        # Audio prefetch is best-effort: an exception here must not take the
        # whole search response down via gather's fail-fast propagation.
        try:
            return await run_io_blocking(AudioService.ensure_audio, w)
        except Exception as exc:
            logger.warning(f"[Dictionary] Audio prefetch failed for '{w}': {exc}")
            return None

    # 并行执行：词典查询 + 音频预取 + 是否已保存查询
    dict_task = run_io_blocking(DictService.search_word, trimmed, source_list)
    audio_task = _safe_ensure_audio(trimmed)
    saved_task = run_db_blocking(_get_db().get_word, trimmed)

    result, audio_path, saved_word = await asyncio.gather(
        dict_task, audio_task, saved_task
    )

    if not result:
        raise HTTPException(status_code=404, detail=f"Word '{trimmed}' not found in dictionary")

    if audio_path:
        result["audio"] = audio_path

    # 注入 is_saved 状态，消除前端二次请求
    result["is_saved"] = saved_word is not None

    return result


@router.post("/translate")
async def translate_text(request: TranslateRequest):
    """翻译文本"""
    from services.dict_service import DictService
    
    result = await run_io_blocking(DictService.translate_text, request.text)
    if not result:
        raise HTTPException(status_code=500, detail="Translation failed")
    
    return {"original": request.text, "translation": result}


from fastapi.responses import FileResponse
from services.audio_service import AudioService


@router.get("/audio/{word}")
async def get_word_audio(word: str, accent: str = Query("us", pattern="^(us|uk)$")):
    """获取并缓存单词发音音频，返回本地 MP3 文件"""
    trimmed = word.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Word is required")

    normalized_accent = AudioService.normalize_accent(accent)
    filepath = await run_io_blocking(AudioService.get_cached_filepath, trimmed, normalized_accent)

    if not filepath:
        api_path = await run_io_blocking(AudioService.ensure_audio, trimmed, normalized_accent)
        if not api_path:
            raise HTTPException(status_code=404, detail=f"Audio not available for '{trimmed}'")
        filepath = await run_io_blocking(AudioService.get_cached_filepath, trimmed, normalized_accent)

    if not filepath:
        raise HTTPException(status_code=404, detail=f"Audio file not found for '{trimmed}'")

    cache_status = "HIT" if filepath else "MISS"
    # filename must be latin-1 encodable (HTTP header); non-ASCII words
    # (zh/ja/ko/ru are supported by TTS) need the RFC 5987 ext form.
    ascii_fallback = re.sub(r'[^A-Za-z0-9._-]', "_", trimmed) or "audio"
    utf8_name = quote(f"{ascii_fallback}.mp3", safe="")
    return FileResponse(
        filepath,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": (
                f"inline; filename={ascii_fallback}.mp3; "
                f"filename*=UTF-8''{utf8_name}"
            ),
            "X-Cache": cache_status,
        },
    )


@router.get("/family/{word}")
async def get_word_family(word: str):
    """获取单词的词根和派生词"""
    return await run_db_blocking(get_dictionary_repository().get_word_family_payload, word)
