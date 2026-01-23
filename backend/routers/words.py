"""
Words API Router
词汇 CRUD 操作
"""
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


class WordCreate(BaseModel):
    """创建/添加单词请求"""
    word: str
    phonetic: str = ""
    meaning: str
    example: str = ""
    context_en: str = ""
    context_cn: str = ""
    tags: str = ""
    roots: str = ""
    synonyms: str = ""


class WordUpdate(BaseModel):
    """更新单词请求"""
    phonetic: Optional[str] = None
    meaning: Optional[str] = None
    example: Optional[str] = None
    context_en: Optional[str] = None
    context_cn: Optional[str] = None
    tags: Optional[str] = None
    roots: Optional[str] = None
    synonyms: Optional[str] = None


class WordResponse(BaseModel):
    """单词响应"""
    id: int
    word: str
    phonetic: str
    meaning: str
    example: str
    context_en: str
    context_cn: str
    date: str
    mastered: bool
    stage: int
    next_review_time: float
    review_count: int
    easiness: float
    interval: int
    repetitions: int
    tags: str
    roots: str
    synonyms: str


class WordListResponse(BaseModel):
    """单词列表响应"""
    words: List[WordResponse]
    total: int
    page: int
    page_size: int


def get_db():
    """获取数据库实例"""
    from main import get_db as main_get_db
    return main_get_db()


@router.get("", response_model=WordListResponse)
async def get_words(
    keyword: str = Query("", description="搜索关键词"),
    tag: str = Query("", description="标签筛选"),
    mastered: Optional[bool] = Query(None, description="是否已掌握"),
    status: Optional[str] = Query(None, description="状态筛选: new/learning/review"),
    sort_by: str = Query("next_review_time", description="排序字段"),
    sort_order: str = Query("ASC", description="排序方向"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量")
):
    """获取单词列表，支持分页和筛选"""
    db = get_db()
    offset = (page - 1) * page_size
    
    words, total = db.search_words(
        keyword=keyword,
        tag_filter=tag,
        mastered_filter=mastered,
        status_filter=status,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=page_size,
        offset=offset
    )
    
    return WordListResponse(
        words=[WordResponse(**w) for w in words],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/all")
async def get_all_words():
    """获取所有单词（不分页）"""
    db = get_db()
    words = db.get_all_words()
    return {"words": words, "total": len(words)}


@router.get("/tags")
async def get_all_tags():
    """获取所有标签"""
    db = get_db()
    tags = db.get_all_tags()
    return {"tags": tags}


@router.get("/{word}")
async def get_word(word: str):
    """获取单个单词详情"""
    db = get_db()
    word_data = db.get_word(word)
    if not word_data:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found")
    return word_data


@router.post("", status_code=201)
async def add_word(word_data: WordCreate):
    """添加新单词"""
    db = get_db()
    
    # Check if word already exists
    existing = db.get_word(word_data.word)
    if existing:
        raise HTTPException(status_code=409, detail=f"Word '{word_data.word}' already exists")
    
    data = {
        "word": word_data.word,
        "phonetic": word_data.phonetic,
        "meaning": word_data.meaning,
        "example": word_data.example,
        "context_en": word_data.context_en,
        "context_cn": word_data.context_cn,
        "tags": word_data.tags,
        "roots": word_data.roots,
        "synonyms": word_data.synonyms,
        "date": datetime.now().strftime('%Y-%m-%d')
    }
    
    db.add_word(data)
    return {"message": "Word added successfully", "word": word_data.word}


@router.put("/{word}")
async def update_word(word: str, word_data: WordUpdate):
    """更新单词信息"""
    db = get_db()
    
    existing = db.get_word(word)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found")
    
    # Update context if provided
    if word_data.context_en is not None or word_data.context_cn is not None:
        db.update_context(
            word,
            word_data.context_en if word_data.context_en is not None else existing.get("context_en", ""),
            word_data.context_cn if word_data.context_cn is not None else existing.get("context_cn", "")
        )
    
    return {"message": "Word updated successfully", "word": word}


@router.delete("/{word}")
async def delete_word(word: str):
    """删除单词"""
    db = get_db()
    
    existing = db.get_word(word)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found")
    
    db.delete_word(word)
    return {"message": "Word deleted successfully", "word": word}


@router.post("/{word}/master")
async def mark_mastered(word: str):
    """标记单词为已掌握"""
    db = get_db()
    
    existing = db.get_word(word)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Word '{word}' not found")
    
    db.mark_word_mastered(word)
    return {"message": "Word marked as mastered", "word": word}
