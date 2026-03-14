"""
AI Service
AI 增强功能服务
支持多种 AI Provider: OpenAI, Anthropic, Gemini, Ollama, Custom
"""
import os
import json
import re
from typing import List, Dict, Optional, Tuple
import httpx
from services.evermem_service import EverMemService


class AIService:
    """AI 服务封装，支持多 Provider 切换"""
    
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
    def _format_memory_context(memories: List[Dict]) -> str:
        """
        Format retrieved memories into a compact, high-signal block for the model.
        We keep only the most relevant snippets and cap length to reduce prompt dilution.
        """
        if not memories:
            return ""

        ranked_memories = sorted(
            memories,
            key=lambda item: float(item.get("score", 0.0)),
            reverse=True
        )[:5]

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
                    sender_name="User"
                )
                memory_saved = save_result is not None

                # Step 2: Retrieve context (skip only for trivial messages)
                if not self._should_skip_memory(last_user_msg):
                    try:
                        memories = await self.evermem_service.search_memories(
                            query=last_user_msg,
                            user_id=self.evermem_user_id,
                            min_score=0.3
                        )
                        if memories:
                            memories_retrieved = len(memories)
                            memory_context = self._format_memory_context(memories)
                            if memory_context:
                                system_prompt += (
                                    "\n\n【与当前问题相关的长期记忆】\n"
                                    f"{memory_context}\n"
                                    "请先判断哪些记忆与当前问题最相关，再把最相关的内容自然融入回复。"
                                )
                            print(f"[EverMem] Injected {memories_retrieved} memories (scores: {[round(m.get('score', 0), 2) for m in memories]})")
                    except Exception as e:
                        print(f"[EverMem] Failed to retrieve memories: {e}")
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

            # Step 4: Store assistant response
            if self.evermem_service and response:
                _asyncio.create_task(
                    self.evermem_service.add_memory(
                        content=response,
                        user_id=self.evermem_user_id,
                        sender="assistant_001",
                        sender_name="Assistant",
                        flush=True
                    )
                )

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
                    sender_name="User"
                )
                memory_saved = save_result is not None

                # Step 2: Retrieve context
                if not self._should_skip_memory(last_user_msg):
                    try:
                        memories = await self.evermem_service.search_memories(
                            query=last_user_msg,
                            user_id=self.evermem_user_id,
                            min_score=0.3
                        )
                        if memories:
                            memories_retrieved = len(memories)
                            memory_context = self._format_memory_context(memories)
                            if memory_context:
                                system_prompt += (
                                    "\n\n【与当前问题相关的长期记忆】\n"
                                    f"{memory_context}\n"
                                    "请先判断哪些记忆与当前问题最相关，再把最相关的内容自然融入回复。"
                                )
                            print(f"[EverMem Stream] Injected {memories_retrieved} memories (scores: {[round(m.get('score', 0), 2) for m in memories]})")
                    except Exception as e:
                        print(f"[EverMem Stream] Failed to retrieve memories: {e}")
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

            # Step 4: Store assistant response
            if self.evermem_service and full_response:
                _asyncio.create_task(
                    self.evermem_service.add_memory(
                        content=full_response,
                        user_id=self.evermem_user_id,
                        sender="assistant_001",
                        sender_name="Assistant",
                        flush=True
                    )
                )

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
