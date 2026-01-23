"""
Dictionary API Router
词典查询服务
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class TranslateRequest(BaseModel):
    """翻译请求"""
    text: str


@router.get("/search/{word}")
async def search_word(word: str):
    """在线词典搜索单词"""
    from services.dict_service import DictService
    
    result = DictService.search_word(word)
    if not result:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found in dictionary")
    
    return result


@router.post("/translate")
async def translate_text(request: TranslateRequest):
    """翻译文本"""
    from services.dict_service import DictService
    
    result = DictService.translate_text(request.text)
    if not result:
        raise HTTPException(status_code=500, detail="Translation failed")
    
    return {"original": request.text, "translation": result}


@router.get("/audio/{word}")
async def get_audio_url(word: str, accent: str = Query("us", regex="^(us|uk)$")):
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
    def get_db():
        from main import get_db as main_get_db
        return main_get_db()
    
    db = get_db()
    family = db.get_word_family(word)
    roots = db.get_roots_for_word(word)
    
    return {
        "word": word,
        "roots": roots,
        "family": family
    }
