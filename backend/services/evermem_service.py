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
            scores_list = result.get("scores", []) if isinstance(result.get("scores", []), list) else []
            if memories_list and isinstance(memories_list[0], dict):
                first_memory = memories_list[0]
                memory_preview = {key: first_memory.get(key) for key in list(first_memory.keys())[:10]}
                print(
                    "[EverMem search raw memory] "
                    f"keys={list(first_memory.keys())} preview={memory_preview}"
                )

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
            for index, mem in enumerate(memories_list):
                score = mem.get("score")
                if score is None and index < len(scores_list):
                    score = scores_list[index]
                if score is None:
                    score = 0.0
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
            if memories_list and isinstance(memories_list[0], dict):
                first_memory = memories_list[0]
                memory_preview = {key: first_memory.get(key) for key in list(first_memory.keys())[:10]}
                print(
                    "[EverMem get raw memory] "
                    f"keys={list(first_memory.keys())} preview={memory_preview}"
                )
            if memory_type == "event_log" and memories_list:
                review_candidates = []
                for mem in memories_list[:25]:
                    if not isinstance(mem, dict):
                        continue
                    atomic_fact = str(mem.get("atomic_fact", "")).strip()
                    original_text = self._extract_original_data_text(mem.get("original_data")) or ""
                    sender_name = str(
                        mem.get("sender_name")
                        or mem.get("user_name")
                        or (
                            mem.get("original_data", {}).get("sender_name")
                            if isinstance(mem.get("original_data"), dict) else ""
                        )
                    ).strip()
                    combined = " ".join(part for part in (atomic_fact, original_text, sender_name) if part).lower()
                    if any(
                        marker in combined for marker in (
                            "[review",
                            "review session",
                            "reviewed word",
                            "复习",
                            "评分",
                            "tutor_vocab",
                            "vocabbook tutor",
                            "current weaker review words",
                            "this word is still weak",
                        )
                    ):
                        review_candidates.append({
                            "group_id": mem.get("group_id"),
                            "timestamp": mem.get("timestamp"),
                            "sender_name": sender_name,
                            "atomic_fact": atomic_fact[:120],
                            "original_text": original_text[:160],
                            "original_data_type": type(mem.get("original_data")).__name__,
                        })
                print(
                    "[EverMem get review candidates] "
                    f"user_id={user_id} group_ids={group_ids} count={len(review_candidates)} "
                    f"samples={review_candidates[:3]}"
                )
            extracted_memories = []

            if memory_type == "profile":
                raw_profiles = []
                if isinstance(result, dict):
                    if isinstance(result.get("profiles"), list):
                        raw_profiles.extend(result.get("profiles", []))
                    for item in memories_list:
                        if isinstance(item, dict) and isinstance(item.get("profiles"), list):
                            raw_profiles.extend(item.get("profiles", []))

                for profile in raw_profiles:
                    if not isinstance(profile, dict):
                        continue
                    profile_data = profile.get("profile_data") if isinstance(profile.get("profile_data"), dict) else {}
                    explicit_info = profile_data.get("explicit_info") if isinstance(profile_data.get("explicit_info"), list) else []

                    descriptions = []
                    for info in explicit_info:
                        if not isinstance(info, dict):
                            continue
                        description = str(info.get("description", "")).strip()
                        if description:
                            descriptions.append(description)

                    if not descriptions:
                        fallback_description = (
                            str(profile_data.get("description", "")).strip()
                            or str(profile.get("description", "")).strip()
                        )
                        if fallback_description:
                            descriptions.append(fallback_description)

                    for description in descriptions:
                        extracted_memories.append({
                            "content": description,
                            "type": "profile",
                            "group_id": profile.get("group_id") or profile_data.get("group_id"),
                            "timestamp": profile_data.get("timestamp") or profile.get("timestamp"),
                        })

                print(
                    "[EverMem get profile parsed] "
                    f"user_id={user_id} parsed={len(extracted_memories)}"
                )
                return extracted_memories

            for mem in memories_list:
                raw_content = self._extract_original_data_text(mem.get("original_data"))
                content = (
                    mem.get("description")
                    or mem.get("profile")
                    or mem.get("value")
                    or mem.get("atomic_fact")
                    or mem.get("episode")
                    or mem.get("summary")
                    or mem.get("content")
                    or mem.get("message")
                )
                if not content:
                    content = raw_content
                if content:
                    extracted_memories.append({
                        "content": content,
                        "raw_content": raw_content,
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

    @staticmethod
    def _extract_original_data_text(original_data) -> Optional[str]:
        if not original_data:
            return None

        if isinstance(original_data, str):
            stripped = original_data.strip()
            if not stripped:
                return None
            return stripped

        if isinstance(original_data, dict):
            direct_text = (
                original_data.get("content")
                or original_data.get("message")
                or original_data.get("text")
                or original_data.get("body")
            )
            if isinstance(direct_text, str) and direct_text.strip():
                return direct_text.strip()

            for nested_key in ("original_data", "data", "event", "payload"):
                nested = original_data.get(nested_key)
                nested_text = EverMemService._extract_original_data_text(nested)
                if nested_text:
                    return nested_text

        return None
