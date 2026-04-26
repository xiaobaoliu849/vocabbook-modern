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
    
    source_list = sources.split(",") if sources else None
    
    result = await run_io_blocking(DictService.search_word, word, source_list)
    if not result:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found in dictionary")
    
    return result


@router.post("/translate")
async def translate_text(request: TranslateRequest):
    """翻译文本"""
    from services.dict_service import DictService
    
    result = await run_io_blocking(DictService.translate_text, request.text)
    if not result:
        raise HTTPException(status_code=500, detail="Translation failed")
    
    return {"original": request.text, "translation": result}


@router.get("/audio/{word}")
async def get_audio_url(word: str, accent: str = Query("us", pattern="^(us|uk)$")):
    """获取单词发音 URL"""
    # Youdao audio URL pattern
    if accent == "uk":
        url = f"https://dict.youdao.com/dictvoice?audio={word}&type=1"
    else:
        url = f"https://dict.youdao.com/dictvoice?audio={word}&type=2"
    
    return {"word": word, "accent": accent, "audio_url": url}


@router.get("/family/{word}")
async def get_word_family(word: str):
    """获取单词的词根和派生词"""
    return await run_db_blocking(get_dictionary_repository().get_word_family_payload, word)
