"""
AI Service
AI 增强功能服务
支持多种 AI Provider: OpenAI, Anthropic, Gemini, Ollama, Custom
"""
import os
import json
from typing import List, Dict, Optional
import httpx


class AIService:
    """AI 服务封装，支持多 Provider 切换"""
    
    def __init__(self, provider: str = None):
        """
        初始化 AI 服务
        
        Args:
            provider: AI 提供商 (openai, anthropic, gemini, ollama, custom)
        """
        self.provider = provider or os.environ.get("AI_PROVIDER", "openai")
        self.api_key = os.environ.get("AI_API_KEY", "")
        self.api_base = os.environ.get("AI_API_BASE", "")
        self.model = os.environ.get("AI_MODEL", "gpt-4o-mini")
        
    def _get_client_config(self) -> Dict:
        """获取 HTTP 客户端配置"""
        if self.provider == "openai":
            return {
                "base_url": self.api_base or "https://api.openai.com/v1",
                "headers": {"Authorization": f"Bearer {self.api_key}"}
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
        else:  # custom
            return {
                "base_url": self.api_base,
                "headers": {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
            }
    
    async def _call_llm(self, messages: List[Dict], temperature: float = 0.7) -> str:
        """调用 LLM API"""
        config = self._get_client_config()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            if self.provider in ["openai", "custom"]:
                response = await client.post(
                    f"{config['base_url']}/chat/completions",
                    headers=config['headers'],
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature
                    }
                )
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")
                
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
        
        if context_word:
            system_prompt += f"\n\n今天的学习单词是 '{context_word}'，请在对话中自然地使用这个单词，帮助学生加深印象。"
        
        try:
            return await self._call_llm([
                {"role": "system", "content": system_prompt},
                *messages
            ])
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
