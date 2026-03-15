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


class AIService:
    """AI 服务封装，支持多 Provider 切换"""
    _RECALL_DEBUG_VERSION = "2026-03-15-recall-v4"
    _RECALL_HINT_PATTERNS = (
        "remember",
        "remind me",
        "what did we talk",
        "what did i tell",
        "what do you remember",
        "do you remember",
        "previous chat",
        "last time",
        "earlier",
        "before",
        "mentioned before",
        "还记得",
        "记得我",
        "记不记得",
        "之前说",
        "之前聊",
        "上次说",
        "上次聊",
        "刚才说",
        "前面说",
        "我说过",
        "我们聊过",
    )
    _RECALL_TERM_EXPANSIONS = {
        "march 15": ("march 15", "march 15th", "3.15", "315", "消费者权益", "consumer rights"),
        "3.15": ("march 15", "march 15th", "3.15", "315", "消费者权益", "consumer rights"),
        "suancai": ("suancai", "酸菜", "pickled vegetable", "pickled vegetables"),
        "pickled vegetable": ("suancai", "酸菜", "pickled vegetable", "pickled vegetables"),
        "pickled vegetables": ("suancai", "酸菜", "pickled vegetable", "pickled vegetables"),
        "ham sausage": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
        "ham sausages": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
        "sausage": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
        "sausages": ("ham sausage", "ham sausages", "sausage", "sausages", "火腿肠"),
    }
    _ASSISTANT_SUMMARY_PATTERNS = (
        "assistant responded",
        "assistant confirmed",
        "assistant provided",
        "assistant invited",
        "assistant clarified",
        "assistant's ",
        "assistant ",
        "the assistant ",
        "助理",
        "助手",
    )
    _QUESTION_EVENT_PATTERNS = (
        "the user asked",
        "the user wondered",
        "the user questioned",
        "the user inquired",
        "asked what",
        "asked whether",
        "asked if",
        "asked who",
        "asked when",
        "asked where",
        "asked why",
        "asked how",
        "asked about",
    )
    _ASSISTANT_EVENT_PATTERNS = (
        "the assistant ",
        "assistant said",
        "assistant asked",
        "assistant provided",
        "assistant complimented",
        "assistant explained",
        "assistant noted",
        "assistant suggested",
        "assistant stated",
        "assistant invited",
        "assistant responded",
        "assistant clarified",
    )
    _USER_FACT_PATTERNS = (
        "the user said",
        "the user mentioned",
        "the user remembered",
        "the user recalled",
        "the user told",
        "the user shared",
        "the user noted",
        "the user explained",
    )
    _RECALL_STOPWORDS = {
        "what",
        "did",
        "tell",
        "you",
        "about",
        "that",
        "remember",
        "remembered",
        "earlier",
        "before",
        "when",
        "talked",
        "talking",
        "issue",
        "issues",
        "only",
        "mentioned",
        "mention",
        "said",
        "saying",
        "recall",
        "recalled",
        "conversation",
        "conversations",
        "chat",
        "chats",
        "march",
        "last",
        "time",
        "previous",
        "history",
        "records",
    }
    
    def __init__(self, provider: str = None, api_key: str = None, model: str = None, api_base: str = None,
                 evermem_enabled: bool = False, evermem_url: str = None, evermem_key: str = None,
                 evermem_user_id: str = "guest"):
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
        self.provider = provider or env_provider

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
        self.evermem_service = None
        if self.evermem_enabled and evermem_key:
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
            return {
                "base_url": self.api_base or "https://generativelanguage.googleapis.com/v1beta",
                "headers": {}
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
    
    async def _call_llm(self, messages: List[Dict], temperature: float = 0.7) -> str:
        """调用 LLM API"""
        config = self._get_client_config()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            if self.provider in ["openai", "custom", "dashscope", "ollama"]:
                try:
                    payload = {
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature
                    }
                    if self.provider == "ollama":
                        payload["think"] = True
                    response = await client.post(
                        f"{config['base_url']}/chat/completions",
                        headers=config['headers'],
                        json=payload
                    )
                    response.raise_for_status()
                    data = response.json()
                    return data.get("choices", [{}])[0].get("message", {}).get("content", "")
                except Exception as e:
                    print(f"LLM API Error: {e}")
                    if 'response' in locals():
                        print(f"Response status: {response.status_code}")
                        print(f"Response content: {response.text}")
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

    async def _call_llm_stream(self, messages: List[Dict], temperature: float = 0.7):
        """流式调用 LLM API"""
        config = self._get_client_config()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            if self.provider in ["openai", "custom", "dashscope", "ollama"]:
                try:
                    payload = {
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature,
                        "stream": True  # Enable streaming
                    }
                    if self.provider == "ollama":
                        payload["think"] = True
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
                    print(f"LLM Stream API Error: {e}")
                    yield {"type": "token", "content": ""}
            
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
            print(f"Generate sentences error: {e}")
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
            print(f"Generate memory tips error: {e}")
            return {}
            
    # Lightweight skip-list for trivial messages that don't need memory retrieval
    _SKIP_PATTERNS = {
        # Greetings
        "你好", "hello", "hi", "hey", "嗨", "哈喽", "早上好", "晚上好", "下午好",
        # Acknowledgments
        "好的", "ok", "okay", "嗯", "嗯嗯", "好", "行", "可以", "明白", "了解",
        "谢谢", "thanks", "thank you", "thx", "感谢", "多谢",
        # Reactions
        "哈哈", "哈哈哈", "lol", "😂", "👍", "666", "厉害", "不错",
        "太棒了", "棒", "nice", "great", "cool", "wow",
        # Farewells
        "再见", "拜拜", "bye", "晚安", "good night",
    }

    @staticmethod
    def _normalize_memory_content(content: str) -> str:
        return re.sub(r"^\[[^\]]+\]\s*", "", str(content or "")).strip()

    @staticmethod
    def _extract_recall_search_terms(user_msg: str) -> List[str]:
        msg = user_msg.strip().lower()
        if not msg:
            return []

        terms = set()
        for phrase, expansions in AIService._RECALL_TERM_EXPANSIONS.items():
            if phrase in msg:
                terms.update(expansions)

        for token in re.findall(r"[a-z0-9\.]{3,}", msg):
            if token in AIService._RECALL_STOPWORDS:
                continue
            terms.add(token)

        for token in re.findall(r"[\u4e00-\u9fff]{1,6}", user_msg):
            if token not in {"之前", "记得", "前面", "刚才", "上次"}:
                terms.add(token)

        return sorted(terms, key=len, reverse=True)

    @staticmethod
    def _build_recall_search_queries(user_msg: str) -> List[str]:
        terms = AIService._extract_recall_search_terms(user_msg)
        queries: List[str] = []

        normalized_original = user_msg.strip()
        if normalized_original:
            queries.append(normalized_original)

        focused_terms = [term for term in terms if len(term) >= 5 or re.search(r"[\u4e00-\u9fff]", term)]
        if focused_terms:
            queries.append(" ".join(focused_terms[:6]))

        queries.extend(focused_terms[:4])

        deduped_queries: List[str] = []
        seen = set()
        for query in queries:
            normalized = query.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped_queries.append(query.strip())
        return deduped_queries

    @staticmethod
    def _count_recall_term_matches(content: str, user_msg: str) -> int:
        normalized_content = AIService._normalize_memory_content(content).lower()
        terms = AIService._extract_recall_search_terms(user_msg)
        return sum(1 for term in terms if term.lower() in normalized_content)

    @staticmethod
    def _looks_like_assistant_summary(content: str) -> bool:
        normalized = AIService._normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in AIService._ASSISTANT_SUMMARY_PATTERNS)

    @staticmethod
    def _looks_like_question_event(content: str) -> bool:
        normalized = AIService._normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in AIService._QUESTION_EVENT_PATTERNS)

    @staticmethod
    def _looks_like_assistant_event(content: str) -> bool:
        normalized = AIService._normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in AIService._ASSISTANT_EVENT_PATTERNS)

    @staticmethod
    def _looks_like_user_fact(content: str) -> bool:
        normalized = AIService._normalize_memory_content(content).lower()
        return any(pattern in normalized for pattern in AIService._USER_FACT_PATTERNS)

    @staticmethod
    def _format_memory_context(memories: List[Dict], prefer_recent: bool = False) -> str:
        """
        Format retrieved memories into a compact, high-signal block for the model.
        We keep only the most relevant snippets and cap length to reduce prompt dilution.
        """
        if not memories:
            return ""

        def memory_rank(item: Dict) -> tuple[int, float]:
            memory_type = str(item.get("type", ""))
            score = float(item.get("score", 0.0))
            if not prefer_recent:
                return (0, -score)

            priority = {
                "event_log": 0,
                "recent_memory": 1,
                "episodic_memory": 2,
                "history": 2,
                "foresight": 2,
                "profile": 3,
            }.get(memory_type, 2)
            return (priority, -score)

        ranked_memories = sorted(memories, key=memory_rank)[:5]

        lines = []
        for index, memory in enumerate(ranked_memories, start=1):
            score = float(memory.get("score", 0.0))
            content = str(memory.get("content", "")).strip()
            if not content:
                continue
            if len(content) > 220:
                content = f"{content[:217].rstrip()}..."
            lines.append(f"{index}. (score={score:.2f}) {content}")

        return "\n".join(lines)

    @staticmethod
    def _summarize_memories_for_log(memories: List[Dict], limit: int = 5) -> str:
        if not memories:
            return "[]"

        parts = []
        for memory in memories[:limit]:
            memory_type = str(memory.get("type", "unknown"))
            score = float(memory.get("score", 0.0))
            content = str(memory.get("content", "")).strip().replace("\n", " ")
            if len(content) > 120:
                content = f"{content[:117].rstrip()}..."
            parts.append(f"{memory_type}@{score:.2f}: {content}")
        return " | ".join(parts)

    def _should_skip_memory(self, user_msg: str) -> bool:
        """
        Lightweight local check to skip memory retrieval for trivial messages.
        Zero LLM cost. Returns True if retrieval should be skipped.
        """
        msg = user_msg.strip().lower().rstrip("!！~.。？?")
        # Very short messages are almost always trivial
        if len(msg) <= 2:
            return True
        # Check against known trivial patterns
        if msg in self._SKIP_PATTERNS:
            return True
        return False

    def _is_memory_recall_request(self, user_msg: str) -> bool:
        """Detect prompts that explicitly ask the assistant to recall prior facts."""
        msg = user_msg.strip().lower()
        if not msg:
            return False
        return any(pattern in msg for pattern in self._RECALL_HINT_PATTERNS)

    def _build_memory_group_ids(self, session_id: Optional[str], recall_request: bool) -> Optional[List[str]]:
        if not session_id:
            return None
        if recall_request:
            return [session_id]
        return [session_id]

    @staticmethod
    def _rank_recall_memories(memories: List[Dict]) -> List[Dict]:
        def sort_key(item: Dict) -> tuple[int, int, float]:
            memory_type = str(item.get("type", ""))
            priority = {
                "event_log": 0,
                "episodic_memory": 1,
                "history": 1,
                "recent_memory": 2,
                "foresight": 3,
                "profile": 4,
            }.get(memory_type, 3)
            term_matches = int(item.get("term_matches", 0))
            score = float(item.get("score", 0.0))
            return (priority, -term_matches, -score)

        return sorted(memories, key=sort_key)

    def _finalize_recall_memories(self, memories: List[Dict], user_msg: str) -> List[Dict]:
        deduped: List[Dict] = []
        seen = set()
        for memory in memories:
            content = str(memory.get("content", "")).strip()
            normalized_content = self._normalize_memory_content(content)
            if not normalized_content or normalized_content in seen:
                continue
            seen.add(normalized_content)
            enriched = dict(memory)
            enriched["term_matches"] = self._count_recall_term_matches(content, user_msg)
            deduped.append(enriched)

        non_profile_memories = [memory for memory in deduped if str(memory.get("type", "")) != "profile"]
        if non_profile_memories:
            deduped = non_profile_memories

        strongly_matching = [memory for memory in deduped if int(memory.get("term_matches", 0)) >= 1]
        if strongly_matching:
            deduped = strongly_matching
        elif deduped:
            return []

        user_like_memories = [
            memory for memory in deduped
            if not self._looks_like_assistant_summary(str(memory.get("content", "")))
        ]
        if user_like_memories:
            deduped = user_like_memories

        return self._rank_recall_memories(deduped)

    def _score_event_log_memory(self, content: str, user_msg: str, timestamp: Optional[str] = None) -> float:
        score = 2.0 + self._count_recall_term_matches(content, user_msg) * 1.5
        if timestamp:
            try:
                parsed = datetime.datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
                age_days = max(0.0, (datetime.datetime.now(datetime.timezone.utc) - parsed).total_seconds() / 86400)
                score += max(0.0, 1.0 - min(age_days, 30.0) / 30.0)
            except Exception:
                pass
        return score

    @staticmethod
    def _sort_memories_by_timestamp(memories: List[Dict]) -> List[Dict]:
        def sort_key(item: Dict) -> float:
            timestamp = item.get("timestamp")
            if not timestamp:
                return float("-inf")
            try:
                parsed = datetime.datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
                return parsed.timestamp()
            except Exception:
                return float("-inf")

        return sorted(memories, key=sort_key, reverse=True)

    def _build_recent_session_fallback_memories(
        self,
        event_logs: List[Dict],
        user_msg: str,
        limit: int = 3,
    ) -> List[Dict]:
        """
        When the user asks a vague follow-up inside the same live session,
        recent user event logs are more useful than returning nothing.
        """
        fallback_candidates: List[Dict] = []
        normalized_user_msg = self._normalize_memory_content(user_msg).lower()

        for event in self._sort_memories_by_timestamp(event_logs):
            content = str(event.get("content", "")).strip()
            if not content:
                continue
            normalized_content = self._normalize_memory_content(content).lower()
            if normalized_content == normalized_user_msg:
                continue
            if self._should_skip_memory(content):
                continue
            if self._looks_like_assistant_summary(content):
                continue
            if self._looks_like_question_event(content):
                continue
            if self._looks_like_assistant_event(content):
                continue
            fallback_candidates.append({
                "content": f"[事件记录] {content}",
                "type": "event_log",
                "score": self._score_event_log_memory(content, user_msg, event.get("timestamp"))
                + (1.5 if self._looks_like_user_fact(content) else 0.0),
                "group_id": event.get("group_id"),
                "timestamp": event.get("timestamp"),
                "term_matches": self._count_recall_term_matches(content, user_msg),
            })
            if len(fallback_candidates) >= limit:
                break

        return fallback_candidates

    async def _finalize_memory_turn(self, assistant_text: str, session_id: Optional[str]) -> bool:
        """
        Finalize a turn so EverMem extracts pending messages into retrievable memories.
        We still store the assistant turn because the official API uses the completed
        conversation boundary to flush extraction.
        """
        if not self.evermem_service:
            return False

        content = str(assistant_text or "").strip()
        if not content or content == "Sorry, I encountered an error.":
            return False

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
            print(f"[EverMem] Failed to finalize memory turn: {e}")
            return False

    async def _retrieve_relevant_memories(self, user_msg: str, session_id: Optional[str] = None) -> List[Dict]:
        """
        Retrieve semantic memories for the current turn.
        For explicit recall questions, combine episodic search with event-log
        retrieval so factual recall stays grounded in specific user messages.
        """
        if not self.evermem_service or not user_msg or self._should_skip_memory(user_msg):
            return []

        recall_request = self._is_memory_recall_request(user_msg)
        print(
            f"[EverMem Recall Version] version={self._RECALL_DEBUG_VERSION} "
            f"recall_request={recall_request} session_id={session_id}"
        )
        min_score = 0.15 if recall_request else 0.3
        collected: List[Dict] = []
        queries = self._build_recall_search_queries(user_msg) if recall_request else [user_msg]
        raw_collected_count = 0
        scope_candidates: List[Optional[List[str]]] = []
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
                    found = await self.evermem_service.search_memories(
                        query=query,
                        user_id=self.evermem_user_id,
                        min_score=search_min_score,
                        group_ids=group_ids,
                        memory_types=["episodic_memory"],
                        retrieve_method="rrf" if recall_request else "hybrid",
                        top_k=8,
                    )
                    scoped_raw_count += len(found)
                    scoped_collected.extend(found)
                except Exception as e:
                    print(f"[EverMem] Failed to retrieve memories for query '{query}': {e}")

            if recall_request:
                user_event_logs: List[Dict] = []
                try:
                    event_logs = await self.evermem_service.get_memories(
                        user_id=self.evermem_user_id,
                        group_ids=group_ids,
                        memory_type="event_log",
                        page_size=100,
                    )
                    scoped_raw_count += len(event_logs)
                    for event in event_logs:
                        content = str(event.get("content", "")).strip()
                        if not content:
                            continue
                        role = str(event.get("role", "")).lower()
                        sender_name = str(event.get("sender_name", "")).lower()
                        if role == "assistant" or "assistant" in sender_name:
                            continue
                        if self._looks_like_assistant_event(content):
                            continue
                        if self._looks_like_question_event(content):
                            user_event_logs.append(event)
                            continue
                        user_event_logs.append(event)
                        if self._count_recall_term_matches(content, user_msg) < 1:
                            continue
                        scoped_collected.append({
                            "content": f"[事件记录] {content}",
                            "type": "event_log",
                            "score": self._score_event_log_memory(content, user_msg, event.get("timestamp"))
                            + (1.5 if self._looks_like_user_fact(content) else 0.0),
                            "group_id": event.get("group_id"),
                            "timestamp": event.get("timestamp"),
                        })
                except Exception as e:
                    print(f"[EverMem] Failed to retrieve event logs: {e}")

            raw_collected_count += scoped_raw_count

            if recall_request:
                finalized = self._finalize_recall_memories(scoped_collected, user_msg)
                if not finalized and user_event_logs:
                    finalized = self._build_recent_session_fallback_memories(user_event_logs, user_msg)
                debug_parts.append(
                    f"scope={group_ids or 'ALL'} raw={scoped_raw_count} deduped={len(finalized)} "
                    f"results={self._summarize_memories_for_log(finalized)}"
                )
                print(
                    f"[EverMem Recall Scope] version={self._RECALL_DEBUG_VERSION} "
                    f"scope={group_ids or 'ALL'} search_plus_get={scoped_raw_count} "
                    f"scoped_collected={len(scoped_collected)} user_event_logs={len(user_event_logs)} "
                    f"finalized={len(finalized)}"
                )
                if finalized:
                    print(
                        f"[EverMem Recall Debug] queries={queries} scopes={debug_parts}"
                    )
                    return finalized
            else:
                collected.extend(scoped_collected)

        if recall_request:
            print(f"[EverMem Recall Debug] queries={queries} scopes={debug_parts}")
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

    async def chat(self, messages: List[Dict], context_word: str = "", session_id: str = None) -> Dict:
        """
        AI 对话练习 (optimized with EverMemOS official pattern)
        
        Flow: Store user msg → Retrieve context → Generate response → Store assistant msg
        
        Args:
            messages: 对话历史
            context_word: 当前学习的单词（可选）
            session_id: The ID of the current chat session (optional)
        
        Returns:
            Dict with 'response', 'memories_retrieved', 'memory_saved'
        """
        import asyncio as _asyncio

        system_prompt = "你是一位友好的英语口语老师，帮助学生练习英语对话。用简单易懂的英语回复，并在适当时候纠正语法错误。"
        
        memories_retrieved = 0
        memory_saved = False
        last_user_msg = None
        
        # EverMemOS integration (official pattern: store → retrieve → generate → store)
        if self.evermem_service:
            system_prompt += (
                "\n\n你拥有长期记忆能力，能记住用户过去分享的信息和学习记录。"
                "记忆中可能包含用户的单词复习记录（含评分和薄弱点），请优先把相关记忆转化为个性化教学建议、举例或纠错。"
                "如果记忆与当前问题直接相关，至少使用其中一条具体事实来定制回答；如果不相关，就忽略。"
                "不要编造记忆内容，也不要主动提及你在使用记忆系统，除非用户明确询问。"
            )
            last_user_msg = next((self._extract_text_content(m['content']) for m in reversed(messages) if m['role'] == 'user'), None)
            
            if last_user_msg:
                # Step 1: Persist the user message before retrieval so recall can
                # reliably see the latest confirmed facts instead of a pending task.
                save_result = await self.evermem_service.add_memory(
                    content=last_user_msg,
                    user_id=self.evermem_user_id,
                    sender=self.evermem_user_id,
                    sender_name="User",
                    group_id=session_id,
                    group_name=session_id,
                    role="user",
                )
                memory_saved = save_result is not None

                # Step 2: Retrieve context (skip only for trivial messages)
                if not self._should_skip_memory(last_user_msg):
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
                        print(
                            f"[EverMem] Injected {memories_retrieved} memories "
                            f"(recall_request={self._is_memory_recall_request(last_user_msg)}): "
                            f"{self._summarize_memories_for_log(memories)}"
                        )
                else:
                    print(f"[EverMem] Skipped retrieval for trivial message: '{last_user_msg}'")

        if context_word:
            system_prompt += f"\n\n今天的学习单词是 '{context_word}'，请在对话中自然地使用这个单词，帮助学生加深印象。"
        
        try:
            # Step 3: Generate response
            response = await self._call_llm([
                {"role": "system", "content": system_prompt},
                *messages
            ])

            finalized = await self._finalize_memory_turn(response, session_id=session_id)
            if finalized:
                print(f"[EverMem] Finalized memory turn for session {session_id or 'ALL'}")

            return {
                "text": response,
                "memories_retrieved": memories_retrieved,
                "memory_saved": memory_saved
            }

        except Exception as e:
            print(f"Chat error: {e}")
            return {
                "text": "Sorry, I encountered an error. Please try again.",
                "memories_retrieved": 0,
                "memory_saved": False
            }

    async def chat_stream(self, messages: List[Dict], context_word: str = "", session_id: str = None):
        """
        AI 对话练习 (流式输出)
        Flow: Store user msg → Retrieve context → Stream response → Store assistant msg
        """
        import asyncio as _asyncio
        import json

        system_prompt = "你是一位友好的英语口语老师，帮助学生练习英语对话。用简单易懂的英语回复，并在适当时候纠正语法错误。"
        
        memories_retrieved = 0
        memory_saved = False
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
                # Step 1: Persist the user message before retrieval so recall can
                # reliably see the latest confirmed facts instead of a pending task.
                save_result = await self.evermem_service.add_memory(
                    content=last_user_msg,
                    user_id=self.evermem_user_id,
                    sender=self.evermem_user_id,
                    sender_name="User",
                    group_id=session_id,
                    group_name=session_id,
                    role="user",
                )
                memory_saved = save_result is not None

                # Step 2: Retrieve context
                if not self._should_skip_memory(last_user_msg):
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
                        print(
                            f"[EverMem Stream] Injected {memories_retrieved} memories "
                            f"(recall_request={self._is_memory_recall_request(last_user_msg)}): "
                            f"{self._summarize_memories_for_log(memories)}"
                        )
                else:
                    print(f"[EverMem Stream] Skipped retrieval for trivial message: '{last_user_msg}'")

        if context_word:
            system_prompt += f"\n\n今天的学习单词是 '{context_word}'，请在对话中自然地使用这个单词，帮助学生加深印象。"
        
        full_response = ""
        try:
            # Step 3: Stream response
            payload_messages = [{"role": "system", "content": system_prompt}] + messages
            async for event in self._call_llm_stream(payload_messages):
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

            finalized = await self._finalize_memory_turn(full_response, session_id=session_id)
            if finalized:
                print(f"[EverMem Stream] Finalized memory turn for session {session_id or 'ALL'}")

            # Yield final metadata
            yield f"data: {json.dumps({'type': 'done', 'memories_retrieved': memories_retrieved, 'memory_saved': memory_saved})}\n\n"

        except Exception as e:
            print(f"Chat stream error: {e}")
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

        prompt = (
            f"请将下面的原文从{source_lang}翻译成{target_lang}。\n"
            "只返回译文，不要解释，不要重复题目。\n\n"
            "如果原文包含代码、HTML/JSX 标签、属性名、变量名、className，请保持这些代码结构原样不变，只翻译自然语言文本。\n"
            "不要输出 Markdown 代码围栏。\n\n"
            "SOURCE_TEXT_START\n"
            f"{text}\n"
            "SOURCE_TEXT_END"
        )
        
        try:
            messages = [
                {"role": "system", "content": "你是一位专业的翻译助手。"},
                {"role": "user", "content": prompt}
            ]
            content = await self._call_llm(messages, temperature=0.2)
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
                    {"role": "user", "content": retry_prompt}
                ], temperature=0.0)
                retry_cleaned = _clean_translation(retry_content)
                if retry_cleaned:
                    cleaned = retry_cleaned

            if not cleaned:
                return "翻译失败，请稍后重试。", ""

            return cleaned, ""
            
        except Exception as e:
            print(f"Translate error: {e}")
            return "翻译失败，请稍后重试。", ""

    async def test_connection(self) -> Dict:
        """
        测试 AI 连接
        
        Returns:
            Dict with 'success', 'message', and optional 'details'
        """
        try:
            response = await self._call_llm([
                {"role": "user", "content": "Hello, please reply with 'OK' if you can hear me."}
            ], temperature=0.1)
            
            if response and len(response.strip()) > 0:
                return {
                    "success": True,
                    "message": "连接成功！",
                    "details": f"AI 响应: {response[:50]}..."
                }
            else:
                return {
                    "success": False,
                    "message": "AI 响应为空，请检查模型名称是否正确。",
                    "details": ""
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"连接失败: {str(e)}",
                "details": f"Provider: {self.provider}, Base: {self.api_base}, Model: {self.model}"
            }
