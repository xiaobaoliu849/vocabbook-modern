"""
AI Service
AI 增强功能服务
支持多种 AI Provider: OpenAI, Anthropic, Gemini, Ollama, Custom
"""
import os
import json
from typing import List, Dict, Optional, Tuple
import httpx
from services.evermem_service import EverMemService


class AIService:
    """AI 服务封装，支持多 Provider 切换"""
    
    def __init__(self, provider: str = None, api_key: str = None, model: str = None,
                 evermem_enabled: bool = False, evermem_url: str = None, evermem_key: str = None):
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
            
        self.api_base = os.environ.get("AI_API_BASE", "")
        self.model = model or os.environ.get("AI_MODEL", "gpt-4o-mini")
        
        # EverMemOS setup
        self.evermem_enabled = evermem_enabled
        self.evermem_service = None
        if self.evermem_enabled and evermem_url:
            self.evermem_service = EverMemService(api_url=evermem_url, api_key=evermem_key)

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
                "base_url": self.api_base or "http://localhost:11434/api",
                "headers": {}
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
            if self.provider in ["openai", "custom", "dashscope"]:
                try:
                    response = await client.post(
                        f"{config['base_url']}/chat/completions",
                        headers=config['headers'],
                        json={
                            "model": self.model,
                            "messages": messages,
                            "temperature": temperature
                        }
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
                
            elif self.provider == "ollama":
                response = await client.post(
                    f"{config['base_url']}/chat",
                    headers=config['headers'],
                    json={
                        "model": self.model or "llama2",
                        "messages": messages,
                        "stream": False
                    }
                )
                data = response.json()
                return data.get("message", {}).get("content", "")
                
        return ""
    
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
    
    async def chat(self, messages: List[Dict], context_word: str = "") -> str:
        """
        AI 对话练习
        
        Args:
            messages: 对话历史
            context_word: 当前学习的单词（可选）
        
        Returns:
            AI 回复
        """
        system_prompt = "你是一位友好的英语口语老师，帮助学生练习英语对话。用简单易懂的英语回复，并在适当时候纠正语法错误。"
        
        # Inject Memories from EverMemOS
        if self.evermem_service:
            last_user_msg = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), None)
            if last_user_msg:
                try:
                    memories = await self.evermem_service.search_memories(query=last_user_msg)
                    if memories:
                        memory_context = "\n".join([f"- {m.get('content', '')}" for m in memories])
                        system_prompt += f"\n\n【相关记忆】\n这是一个拥有长期记忆的系统。以下是关于用户的相关记忆，请参考这些信息进行个性化回复：\n{memory_context}"
                        print(f"Injected {len(memories)} memories into context.")
                except Exception as e:
                    print(f"Failed to retrieve memories: {e}")

        if context_word:
            system_prompt += f"\n\n今天的学习单词是 '{context_word}'，请在对话中自然地使用这个单词，帮助学生加深印象。"
        
        try:
            response = await self._call_llm([
                {"role": "system", "content": system_prompt},
                *messages
            ])

            # Save memory asynchronously (fire and forget pattern for now, or just await it if speed isn't critical)
            if self.evermem_service and last_user_msg:
                try:
                    # Save user message
                    await self.evermem_service.add_memory(content=last_user_msg)
                    # Optionally save AI response too? For now just user input as "what user said/prefers" is most valuable.
                except Exception as e:
                    print(f"Failed to save memory: {e}")

            return response

        except Exception as e:
            print(f"Chat error: {e}")
            return "Sorry, I encountered an error. Please try again."
    
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
        prompt = f"""请将以下文本从{source_lang}翻译成{target_lang}。
        
        文本：
        {text}
        
        要求：
        1. 翻译准确、流畅
        2. 只输出翻译后的文本，不要包含任何解释或额外内容
        """
        
        try:
            content = await self._call_llm([
                {"role": "system", "content": "你是一位专业的翻译助手。"},
                {"role": "user", "content": prompt}
            ])
            
            return content.strip(), ""
            
        except Exception as e:
            print(f"Translate error: {e}")
            return "翻译失败，请稍后重试。", ""
