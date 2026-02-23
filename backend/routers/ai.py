"""
AI API Router
AI 增强功能
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

router = APIRouter()


class GenerateSentencesRequest(BaseModel):
    """生成例句请求"""
    word: str
    count: int = 3
    difficulty: str = "intermediate"  # beginner, intermediate, advanced


class MemoryTipsRequest(BaseModel):
    """生成记忆技巧请求"""
    word: str
    meaning: str = ""


class ChatMessage(BaseModel):
    """聊天消息"""
    role: str  # user, assistant
    content: str


class ChatRequest(BaseModel):
    """对话请求"""
    messages: List[ChatMessage]
    context_word: str = ""  # 当前学习的单词


class PronunciationRequest(BaseModel):
    """发音评测请求"""
    word: str
    audio_base64: str  # Base64 encoded audio


@router.post("/generate-sentences")
async def generate_sentences(
    request: GenerateSentencesRequest,
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    authorization: Optional[str] = Header(None) # Make sure to catch the token
):
    """AI 生成例句"""
    from services.ai_service import AIService
    from services.limit_service import LimitService, LimitException
    from main import get_db
    
    # Check limit locally
    try:
        limit_service = LimitService(db=get_db())
        token = authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None
        await limit_service.check_and_consume("ai_generate", token=token)
    except LimitException as le:
        raise HTTPException(status_code=403, detail={"message": le.message, "required_tier": le.required_tier})
        
    ai = AIService(provider=x_ai_provider, api_key=x_ai_key, model=x_ai_model)
    try:
        sentences = await ai.generate_sentences(
            word=request.word,
            count=request.count,
            difficulty=request.difficulty
        )
        return {
            "word": request.word,
            "sentences": sentences,
            "count": len(sentences)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


@router.post("/memory-tips")
async def generate_memory_tips(
    request: MemoryTipsRequest,
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model")
):
    """AI 生成记忆技巧"""
    from services.ai_service import AIService
    
    ai = AIService(provider=x_ai_provider, api_key=x_ai_key, model=x_ai_model)
    try:
        tips = await ai.generate_memory_tips(
            word=request.word,
            meaning=request.meaning
        )
        return {
            "word": request.word,
            "tips": tips
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


@router.post("/chat")
async def chat(
    request: ChatRequest,
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_evermem_enabled: str = Header("false", alias="X-EverMem-Enabled"), # header defaults to string in some frameworks/proxies
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
    authorization: Optional[str] = Header(None)
):
    """AI 对话练习"""
    from services.ai_service import AIService
    from services.limit_service import LimitService, LimitException
    from main import get_db
    
    # Check limit locally
    try:
        limit_service = LimitService(db=get_db())
        token = authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None
        await limit_service.check_and_consume("ai_chat", token=token)
    except LimitException as le:
        raise HTTPException(status_code=403, detail={"message": le.message, "required_tier": le.required_tier})
    
    # Check if evermem is enabled (header comes as string "true"/"false")
    evermem_enabled = str(x_evermem_enabled).lower() == "true"

    # Persist evermem config so other routers (e.g. review) can access it
    if evermem_enabled and x_evermem_key:
        from services.evermem_config import save_config
        save_config(enabled=True, url=x_evermem_url, key=x_evermem_key)

    ai = AIService(
        provider=x_ai_provider,
        api_key=x_ai_key,
        model=x_ai_model,
        evermem_enabled=evermem_enabled,
        evermem_url=x_evermem_url,
        evermem_key=x_evermem_key
    )
    try:
        result = await ai.chat(
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            context_word=request.context_word
        )
        return {
            "response": result["text"],
            "context_word": request.context_word,
            "memories_retrieved": result.get("memories_retrieved", 0),
            "memory_saved": result.get("memory_saved", False)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat failed: {str(e)}")


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_evermem_enabled: str = Header("false", alias="X-EverMem-Enabled"),
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
    authorization: Optional[str] = Header(None)
):
    """AI 对话练习 (流式)"""
    from services.ai_service import AIService
    from services.limit_service import LimitService, LimitException
    from main import get_db
    from fastapi.responses import StreamingResponse
    
    # Check limit locally
    try:
        limit_service = LimitService(db=get_db())
        token = authorization.split(" ")[1] if authorization and authorization.startswith("Bearer ") else None
        await limit_service.check_and_consume("ai_chat", token=token)
    except LimitException as le:
        raise HTTPException(status_code=403, detail={"message": le.message, "required_tier": le.required_tier})
    
    evermem_enabled = str(x_evermem_enabled).lower() == "true"

    if evermem_enabled and x_evermem_key:
        from services.evermem_config import save_config
        save_config(enabled=True, url=x_evermem_url, key=x_evermem_key)

    ai = AIService(
        provider=x_ai_provider,
        api_key=x_ai_key,
        model=x_ai_model,
        evermem_enabled=evermem_enabled,
        evermem_url=x_evermem_url,
        evermem_key=x_evermem_key
    )
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        return StreamingResponse(
            ai.chat_stream(messages=messages, context_word=request.context_word),
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat stream failed: {str(e)}")


@router.post("/evaluate-pronunciation")
async def evaluate_pronunciation(request: PronunciationRequest):
    """发音评测"""
    from services.ai_service import AIService
    
    ai = AIService()
    try:
        result = await ai.evaluate_pronunciation(
            word=request.word,
            audio_base64=request.audio_base64
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pronunciation evaluation failed: {str(e)}")


@router.get("/config")
async def get_ai_config():
    """获取 AI 配置"""
    from services.ai_service import AIService
    
    ai = AIService()
    return {
        "provider": ai.provider,
        "available_providers": ["openai", "anthropic", "gemini", "ollama", "custom"],
        "features": {
            "sentences": True,
            "memory_tips": True,
            "chat": True,
            "pronunciation": ai.provider == "openai"  # Whisper only available with OpenAI
        }
    }

# --- Translation Endpoints ---

class TranslationRequest(BaseModel):
    """翻译请求"""
    text: str
    source_lang: str = "Auto"
    target_lang: str = "Chinese"


@router.post("/translate")
async def translate(
    request: TranslationRequest,
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model")
):
    """AI 翻译并保存记录"""
    from services.ai_service import AIService
    from main import get_db
    
    ai = AIService(provider=x_ai_provider, api_key=x_ai_key, model=x_ai_model)
    db = get_db()
    
    try:
        # Call AI
        translation, reasoning = await ai.translate(
            text=request.text,
            source_lang=request.source_lang,
            target_lang=request.target_lang
        )
        
        # Save to DB
        record_id = db.add_translation(
            source_text=request.text,
            target_text=translation,
            source_lang=request.source_lang,
            target_lang=request.target_lang
        )
        
        return {
            "id": record_id,
            "translation": translation,
            "reasoning": reasoning,
            "original": request.text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@router.get("/translations/history")
async def get_translation_history(limit: int = 20, offset: int = 0):
    """获取翻译历史"""
    from main import get_db
    db = get_db()
    return db.get_translations(limit=limit, offset=offset)


@router.delete("/translations/{record_id}")
async def delete_translation_record(record_id: int):
    """删除翻译记录"""
    from main import get_db
    db = get_db()
    success = db.delete_translation(record_id)
    return {"success": success}

# --- Chat Sessions Endpoints (Persistent Chat History) ---

class ChatSessionData(BaseModel):
    """对话记录数据模型"""
    id: str
    title: str
    messages: list
    updatedAt: float
    createdAt: float

@router.get("/chat-sessions")
async def get_chat_sessions():
    """获取所有持久化的聊天会话"""
    from main import get_db
    db = get_db()
    try:
        sessions = db.get_all_chat_sessions()
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat sessions: {str(e)}")

@router.post("/chat-sessions")
async def save_chat_session(session: ChatSessionData):
    """保存/更斯聊天会话"""
    from main import get_db
    db = get_db()
    try:
        success = db.save_chat_session(session.dict())
        if not success:
            raise HTTPException(status_code=500, detail="Database save failed")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save chat session: {str(e)}")

@router.delete("/chat-sessions/{session_id}")
async def delete_chat_session(session_id: str):
    """删除聊天会话"""
    from main import get_db
    db = get_db()
    try:
        success = db.delete_chat_session(session_id)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete chat session: {str(e)}")

@router.delete("/chat-sessions")
async def clear_all_chat_sessions():
    """清空所有聊天会话"""
    from main import get_db
    db = get_db()
    try:
        success = db.clear_all_chat_sessions()
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear chat sessions: {str(e)}")
