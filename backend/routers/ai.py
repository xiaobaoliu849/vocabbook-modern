"""
AI API Router
AI 增强功能
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException
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
async def generate_sentences(request: GenerateSentencesRequest):
    """AI 生成例句"""
    from services.ai_service import AIService
    
    ai = AIService()
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
async def generate_memory_tips(request: MemoryTipsRequest):
    """AI 生成记忆技巧"""
    from services.ai_service import AIService
    
    ai = AIService()
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
async def chat(request: ChatRequest):
    """AI 对话练习"""
    from services.ai_service import AIService
    
    ai = AIService()
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
