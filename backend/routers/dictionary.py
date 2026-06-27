"""
Dictionary API Router
词典查询服务
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from repositories.dictionary_repository import DictionaryRepository
from services.blocking_io import run_db_blocking, run_io_blocking

router = APIRouter()


class TranslateRequest(BaseModel):
    """翻译请求"""
    text: str


def get_dictionary_repository() -> DictionaryRepository:
    from main import get_db as main_get_db

    return DictionaryRepository(main_get_db())


@router.get("/search/{word}")
async def search_word(word: str, sources: Optional[str] = None):
    """
    在线词典搜索单词
    sources: comma separated list of enabled dicts (e.g. "youdao,cambridge,bing")
    """
    from services.dict_service import DictService

    trimmed = word.strip()
    source_list = sources.split(",") if sources else None

    result = await run_io_blocking(DictService.search_word, trimmed, source_list)
    if not result:
        raise HTTPException(status_code=404, detail=f"Word '{trimmed}' not found in dictionary")

    from services.audio_service import AudioService

    audio_path = await run_io_blocking(AudioService.ensure_audio, trimmed)
    if audio_path:
        result["audio"] = audio_path

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
    return FileResponse(
        filepath,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f"inline; filename={trimmed}.mp3",
            "X-Cache": cache_status,
        },
    )


@router.get("/family/{word}")
async def get_word_family(word: str):
    """获取单词的词根和派生词"""
    return await run_db_blocking(get_dictionary_repository().get_word_family_payload, word)
