"""
AI Service
AI 增强功能服务
支持多种 AI Provider: OpenAI, Anthropic, Gemini, Ollama, Custom
"""
import os
import json
import re
import datetime
from typing import List, Dict, Optional, Tuple
import httpx
from services.evermem_service import EverMemService
from services.recall import RecallEngine
import logging

logger = logging.getLogger(__name__)


class AIService:
    """AI 服务封装，支持多 Provider 切换"""
    # Recall / classification / scoring logic has been extracted to
    # ``services.recall.RecallEngine``. Class-level ``_FOO`` aliases
    # keep legacy callers (including internal call sites in this
    # file) working. New recall helpers go on RecallEngine, not here.
    _recall = RecallEngine()

    _RECALL_DEBUG_VERSION = RecallEngine.RECALL_DEBUG_VERSION
    _RECALL_HINT_PATTERNS = RecallEngine.RECALL_HINT_PATTERNS
    _IDENTITY_RECALL_PATTERNS = RecallEngine.IDENTITY_RECALL_PATTERNS
    _REVIEW_RECALL_PATTERNS = RecallEngine.REVIEW_RECALL_PATTERNS
    _RECALL_TERM_EXPANSIONS = RecallEngine.RECALL_TERM_EXPANSIONS
    _ASSISTANT_SUMMARY_PATTERNS = RecallEngine.ASSISTANT_SUMMARY_PATTERNS
    _QUESTION_EVENT_PATTERNS = RecallEngine.QUESTION_EVENT_PATTERNS
    _ASSISTANT_EVENT_PATTERNS = RecallEngine.ASSISTANT_EVENT_PATTERNS
    _USER_FACT_PATTERNS = RecallEngine.USER_FACT_PATTERNS
    _IDENTITY_MEMORY_PATTERNS = RecallEngine.IDENTITY_MEMORY_PATTERNS
    _REVIEW_MEMORY_PATTERNS = RecallEngine.REVIEW_MEMORY_PATTERNS
    _NEGATIVE_IDENTITY_PATTERNS = RecallEngine.NEGATIVE_IDENTITY_PATTERNS
    _RECALL_STOPWORDS = RecallEngine.RECALL_STOPWORDS
    _MEMORY_GUIDANCE_PATTERNS = RecallEngine.MEMORY_GUIDANCE_PATTERNS
    _PERSONAL_CONTEXT_PATTERNS = RecallEngine.PERSONAL_CONTEXT_PATTERNS
    _SKIP_PATTERNS = RecallEngine.SKIP_PATTERNS
    def __init__(self, provider: str = None, api_key: str = None, model: str = None, api_base: str = None,
                 evermem_enabled: bool = False, evermem_url: str = None, evermem_key: str = None,
                 evermem_user_id: str = "guest", evermem_service: Optional[EverMemService] = None):
        """
        初始化 AI 服务
        
        Args:
            provider: AI 提供商 (openai, anthropic, gemini, ollama, dashscope, custom)
            api_key: API Key (optional)
            model: Model Name (optional)
            evermem_enabled: 是否启用 EverMemOS 记忆功能
            evermem_url: EverMemOS API URL
            evermem_key: EverMemOS API Key
        """
        # Default provider is openai if not specified, but check env vars
        env_provider = os.environ.get("AI_PROVIDER", "openai")
        self.provider = (provider or env_provider).strip().lower()

        # Prioritize passed api_key, then check provider-specific env vars, then generic AI_API_KEY
        if api_key:
            self.api_key = api_key
        elif self.provider == "openai":
            self.api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("AI_API_KEY", "")
        elif self.provider == "anthropic":
            self.api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("AI_API_KEY", "")
        elif self.provider == "gemini":
            self.api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("AI_API_KEY", "")
        elif self.provider == "dashscope":
            self.api_key = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("AI_API_KEY", "")
        else:
            self.api_key = os.environ.get("AI_API_KEY", "")
            
        self.api_base = api_base or os.environ.get("AI_API_BASE", "")
        self.model = model or os.environ.get("AI_MODEL", "gpt-4o-mini")
        
        # EverMemOS setup
        self.evermem_enabled = evermem_enabled
        self.evermem_user_id = evermem_user_id or "guest"
        self.evermem_service = evermem_service
        if not self.evermem_service and self.evermem_enabled and evermem_key:
            self.evermem_service = EverMemService(api_url=evermem_url or "https://api.evermind.ai", api_key=evermem_key)

    @staticmethod
    def _coerce_stream_text(value) -> str:
        """Coerce mixed stream payload shapes into plain text."""
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            for key in ("text", "content", "thinking", "reasoning_content", "reasoning"):
                if key in value:
                    return AIService._coerce_stream_text(value.get(key))
            return ""
        if isinstance(value, list):
            chunks = []
            for item in value:
                text = AIService._coerce_stream_text(item)
                if text:
                    chunks.append(text)
            return "".join(chunks)
        return str(value)

    @staticmethod
    def _extract_text_content(content) -> str:
        """Extract text from message content (handles both str and multimodal list format)."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(
                part.get("text", "") for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            )
        return str(content)

    @staticmethod
    def _extract_stream_text_parts(data: Dict) -> Tuple[str, str]:
        """
        Extract reasoning/content text chunks from OpenAI-compatible stream payloads.
        Returns (reasoning_chunk, content_chunk).
        """
        payloads = []

        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            choice = choices[0] if isinstance(choices[0], dict) else {}
            if isinstance(choice, dict):
                delta = choice.get("delta")
                if isinstance(delta, dict):
                    payloads.append(delta)
                message = choice.get("message")
                if isinstance(message, dict):
                    payloads.append(message)

        top_message = data.get("message")
        if isinstance(top_message, dict):
            payloads.append(top_message)

        reasoning_chunks = []
        content_chunks = []
        for payload in payloads:
            reasoning = AIService._coerce_stream_text(
                payload.get("reasoning_content")
                or payload.get("reasoning")
                or payload.get("thinking")
            )
            content = AIService._coerce_stream_text(payload.get("content"))
            if reasoning:
                reasoning_chunks.append(reasoning)
            if content:
                content_chunks.append(content)

        return "".join(reasoning_chunks), "".join(content_chunks)

    def _get_client_config(self) -> Dict:
        """获取 HTTP 客户端配置"""
        if self.provider == "openai":
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            return {
                "base_url": self.api_base or "https://api.openai.com/v1",
                "headers": headers
            }
        elif self.provider == "anthropic":
            return {
                "base_url": self.api_base or "https://api.anthropic.com/v1",
                "headers": {
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01"
                }
            }
        elif self.provider == "gemini":
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            return {
                "base_url": self.api_base or "https://generativelanguage.googleapis.com/v1beta",
                "headers": headers
            }
        elif self.provider == "ollama":
            return {
                "base_url": self.api_base or "http://localhost:11434/v1",
                "headers": {
                    "Authorization": f"Bearer {self.api_key or 'ollama'}"
                }
            }
        elif self.provider == "dashscope":
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            return {
                "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "headers": headers
            }
        else:  # custom, or any other provider using OpenAI protocol (like qwen/deepseek via OpenAI client)
            headers = {}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            return {
                # If api_base is not set, default to openai to prevent errors, but user should set it for custom providers
                "base_url": self.api_base or "https://api.openai.com/v1", 
                "headers": headers
            }
    
    async def _call_llm(self, messages: List[Dict], temperature: float = 0.7, enable_thinking: Optional[bool] = None) -> str:
        """调用 LLM API"""
        config = self._get_client_config()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            if self.provider in ["openai", "custom", "dashscope", "ollama", "gemini"]:
                try:
                    payload = {
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature
                    }
                    if self.provider == "ollama":
                        payload["think"] = True if enable_thinking is None else bool(enable_thinking)
                    elif self.provider == "dashscope" and enable_thinking is not None:
                        payload["extra_body"] = {
                            "enable_thinking": bool(enable_thinking)
                        }
                    response = await client.post(
                        f"{config['base_url']}/chat/completions",
                        headers=config['headers'],
                        json=payload
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "")
                except Exception as e:
                    logger.error(f"LLM API Error: {e}")
                    if 'response' in locals():
                        logger.debug(f"Response status: {response.status_code}")
                        logger.debug(f"Response content: {response.text}")
                    return ""
                
            elif self.provider == "anthropic":
                response = await client.post(
                    f"{config['base_url']}/messages",
                    headers=config['headers'],
                    json={
                        "model": self.model or "claude-3-sonnet-20240229",
                        "max_tokens": 1024,
                        "messages": messages,
                        "temperature": temperature
                    }
                )
                data = response.json()
                return data.get("content", [{}])[0].get("text", "")
                
        return ""

    async def _call_llm_stream(self, messages: List[Dict], temperature: float = 0.7, enable_thinking: Optional[bool] = None):
        """流式调用 LLM API"""
        config = self._get_client_config()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            if self.provider in ["openai", "custom", "dashscope", "ollama", "gemini"]:
                try:
                    payload = {
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature,
                        "stream": True  # Enable streaming
                    }
                    if self.provider == "ollama":
                        payload["think"] = True if enable_thinking is None else bool(enable_thinking)
                    elif self.provider == "dashscope" and enable_thinking is not None:
                        payload["extra_body"] = {
                            "enable_thinking": bool(enable_thinking)
                        }
                    async with client.stream(
                        "POST",
                        f"{config['base_url']}/chat/completions",
                        headers=config['headers'],
                        json=payload
                    ) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                import json
                                try:
                                    data = json.loads(data_str)
                                    reasoning_chunk, content_chunk = self._extract_stream_text_parts(data)
                                    if reasoning_chunk:
                                        yield {"type": "reasoning", "content": reasoning_chunk}
                                    if content_chunk:
                                        yield {"type": "token", "content": content_chunk}
                                except json.JSONDecodeError:
                                    continue
                except Exception as e:
                    logger.error(f"LLM Stream API Error: {e}")
                    yield {"type": "token", "content": f"对话失败，API报错：{str(e)}。请检查模型配置或 API Key。"}
            
            # Streaming for anthropic is not fully implemented here as dashscope/openai/ollama are primary
            else:
                content = await self._call_llm(messages, temperature)
                if content:
                    yield {"type": "token", "content": content}
    
    async def generate_sentences(self, word: str, count: int = 3, difficulty: str = "intermediate") -> List[str]:
        """
        为单词生成场景例句
        
        Args:
            word: 目标单词
            count: 生成例句数量
            difficulty: 难度级别 (beginner, intermediate, advanced)
        
        Returns:
            例句列表
        """
        difficulty_desc = {
            "beginner": "简单日常对话",
            "intermediate": "中等难度的正式场景",
            "advanced": "复杂学术或商务场景"
        }
        
        prompt = f"""请为英语单词 "{word}" 生成 {count} 个实用的例句。

要求：
1. 难度级别：{difficulty_desc.get(difficulty, difficulty)}
2. 每个例句需要展示单词的不同用法或含义
3. 提供中文翻译
4. 格式：每行一个例句，英文和中文用 | 分隔

示例格式：
The teacher will elucidate the complex theorem. | 老师将阐明这个复杂的定理。"""

        try:
            response = await self._call_llm([
                {"role": "system", "content": "你是一位专业的英语教师，擅长创造生动、实用的例句帮助学生记忆单词。"},
                {"role": "user", "content": prompt}
            ])
            
            sentences = []
            for line in response.strip().split('\n'):
                line = line.strip()
                if line and '|' in line:
                    sentences.append(line)
                elif line:
                    sentences.append(line + " | ")
            
            return sentences[:count]
        except Exception as e:
            logger.error(f"Generate sentences error: {e}")
            return []
    
    async def generate_memory_tips(self, word: str, meaning: str = "") -> Dict:
        """
        生成记忆技巧
        
        Args:
            word: 目标单词
            meaning: 单词释义（可选）
        
        Returns:
            包含多种记忆技巧的字典
        """
        prompt = f"""请为英语单词 "{word}" {f'(意思: {meaning})' if meaning else ''} 生成记忆技巧。

请提供以下几种记忆方法：
1. 词根词缀分析（如果有的话）
2. 联想记忆法
3. 谐音记忆法（如果适用）
4. 词源故事（如果有趣的话）

以 JSON 格式输出：
{{
    "etymology": "词根词缀分析",
    "association": "联想记忆法",
    "phonetic_memory": "谐音记忆",
    "story": "词源故事或记忆口诀"
}}"""

        try:
            response = await self._call_llm([
                {"role": "system", "content": "你是一位创意词汇记忆专家，擅长用各种有趣的方法帮助学生记住单词。请只输出 JSON，不要其他内容。"},
                {"role": "user", "content": prompt}
            ], temperature=0.8)
            
            # Try to parse JSON from response
            try:
                # Find JSON in response
                start = response.find('{')
                end = response.rfind('}') + 1
                if start >= 0 and end > start:
                    return json.loads(response[start:end])
            except json.JSONDecodeError:
                pass
            
            return {
                "etymology": "",
                "association": response,
                "phonetic_memory": "",
                "story": ""
            }
        except Exception as e:
            logger.error(f"Generate memory tips error: {e}")
            return {}

    @staticmethod
    def _normalize_memory_content(content: str) -> str:
        return RecallEngine.normalize_memory_content(content)


    def _extract_recall_search_terms(self, user_msg: str) -> List[str]:
        return self._recall.extract_recall_search_terms(user_msg)


    def _build_recall_search_queries(self, user_msg: str) -> List[str]:
        return self._recall.build_recall_search_queries(user_msg)


    def _count_recall_term_matches(self, content: str, user_msg: str) -> int:
        return self._recall.count_recall_term_matches(content, user_msg)


    def _looks_like_assistant_summary(self, content: str) -> bool:
        return self._recall.looks_like_assistant_summary(content)


    def _looks_like_question_event(self, content: str) -> bool:
        return self._recall.looks_like_question_event(content)


    def _looks_like_assistant_event(self, content: str) -> bool:
        return self._recall.looks_like_assistant_event(content)


    def _looks_like_user_fact(self, content: str) -> bool:
        return self._recall.looks_like_user_fact(content)


    def _looks_like_identity_memory(self, content: str) -> bool:
        return self._recall.looks_like_identity_memory(content)


    def _looks_like_negative_identity_memory(self, content: str) -> bool:
        return self._recall.looks_like_negative_identity_memory(content)


    def _looks_like_review_memory(self, content: str) -> bool:
        return self._recall.looks_like_review_memory(content)


    @staticmethod
    def _review_memory_text(memory: Dict) -> str:
        return RecallEngine.review_memory_text(memory)


    @staticmethod
    def _format_memory_context(memories: List[Dict], prefer_recent: bool = False) -> str:
        return RecallEngine.format_memory_context(memories, prefer_recent=prefer_recent)


    @staticmethod
    def _summarize_memories_for_log(memories: List[Dict], limit: int = 5) -> str:
        return RecallEngine.summarize_memories_for_log(memories, limit=limit)


    def _should_skip_memory(self, user_msg: str) -> bool:
        return self._recall.should_skip_memory(user_msg)


    def _should_store_user_memory(self, user_msg: str) -> bool:
        return self._recall.should_store_user_memory(user_msg)


    def _should_store_assistant_memory(self, assistant_text: str, user_msg: Optional[str] = None) -> bool:
        return self._recall.should_store_assistant_memory(assistant_text, user_msg=user_msg)


    def _should_retrieve_memory(self, user_msg: str) -> bool:
        return self._recall.should_retrieve_memory(user_msg)


    def _is_memory_recall_request(self, user_msg: str) -> bool:
        return self._recall.is_memory_recall_request(user_msg)


    @staticmethod
    def _looks_like_personal_fact_recall_request(msg: str) -> bool:
        return RecallEngine.looks_like_personal_fact_recall_request(msg)


    def _is_identity_recall_request(self, user_msg: str) -> bool:
        return self._recall.is_identity_recall_request(user_msg)


    @staticmethod
    def _is_review_recall_request(user_msg: str) -> bool:
        return RecallEngine.is_review_recall_request(user_msg)


    @staticmethod
    def _build_memory_group_ids(session_id: Optional[str], recall_request: bool) -> Optional[List[str]]:
        return RecallEngine.build_memory_group_ids(session_id, recall_request)


    def _review_group_ids(self, weeks: int = 4) -> Optional[List[str]]:
        return RecallEngine.review_group_ids(self.evermem_user_id, weeks=weeks)


    def _rank_recall_memories(self, memories: List[Dict], user_msg: str) -> List[Dict]:
        return self._recall.rank_recall_memories(memories, user_msg)


    def _finalize_recall_memories(self, memories: List[Dict], user_msg: str) -> List[Dict]:
        return self._recall.finalize_recall_memories(memories, user_msg)


    def _score_event_log_memory(self, content: str, user_msg: str, timestamp: Optional[str] = None) -> float:
        return self._recall.score_event_log_memory(content, user_msg, timestamp)


    def _score_review_memory(self, content: str, user_msg: str, timestamp: Optional[str] = None) -> float:
        return self._recall.score_review_memory(content, user_msg, timestamp)


    @staticmethod
    def _sort_memories_by_timestamp(memories: List[Dict]) -> List[Dict]:
        return RecallEngine.sort_memories_by_timestamp(memories)


    def _build_recent_session_fallback_memories(
        self,
        event_logs: List[Dict],
        user_msg: str,
        limit: int = 3,
    ) -> List[Dict]:
        return self._recall.build_recent_session_fallback_memories(
            event_logs, user_msg, limit=limit
        )


    async def _finalize_memory_turn(self, assistant_text: str, session_id: Optional[str], user_msg: Optional[str] = None) -> bool:
        """
        Finalize a turn so EverMem extracts pending messages into retrievable memories.
        We still store the assistant turn because the official API uses the completed
        conversation boundary to flush extraction.
        """
        if not self.evermem_service:
            return False

        if not self._should_store_assistant_memory(assistant_text, user_msg=user_msg):
            return False

        content = str(assistant_text or "").strip()

        try:
            result = await self.evermem_service.add_memory(
                content=content,
                user_id=self.evermem_user_id,
                sender="assistant",
                sender_name="Assistant",
                group_id=session_id,
                group_name=session_id,
                role="assistant",
                flush=True,
            )
            return result is not None
        except Exception as e:
            logger.error(f"[EverMem] Failed to finalize memory turn: {e}")
            return False

    async def _retrieve_relevant_memories(self, user_msg: str, session_id: Optional[str] = None) -> List[Dict]:
        """
        Retrieve semantic memories for the current turn.
        For explicit recall questions, combine episodic search with event-log
        retrieval so factual recall stays grounded in specific user messages.
        """
        if not self.evermem_service or not user_msg or not self._should_retrieve_memory(user_msg):
            return []

        recall_request = self._is_memory_recall_request(user_msg)
        logger.debug(
            f"[EverMem Recall Version] version={self._RECALL_DEBUG_VERSION} "
            f"recall_request={recall_request} session_id={session_id}"
        )
        min_score = 0.15 if recall_request else 0.3
        collected: List[Dict] = []
        queries = self._build_recall_search_queries(user_msg) if recall_request else [user_msg]
        raw_collected_count = 0
        scope_candidates: List[Optional[List[str]]] = []
        review_request = self._is_review_recall_request(user_msg)
        if review_request:
            review_group_ids = self._review_group_ids(weeks=4)
            primary_group_ids = review_group_ids if review_group_ids else None
        else:
            primary_group_ids = self._build_memory_group_ids(session_id, recall_request)
        if primary_group_ids:
            scope_candidates.append(primary_group_ids)
        if recall_request or not primary_group_ids:
            scope_candidates.append(None)

        debug_parts: List[str] = []

        for group_ids in scope_candidates:
            scoped_collected: List[Dict] = []
            scoped_raw_count = 0

            for query in queries:
                try:
                    search_min_score = 0.05 if recall_request and query != user_msg else min_score
                    # Dynamically select memory types based on detected intent.
                    # - Identity questions: also search user profile facts
                    # - Guidance/planning questions: also include past AI case solutions
                    # - Review recall: only episodic covers the compressed review records
                    if self._is_identity_recall_request(user_msg):
                        search_memory_types = ["episodic_memory", "profile"]
                    elif any(
                        pattern in user_msg.lower()
                        for pattern in self._MEMORY_GUIDANCE_PATTERNS
                    ) and not review_request:
                        search_memory_types = ["episodic_memory", "profile", "agent_case", "agent_skill", "foresight"]
                    else:
                        search_memory_types = ["episodic_memory", "agent_skill"]

                    method = "agentic" if recall_request else "hybrid"
                    try:
                        found = await self.evermem_service.search_memories(
                            query=query,
                            user_id=self.evermem_user_id,
                            min_score=search_min_score,
                            group_ids=group_ids,
                            memory_types=search_memory_types,
                            retrieve_method=method,
                            top_k=8,
                        )
                    except Exception as e:
                        if method == "agentic":
                            logger.warning(
                                f"[EverMem] Agentic retrieval failed or timed out: {e}. "
                                "Falling back to hybrid retrieval..."
                            )
                            found = await self.evermem_service.search_memories(
                                query=query,
                                user_id=self.evermem_user_id,
                                min_score=search_min_score,
                                group_ids=group_ids,
                                memory_types=search_memory_types,
                                retrieve_method="hybrid",
                                top_k=8,
                            )
                        else:
                            raise e

                    scoped_raw_count += len(found)
                    scoped_collected.extend(found)
                except Exception as e:
                    logger.error(f"[EverMem] Failed to retrieve memories for query '{query}': {e}")

            if recall_request:
                user_event_logs: List[Dict] = []
                if self._is_identity_recall_request(user_msg):
                    try:
                        profile_memories = await self.evermem_service.get_memories(
                            user_id=self.evermem_user_id,
                            group_ids=None,
                            memory_type="profile",
                            page_size=20,
                        )
                        scoped_raw_count += len(profile_memories)
                        for profile in profile_memories:
                            content = str(profile.get("content", "")).strip()
                            if not content:
                                continue
                            if self._looks_like_negative_identity_memory(content):
                                continue
                            scoped_collected.append({
                                "content": f"[用户画像] {content}" if not content.startswith("[用户画像]") else content,
                                "type": "profile",
                                "score": 6.0 + self._count_recall_term_matches(content, user_msg),
                                "group_id": profile.get("group_id"),
                                "timestamp": profile.get("timestamp"),
                            })
                    except Exception as e:
                        logger.error(f"[EverMem] Failed to retrieve profiles: {e}")
                try:
                    # v1 API: event_log is merged into episodic_memory.
                    # We pull recent episodic memories here to use as a fallback
                    # grounding source for explicit recall questions.
                    episodic_memories = await self.evermem_service.get_memories(
                        user_id=self.evermem_user_id,
                        group_ids=group_ids,
                        memory_type="episodic_memory",
                        page_size=60,
                    )
                    scoped_raw_count += len(episodic_memories)
                    review_like_events = 0
                    for event in episodic_memories:
                        content = str(event.get("content", "")).strip()
                        review_content = self._review_memory_text(event)
                        if not content:
                            continue
                        role = str(event.get("role", "")).lower()
                        sender_name = str(event.get("sender_name", "")).lower()
                        if role == "assistant" or "assistant" in sender_name:
                            continue
                        if self._looks_like_assistant_event(content):
                            continue
                        if self._looks_like_question_event(content):
                            if self._is_identity_recall_request(user_msg):
                                continue
                            user_event_logs.append(event)
                            continue
                        if review_request and not self._looks_like_review_memory(review_content):
                            continue
                        if review_request:
                            review_like_events += 1
                        if self._is_identity_recall_request(user_msg) and not self._looks_like_identity_memory(content):
                            continue
                        user_event_logs.append(event)
                        display_content = review_content if review_request else content
                        if not review_request and self._count_recall_term_matches(content, user_msg) < 1:
                            continue
                        scoped_collected.append({
                            "content": f"[记忆片段] {display_content}",
                            "type": "episodic_memory",
                            "score": (
                                self._score_review_memory(display_content, user_msg, event.get("timestamp"))
                                if review_request
                                else self._score_event_log_memory(content, user_msg, event.get("timestamp"))
                                + (1.5 if self._looks_like_user_fact(content) else 0.0)
                            ),
                            "group_id": event.get("group_id"),
                            "timestamp": event.get("timestamp"),
                        })
                    if review_request:
                        logger.debug(
                            f"[EverMem Review Recall] scope={group_ids or 'ALL'} "
                            f"review_like_events={review_like_events}"
                        )
                except Exception as e:
                    logger.error(f"[EverMem] Failed to retrieve episodic memories: {e}")

            raw_collected_count += scoped_raw_count

            if recall_request:
                finalized = self._finalize_recall_memories(scoped_collected, user_msg)
                if not finalized and user_event_logs:
                    finalized = self._build_recent_session_fallback_memories(user_event_logs, user_msg)
                debug_parts.append(
                    f"scope={group_ids or 'ALL'} raw={scoped_raw_count} deduped={len(finalized)} "
                    f"results={self._summarize_memories_for_log(finalized)}"
                )
                logger.debug(
                    f"[EverMem Recall Scope] version={self._RECALL_DEBUG_VERSION} "
                    f"scope={group_ids or 'ALL'} search_plus_get={scoped_raw_count} "
                    f"scoped_collected={len(scoped_collected)} user_event_logs={len(user_event_logs)} "
                    f"finalized={len(finalized)}"
                )
                if finalized:
                    logger.debug(
                        f"[EverMem Recall Debug] queries={queries} scopes={debug_parts}"
                    )
                    return finalized
            else:
                collected.extend(scoped_collected)

        if recall_request:
            logger.debug(f"[EverMem Recall Debug] queries={queries} scopes={debug_parts}")
            return []

        deduped: List[Dict] = []
        seen = set()
        for memory in collected:
            content = str(memory.get("content", "")).strip()
            normalized_content = self._normalize_memory_content(content)
            if not normalized_content or normalized_content in seen:
                continue
            seen.add(normalized_content)
            deduped.append(memory)

        return deduped

    async def _prepare_evermem_context(
        self,
        messages: List[Dict],
        context_word: str = "",
        session_id: str = None,
        learning_context: str = "",
        attachments: Optional[List[Dict]] = None,
        stream_label: str = "EverMem",
    ) -> tuple:
        """
        Shared EverMem preparation for chat() and chat_stream().

        Returns:
            (system_prompt, last_user_msg, user_memory_saved, memories_retrieved)
        """
        system_prompt = "你是一位友好的英语口语老师，帮助学生练习英语对话。用简单易懂的英语回复，并在适当时候纠正语法错误。"

        memories_retrieved = 0
        user_memory_saved = False
        last_user_msg = None

        if self.evermem_service:
            system_prompt += (
                "\n\n你拥有长期记忆能力，能记住用户过去分享的信息和学习记录。"
                "记忆中可能包含用户的单词复习记录（含评分和薄弱点），请优先把相关记忆转化为个性化教学建议、举例或纠错。"
                "如果记忆与当前问题直接相关，至少使用其中一条具体事实来定制回答；如果不相关，就忽略。"
                "不要编造记忆内容，也不要主动提及你在使用记忆系统，除非用户明确询问。"
            )
            last_user_msg = next((self._extract_text_content(m['content']) for m in reversed(messages) if m['role'] == 'user'), None)

            if last_user_msg:
                # Step 1: Persist the user message before retrieval
                if self._should_store_user_memory(last_user_msg):
                    save_result = await self.evermem_service.add_memory(
                        content=last_user_msg,
                        user_id=self.evermem_user_id,
                        sender=self.evermem_user_id,
                        sender_name="User",
                        group_id=session_id,
                        group_name=session_id,
                        role="user",
                        attachments=attachments,
                        flush=True if attachments else False,
                    )
                    user_memory_saved = save_result is not None
                else:
                    logger.warning(f"[{stream_label}] Skipped saving low-signal user message: '{last_user_msg}'")

                # Step 2: Retrieve context (skip only for trivial messages)
                if self._should_retrieve_memory(last_user_msg):
                    memories = await self._retrieve_relevant_memories(last_user_msg, session_id=session_id)
                    if memories:
                        memories_retrieved = len(memories)
                        memory_context = self._format_memory_context(
                            memories,
                            prefer_recent=self._is_memory_recall_request(last_user_msg)
                        )
                        if memory_context:
                            system_prompt += (
                                "\n\n【与当前问题相关的长期记忆】\n"
                                f"{memory_context}\n"
                                "请先判断哪些记忆与当前问题最相关，再把最相关的内容自然融入回复。"
                            )
                            if self._is_memory_recall_request(last_user_msg):
                                system_prompt += (
                                    "\n如果用户正在询问你记得什么、之前聊过什么，"
                                    "请优先总结精确的历史事实，必要时直接列点回答；"
                                    "不要先讲泛化画像，也不要泛泛地说你没有记录，"
                                    "除非上面的长期记忆确实为空。"
                                )
                        logger.debug(
                            f"[{stream_label}] Injected {memories_retrieved} memories "
                            f"(recall_request={self._is_memory_recall_request(last_user_msg)}): "
                            f"{self._summarize_memories_for_log(memories)}"
                        )
                else:
                    logger.warning(f"[{stream_label}] Skipped retrieval for low-value message: '{last_user_msg}'")

        if context_word:
            system_prompt += f"\n\n今天的学习单词是 '{context_word}'，请在对话中自然地使用这个单词，帮助学生加深印象。"
        if learning_context:
            system_prompt += (
                "\n\n【当前复习薄弱点】\n"
                f"{learning_context}\n"
                "如果当前问题适合结合用户正在复习或容易遗忘的单词，请优先围绕这些单词给出例句、提问、解释或纠错。"
                "如果当前问题与单词学习无关，就不要强行提及。"
            )

        return system_prompt, last_user_msg, user_memory_saved, memories_retrieved

    async def chat(
        self,
        messages: List[Dict],
        context_word: str = "",
        session_id: str = None,
        learning_context: str = "",
        enable_thinking: Optional[bool] = None,
        attachments: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        AI 对话练习 (optimized with EverMemOS official pattern)

        Flow: Store user msg → Retrieve context → Generate response → Store assistant msg

        Args:
            messages: 对话历史
            context_word: 当前学习的单词（可选）
            session_id: The ID of the current chat session (optional)
            learning_context: Local review weakness summary (optional)

        Returns:
            Dict with 'response', 'memories_retrieved', 'memory_saved'
        """
        system_prompt, last_user_msg, user_memory_saved, memories_retrieved = (
            await self._prepare_evermem_context(
                messages, context_word, session_id, learning_context, attachments,
                stream_label="EverMem",
            )
        )

        try:
            # Step 3: Generate response
            response = await self._call_llm([
                {"role": "system", "content": system_prompt},
                *messages
            ], enable_thinking=enable_thinking)

            finalized = await self._finalize_memory_turn(response, session_id=session_id, user_msg=last_user_msg)
            if finalized:
                logger.info(f"[EverMem] Finalized memory turn for session {session_id or 'ALL'}")
            memory_saved = user_memory_saved and finalized

            return {
                "text": response,
                "memories_retrieved": memories_retrieved,
                "memory_saved": memory_saved
            }

        except Exception as e:
            logger.error(f"Chat error: {e}")
            return {
                "text": "Sorry, I encountered an error. Please try again.",
                "memories_retrieved": 0,
                "memory_saved": False
            }

    async def chat_stream(
        self,
        messages: List[Dict],
        context_word: str = "",
        session_id: str = None,
        learning_context: str = "",
        enable_thinking: Optional[bool] = None,
        attachments: Optional[List[Dict]] = None,
    ):
        """
        AI 对话练习 (流式输出)
        Flow: Store user msg → Retrieve context → Stream response → Store assistant msg
        """
        import json

        system_prompt, last_user_msg, user_memory_saved, memories_retrieved = (
            await self._prepare_evermem_context(
                messages, context_word, session_id, learning_context, attachments,
                stream_label="EverMem Stream",
            )
        )

        full_response = ""
        try:
            # Step 3: Stream response
            payload_messages = [{"role": "system", "content": system_prompt}] + messages
            async for event in self._call_llm_stream(payload_messages, enable_thinking=enable_thinking):
                if not isinstance(event, dict):
                    continue
                event_type = event.get("type")
                event_content = event.get("content", "")
                if not isinstance(event_content, str):
                    event_content = str(event_content)

                if event_type == "reasoning":
                    yield f"data: {json.dumps({'type': 'reasoning', 'content': event_content})}\n\n"
                    continue

                full_response += event_content
                yield f"data: {json.dumps({'type': 'token', 'content': event_content})}\n\n"

            finalized = await self._finalize_memory_turn(full_response, session_id=session_id, user_msg=last_user_msg)
            if finalized:
                logger.info(f"[EverMem Stream] Finalized memory turn for session {session_id or 'ALL'}")
            memory_saved = user_memory_saved and finalized

            # Yield final metadata
            yield f"data: {json.dumps({'type': 'done', 'memories_retrieved': memories_retrieved, 'memory_saved': memory_saved})}\n\n"

        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            error_msg = "Sorry, I encountered an error."
            yield f"data: {json.dumps({'type': 'token', 'content': error_msg})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'memories_retrieved': memories_retrieved, 'memory_saved': memory_saved})}\n\n"
    
    async def evaluate_pronunciation(self, word: str, audio_base64: str) -> Dict:
        """
        发音评测（需要 OpenAI Whisper）
        
        Args:
            word: 目标单词
            audio_base64: Base64 编码的音频
        
        Returns:
            评测结果
        """
        # This is a placeholder - actual implementation would use Whisper API
        # For now, return a mock result
        return {
            "word": word,
            "recognized_text": word,  # Would be from Whisper
            "score": 85,
            "feedback": "发音基本正确，注意重音位置。",
            "phonetic_issues": []
        }

    async def translate(self, text: str, source_lang: str, target_lang: str) -> Tuple[str, str]:
        """
        AI 翻译
        
        Args:
            text: 源文本
            source_lang: 源语言
            target_lang: 目标语言
            
        Returns:
            翻译结果
        """
        def _looks_like_prompt_leak(content: str) -> bool:
            leaked_markers = [
                "要求：",
                "要求:",
                "文本：",
                "文本:",
                "只输出翻译后的文本",
                "SOURCE_TEXT_START",
                "SOURCE_TEXT_END",
                "请将以下文本从"
            ]
            return any(marker in content for marker in leaked_markers)

        def _clean_translation(content: str) -> str:
            cleaned = content.strip().strip("`").strip()
            cleaned = re.sub(r"^\s*(翻译结果|translation)\s*[:：]\s*", "", cleaned, flags=re.IGNORECASE)
            return cleaned.strip()

        no_think_suffix = "\n/no_think" if self.provider == "dashscope" and "qwen" in (self.model or "").lower() else ""

        prompt = (
            f"请将下面的原文从{source_lang}翻译成{target_lang}。\n"
            "只返回译文，不要解释，不要重复题目。\n\n"
            "如果原文包含代码、HTML/JSX 标签、属性名、变量名、className，请保持这些代码结构原样不变，只翻译自然语言文本。\n"
            "不要输出 Markdown 代码围栏。\n\n"
            "SOURCE_TEXT_START\n"
            f"{text}\n"
            f"SOURCE_TEXT_END{no_think_suffix}"
        )
        
        try:
            messages = [
                {"role": "system", "content": "你是一位专业的翻译助手。"},
                {"role": "user", "content": prompt}
            ]
            content = await self._call_llm(messages, temperature=0.2, enable_thinking=False)
            cleaned = _clean_translation(content)

            # 某些模型会把提示词原样吐出，检测到后重试一次
            if not cleaned or _looks_like_prompt_leak(cleaned):
                retry_prompt = (
                    f"仅输出{target_lang}译文。禁止输出“要求/文本/说明”等词。\n"
                    "代码与标签原样保留，仅翻译自然语言。\n"
                    "SOURCE_TEXT_START\n"
                    f"{text}\n"
                    "SOURCE_TEXT_END"
                )
                retry_content = await self._call_llm([
                    {"role": "system", "content": "你是翻译引擎，只输出译文。"},
                    {"role": "user", "content": f"{retry_prompt}{no_think_suffix}"}
                ], temperature=0.0, enable_thinking=False)
                retry_cleaned = _clean_translation(retry_content)
                if retry_cleaned:
                    cleaned = retry_cleaned

            if not cleaned:
                return "翻译失败，请稍后重试。", ""

            return cleaned, ""
            
        except Exception as e:
            logger.error(f"Translate error: {e}")
            return "翻译失败，请稍后重试。", ""

    async def test_connection(self) -> Dict:
        """
        测试 AI 连接

        Returns:
            Dict with 'success', 'message', and optional 'details'
        """
        config = self._get_client_config()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{config['base_url']}/chat/completions",
                    headers=config['headers'],
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": "Hello, please reply with 'OK' if you can hear me."}],
                        "temperature": 0.1
                    }
                )
                if response.status_code != 200:
                    error_body = response.text[:200]
                    return {
                        "success": False,
                        "message": f"API 返回 {response.status_code}",
                        "details": f"Provider: {self.provider}, Model: {self.model}\n{error_body}"
                    }
                data = response.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if content and len(content.strip()) > 0:
                    return {
                        "success": True,
                        "message": "连接成功！",
                        "details": f"AI 响应: {content[:50]}..."
                    }
                else:
                    return {
                        "success": False,
                        "message": "AI 响应为空",
                        "details": f"Provider: {self.provider}, Model: {self.model}\n响应: {str(data)[:200]}"
                    }
        except Exception as e:
            return {
                "success": False,
                "message": f"连接失败: {str(e)}",
                "details": f"Provider: {self.provider}, Base: {self.api_base}, Model: {self.model}"
            }
