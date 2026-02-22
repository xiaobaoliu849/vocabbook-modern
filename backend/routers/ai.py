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
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model")
):
    """AI 生成例句"""
    from services.ai_service import AIService
    
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
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key")
):
    """AI 对话练习"""
    from services.ai_service import AIService
    
    # Check if evermem is enabled (header comes as string "true"/"false")
    evermem_enabled = str(x_evermem_enabled).lower() == "true"

    ai = AIService(
        provider=x_ai_provider,
        api_key=x_ai_key,
        model=x_ai_model,
        evermem_enabled=evermem_enabled,
        evermem_url=x_evermem_url,
        evermem_key=x_evermem_key
    )
    try:
        response = await ai.chat(
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            context_word=request.context_word
        )
        return {
            "response": response,
            "context_word": request.context_word
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat failed: {str(e)}")


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
