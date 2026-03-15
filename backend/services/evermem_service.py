"""
EverMemOS Service
Service for interacting with EverMemOS long-term memory system.
Supports both Cloud (https://api.evermind.ai) and self-hosted instances.
API Reference: https://github.com/EverMind-AI/EverMemOS
"""
import logging
import datetime
import uuid
import asyncio
from typing import List, Dict, Optional
from evermemos import EverMemOS

logger = logging.getLogger(__name__)


class EverMemService:
    def __init__(self, api_url: str, api_key: str = None):
        self.api_url = (api_url or "https://api.evermind.ai").rstrip("/")
        self.api_key = api_key
        # Initialize the official SDK
        if self.api_key:
            self.client = EverMemOS(api_key=self.api_key, base_url=self.api_url).v0.memories
        else:
            self.client = None

    async def add_memory(
        self,
        content: str,
        user_id: str = "user_001",
        sender: str = None,
        sender_name: str = "User",
        flush: bool = False,
        group_id: str = None,
        group_name: str = None,
        role: str = "user",
        refer_list: Optional[List[str]] = None,
    ) -> Optional[Dict]:
        """
        Add a memory to EverMemOS (v0 API).
        
        Args:
            content: The message content to store
            user_id: User identifier
            sender: Sender ID (defaults to user_id)
            sender_name: Display name of sender ("User" or "Assistant")
            flush: Set to True if this is the final message of a conversation
        """
        if not self.client:
            logger.error("EverMemService: Missing API key. Cannot add memory.")
            return None

        message_id = str(uuid.uuid4())
        create_time = datetime.datetime.now(datetime.timezone.utc).isoformat()
        actual_sender = sender or user_id

        def sync_add():
            return self.client.add(
                message_id=message_id,
                create_time=create_time,
                sender=actual_sender,
                sender_name=sender_name,
                content=content,
                group_id=group_id,
                group_name=group_name,
                role=role,
                refer_list=refer_list,
                flush=flush
            )

        try:
            resp = await asyncio.to_thread(sync_add)
            return {"status": "success"}
        except Exception as e:
            logger.error(f"Failed to add memory to EverMemOS: {e}")
            return None

    async def search_memories(
        self,
        query: str,
        user_id: str = "user_001",
        min_score: float = 0.3,
        group_ids: Optional[List[str]] = None,
        memory_types: Optional[List[str]] = None,
        retrieve_method: str = "keyword",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        top_k: int = 10,
    ) -> List[Dict]:
        """
        Search for relevant memories in EverMemOS (v0 API).
        Uses direct REST call instead of SDK to avoid parameter validation
        issues with the cloud API (SDK sends unsupported 'foresight' type).
        Results below min_score are filtered out.
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot search memories.")
            return []

        import httpx

        search_url = f"{self.api_url}/api/v0/memories/search"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        params = {
            "user_id": user_id,
            "query": query,
            "retrieve_method": retrieve_method,
            "top_k": top_k,
        }
        if group_ids:
            params["group_ids"] = group_ids
        if memory_types:
            params["memory_types"] = memory_types
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time

        def sync_search():
            return httpx.get(search_url, headers=headers, params=params, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_search)
            if resp.status_code != 200:
                logger.error(f"EverMem search returned {resp.status_code}: {resp.text[:200]}")
                return []

            data = resp.json()
            result = data.get("result", {})
            print(
                "[EverMem search debug] "
                f"user_id={user_id} group_ids={group_ids} query={query[:120]!r} "
                f"status={resp.status_code} "
                f"top_keys={list(data.keys())[:8] if isinstance(data, dict) else type(data).__name__} "
                f"result_keys={list(result.keys())[:8] if isinstance(result, dict) else type(result).__name__} "
                f"memories={len(result.get('memories', [])) if isinstance(result, dict) else 0} "
                f"profiles={len(result.get('profiles', [])) if isinstance(result, dict) else 0}"
            )
            if not result:
                return []

            memories_list = result.get("memories", [])
            profiles_list = result.get("profiles", [])

            extracted_memories = []

            # Extract profiles (always relevant)
            for profile in profiles_list:
                desc = profile.get("description")
                if desc:
                    extracted_memories.append({
                        "content": f"[用户画像] {desc}",
                        "type": "profile",
                        "score": profile.get("score", 1.0),
                        "group_id": profile.get("group_id"),
                    })

            # Extract episodic memories with score filtering
            for mem in memories_list:
                score = mem.get("score", 0.0)
                if score < min_score:
                    continue
                mem_type = mem.get("memory_type", "episodic_memory")
                content = mem.get("episode") or mem.get("summary") or mem.get("content")
                if content:
                    type_label = {
                        'episodic_memory': '历史对话',
                        'foresight': '提醒/行动',
                        'profile': '用户画像'
                    }.get(mem_type, '记忆')
                    extracted_memories.append({
                        "content": f"[{type_label}] {content}",
                        "type": mem_type,
                        "score": score,
                        "group_id": mem.get("group_id"),
                        "timestamp": mem.get("timestamp"),
                    })

            return extracted_memories
        except Exception as e:
            logger.error(f"Failed to search memories in EverMemOS: {e}")
            return []

    async def get_memories(
        self,
        user_id: str = "user_001",
        group_ids: Optional[List[str]] = None,
        memory_type: str = "episodic_memory",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        page_size: int = 100,
    ) -> List[Dict]:
        """
        Get all core memories for a user (v0 API).
        Uses direct REST calls so group_ids and memory_type parameters match
        the documented cloud API exactly.
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot get memories.")
            return []

        import httpx

        get_url = f"{self.api_url}/api/v0/memories"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        params = {
                "user_id": user_id,
                "group_ids": group_ids,
                "memory_type": memory_type,
                "start_time": start_time,
                "end_time": end_time,
                "page_size": page_size,
        }
        params = {key: value for key, value in params.items() if value is not None}

        def sync_get():
            return httpx.get(get_url, headers=headers, params=params, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_get)
            if resp.status_code != 200:
                logger.error(f"EverMem get returned {resp.status_code}: {resp.text[:200]}")
                return []

            data = resp.json()
            result = data.get("result", data) if isinstance(data, dict) else None
            memories_preview = []
            if isinstance(result, dict):
                for mem in result.get("memories", [])[:2]:
                    if isinstance(mem, dict):
                        memories_preview.append({
                            "memory_type": mem.get("memory_type"),
                            "group_id": mem.get("group_id"),
                            "timestamp": mem.get("timestamp"),
                        })
            print(
                "[EverMem get debug] "
                f"user_id={user_id} group_ids={group_ids} memory_type={memory_type} "
                f"status={resp.status_code} "
                f"top_keys={list(data.keys())[:8] if isinstance(data, dict) else type(data).__name__} "
                f"result_keys={list(result.keys())[:8] if isinstance(result, dict) else type(result).__name__} "
                f"memories={len(result.get('memories', [])) if isinstance(result, dict) else 0} "
                f"preview={memories_preview}"
            )
            if not result:
                return []

            memories_list = result.get("memories", []) if isinstance(result, dict) else []
            extracted_memories = []
            for mem in memories_list:
                content = mem.get("episode") or mem.get("summary") or mem.get("content") or mem.get("message")
                if content:
                    extracted_memories.append({
                        "content": content,
                        "type": mem.get("memory_type", memory_type),
                        "group_id": mem.get("group_id"),
                        "timestamp": mem.get("timestamp"),
                        "role": mem.get("role"),
                        "sender_name": mem.get("sender_name"),
                    })
            return extracted_memories
        except Exception as e:
            logger.error(f"Failed to get memories from EverMemOS: {e}")
            return []
