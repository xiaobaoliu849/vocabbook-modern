"""
AI API Router
AI 增强功能
"""
import base64
import hashlib
import json
import re
from typing import Any, List, Optional
from fastapi import APIRouter, HTTPException, Header
import httpx
from pydantic import BaseModel

router = APIRouter()


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Extract Bearer token from authorization header."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        return token or None
    return None


def _is_enabled(value: Optional[str]) -> bool:
    """Parse common boolean header values."""
    return str(value).strip().lower() == "true"


def _is_local_ollama_request(provider: Optional[str], api_base: Optional[str]) -> bool:
    if (provider or "").strip().lower() != "ollama":
        return False
    base = (api_base or "").strip().lower()
    # Empty base uses default localhost ollama endpoint in service layer.
    if not base:
        return True
    return (
        base.startswith("http://localhost")
        or base.startswith("http://127.0.0.1")
        or base.startswith("https://localhost")
        or base.startswith("https://127.0.0.1")
    )


def _can_use_evermem(authorization: Optional[str]) -> bool:
    """
    Require authenticated requests for long-term memory access.
    """
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


def _owner_key_from_identity(identity: str) -> str:
    return f"cloud_{_normalize_scope_value(identity)}"


def _owner_key_from_client_id(client_id: str) -> str:
    return f"guest_{_normalize_scope_value(client_id)}"


def _owner_key_from_token(token: str) -> str:
    sub = _extract_sub_from_jwt(token)
    if sub:
        return _owner_key_from_identity(sub)
    token_fingerprint = hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]
    return f"token_{token_fingerprint}"


async def _resolve_chat_owner_key(authorization: Optional[str], x_client_id: Optional[str] = None) -> str:
    token = _extract_bearer_token(authorization)
    if not token:
        if isinstance(x_client_id, str) and x_client_id.strip():
            return _owner_key_from_client_id(x_client_id)
        return "guest"

    fallback_owner_key = _owner_key_from_token(token)

    # Prefer verified identity from cloud auth service; fallback to token-derived scope.
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "http://localhost:8001/users/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=3.0
            )
        if resp.status_code == 200:
            email = resp.json().get("email")
            if isinstance(email, str) and email.strip():
                return _owner_key_from_identity(email)
    except Exception:
        pass

    return fallback_owner_key


async def _check_ai_limit(
    action: str,
    authorization: Optional[str],
    provider: Optional[str] = None,
    api_base: Optional[str] = None
) -> None:
    """Check and consume local AI quota for current user token."""
    from services.limit_service import LimitService, LimitException
    from main import get_db

    # Local ollama should not be quota-limited.
    if _is_local_ollama_request(provider, api_base):
        return

    try:
        limit_service = LimitService(db=get_db())
        await limit_service.check_and_consume(action, token=_extract_bearer_token(authorization))
    except LimitException as le:
        raise HTTPException(status_code=403, detail={"message": le.message, "required_tier": le.required_tier})


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
    content: Any  # str or list of content parts (multimodal)


class ChatRequest(BaseModel):
    """对话请求"""
    messages: List[ChatMessage]
    context_word: str = ""  # 当前学习的单词
    session_id: Optional[str] = None # Current chat session ID


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
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base"),
    authorization: Optional[str] = Header(None) # Make sure to catch the token
):
    """AI 生成例句"""
    from services.ai_service import AIService
    await _check_ai_limit("ai_generate", authorization, provider=x_ai_provider, api_base=x_ai_base)
        
    ai = AIService(provider=x_ai_provider, api_key=x_ai_key, model=x_ai_model, api_base=x_ai_base)
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
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base")
):
    """AI 生成记忆技巧"""
    from services.ai_service import AIService
    
    ai = AIService(provider=x_ai_provider, api_key=x_ai_key, model=x_ai_model, api_base=x_ai_base)
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
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base"),
    x_evermem_enabled: str = Header("false", alias="X-EverMem-Enabled"), # header defaults to string in some frameworks/proxies
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
    authorization: Optional[str] = Header(None)
):
    """AI 对话练习"""
    from services.ai_service import AIService
    await _check_ai_limit("ai_chat", authorization, provider=x_ai_provider, api_base=x_ai_base)
    
    # EverMem requires explicit enable flag and authenticated request.
    evermem_requested = _is_enabled(x_evermem_enabled)
    evermem_enabled = evermem_requested and _can_use_evermem(authorization)
    evermem_user_id = await _resolve_chat_owner_key(authorization, x_client_id) if evermem_enabled else "guest"

    # Persist evermem config so other routers (e.g. review) can access it.
    # Security: if request is unauthenticated, always force-disable runtime evermem.
    if evermem_enabled and x_evermem_key:
        from services.evermem_config import save_config
        save_config(enabled=True, url=x_evermem_url, key=x_evermem_key)
    elif not evermem_enabled:
        from services.evermem_config import save_config
        save_config(enabled=False, url=x_evermem_url, key=None)

    ai = AIService(
        provider=x_ai_provider,
        api_key=x_ai_key,
        model=x_ai_model,
        api_base=x_ai_base,
        evermem_enabled=evermem_enabled,
        evermem_url=x_evermem_url,
        evermem_key=x_evermem_key,
        evermem_user_id=evermem_user_id
    )
    try:
        result = await ai.chat(
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            context_word=request.context_word,
            session_id=request.session_id
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
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base"),
    x_evermem_enabled: str = Header("false", alias="X-EverMem-Enabled"),
    x_evermem_url: Optional[str] = Header(None, alias="X-EverMem-Url"),
    x_evermem_key: Optional[str] = Header(None, alias="X-EverMem-Key"),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id"),
    authorization: Optional[str] = Header(None)
):
    """AI 对话练习 (流式)"""
    from services.ai_service import AIService
    from fastapi.responses import StreamingResponse

    await _check_ai_limit("ai_chat", authorization, provider=x_ai_provider, api_base=x_ai_base)

    evermem_requested = _is_enabled(x_evermem_enabled)
    evermem_enabled = evermem_requested and _can_use_evermem(authorization)
    evermem_user_id = await _resolve_chat_owner_key(authorization, x_client_id) if evermem_enabled else "guest"

    if evermem_enabled and x_evermem_key:
        from services.evermem_config import save_config
        save_config(enabled=True, url=x_evermem_url, key=x_evermem_key)
    elif not evermem_enabled:
        from services.evermem_config import save_config
        save_config(enabled=False, url=x_evermem_url, key=None)

    ai = AIService(
        provider=x_ai_provider,
        api_key=x_ai_key,
        model=x_ai_model,
        api_base=x_ai_base,
        evermem_enabled=evermem_enabled,
        evermem_url=x_evermem_url,
        evermem_key=x_evermem_key,
        evermem_user_id=evermem_user_id
    )
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        return StreamingResponse(
            ai.chat_stream(messages=messages, context_word=request.context_word, session_id=request.session_id),
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


@router.post("/test-connection")
async def test_connection(
    x_ai_provider: Optional[str] = Header(None, alias="X-AI-Provider"),
    x_ai_key: Optional[str] = Header(None, alias="X-AI-Key"),
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base")
):
    """测试 AI 连接"""
    from services.ai_service import AIService
    
    ai = AIService(
        provider=x_ai_provider,
        api_key=x_ai_key,
        model=x_ai_model,
        api_base=x_ai_base
    )
    return await ai.test_connection()

@router.get("/ollama-models")
async def get_ollama_models(
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base")
):
    """获取本地 Ollama 已安装的模型列表"""
    # Ollama native API uses port 11434 without /v1 suffix
    base = x_ai_base or "http://localhost:11434"
    # Strip /v1 suffix if present (user may pass OpenAI-compatible URL)
    base = base.rstrip("/")
    if base.endswith("/v1"):
        base = base[:-3]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{base}/api/tags", timeout=5.0)
            resp.raise_for_status()
            data = resp.json()

        models = []
        for m in data.get("models", []):
            size_bytes = m.get("size", 0)
            # Convert to human-readable size
            if size_bytes >= 1e9:
                size_str = f"{size_bytes / 1e9:.1f} GB"
            elif size_bytes >= 1e6:
                size_str = f"{size_bytes / 1e6:.0f} MB"
            else:
                size_str = f"{size_bytes} B"

            models.append({
                "name": m.get("name", ""),
                "size": size_str,
                "size_bytes": size_bytes,
                "modified_at": m.get("modified_at", ""),
                "family": m.get("details", {}).get("family", ""),
                "parameter_size": m.get("details", {}).get("parameter_size", ""),
            })

        # Sort by modification time (newest first)
        models.sort(key=lambda x: x["modified_at"], reverse=True)
        return {"models": models, "count": len(models)}

    except httpx.ConnectError:
        return {"models": [], "count": 0, "error": "无法连接到 Ollama 服务，请确保 Ollama 正在运行"}
    except Exception as e:
        return {"models": [], "count": 0, "error": f"获取模型列表失败: {str(e)}"}


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
    x_ai_model: Optional[str] = Header(None, alias="X-AI-Model"),
    x_ai_base: Optional[str] = Header(None, alias="X-AI-Base")
):
    """AI 翻译并保存记录"""
    from services.ai_service import AIService
    from main import get_db
    
    ai = AIService(provider=x_ai_provider, api_key=x_ai_key, model=x_ai_model, api_base=x_ai_base)
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
async def get_chat_sessions(
    authorization: Optional[str] = Header(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id")
):
    """获取所有持久化的聊天会话"""
    from main import get_db
    db = get_db()
    owner_key = await _resolve_chat_owner_key(authorization, x_client_id)
    try:
        sessions = db.get_all_chat_sessions(owner_key=owner_key)
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch chat sessions: {str(e)}")

@router.post("/chat-sessions")
async def save_chat_session(
    session: ChatSessionData,
    authorization: Optional[str] = Header(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id")
):
    """保存/更新聊天会话"""
    from main import get_db
    db = get_db()
    owner_key = await _resolve_chat_owner_key(authorization, x_client_id)
    try:
        success = db.save_chat_session(session.model_dump(), owner_key=owner_key)
        if not success:
            raise HTTPException(status_code=500, detail="Database save failed")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save chat session: {str(e)}")

@router.delete("/chat-sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    authorization: Optional[str] = Header(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id")
):
    """删除聊天会话"""
    from main import get_db
    db = get_db()
    owner_key = await _resolve_chat_owner_key(authorization, x_client_id)
    try:
        success = db.delete_chat_session(session_id, owner_key=owner_key)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete chat session: {str(e)}")

@router.delete("/chat-sessions")
async def clear_all_chat_sessions(
    authorization: Optional[str] = Header(None),
    x_client_id: Optional[str] = Header(None, alias="X-Client-Id")
):
    """清空所有聊天会话"""
    from main import get_db
    db = get_db()
    owner_key = await _resolve_chat_owner_key(authorization, x_client_id)
    try:
        success = db.clear_all_chat_sessions(owner_key=owner_key)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear chat sessions: {str(e)}")
