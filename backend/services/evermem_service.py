"""
EverMemOS Service (v1 API)
Service for interacting with EverOS / EverMemOS long-term memory system.
Supports both Cloud (https://api.evermind.ai) and self-hosted instances.
API Reference: https://docs.evermind.ai
"""
import logging
import datetime
import uuid
import asyncio
from typing import List, Dict, Optional
import httpx

logger = logging.getLogger(__name__)


class EverMemService:
    def __init__(self, api_url: str, api_key: str = None):
        self.api_url = (api_url or "https://api.evermind.ai").rstrip("/")
        self.api_key = api_key

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    @staticmethod
    def _build_filters(
        user_id: Optional[str] = None,
        group_ids: Optional[List[str]] = None,
    ) -> Dict:
        """Build the v1 filters DSL dict."""
        if group_ids:
            if len(group_ids) == 1:
                return {"group_id": group_ids[0]}
            return {"group_id": {"in": group_ids}}
        if user_id:
            return {"user_id": user_id}
        return {}

    @staticmethod
    def _now_ms() -> int:
        return int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)

    @staticmethod
    def _unwrap_v1_response(data: Dict) -> Dict:
        """v1 responses wrap payloads in {"data": {...}}. Unwrap it."""
        if isinstance(data, dict) and "data" in data and isinstance(data["data"], dict):
            return data["data"]
        return data

    # ------------------------------------------------------------------
    # add_memory  —  POST /api/v1/memories/group  +  flush
    # ------------------------------------------------------------------

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
        async_mode: Optional[bool] = None,
        attachments: Optional[List[Dict]] = None,
    ) -> Optional[Dict]:
        """
        Add a memory to EverMemOS via v1 API.

        Uses the group endpoint when group_id is provided,
        otherwise falls back to the personal endpoint.
        If flush=True, a separate flush call is made after adding.

        async_mode:
          None  → let API use its default (true / async).
          False → request synchronous processing (200 + 'extracted' status).
                  Use this for high-value data like review records to guarantee
                  the memory is fully written before returning.
          True  → explicitly request async (202 + task_id).

        attachments:
          Optional list of dicts aligned with official ContentItem schema:
          [{"type": "image"|"document", "uri": "<objectKey>", "name": "...", "ext": "..."}]
          When provided, message.content becomes a ContentItem array instead of a plain string.
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot add memory.")
            return None

        if attachments:
            content_field: List[Dict] = [{"type": "text", "text": content}] if content else []
            for a in attachments:
                content_field.append({
                    "type": a["type"],
                    "uri": a["uri"],
                    "name": a.get("name"),
                    "ext": a.get("ext"),
                })
            message_content = content_field
        else:
            message_content = content

        message = {
            "role": role,
            "timestamp": self._now_ms(),
            "content": message_content,
            "sender_id": sender or user_id,
            "sender_name": sender_name,
            "message_id": str(uuid.uuid4()),
        }

        if group_id:
            url = f"{self.api_url}/api/v1/memories/group"
            body: Dict = {
                "group_id": group_id,
                "messages": [message],
            }
            if group_name:
                body["group_meta"] = {"name": group_name}
        else:
            url = f"{self.api_url}/api/v1/memories"
            body = {
                "user_id": user_id,
                "messages": [message],
            }

        # Only inject async_mode when explicitly set by the caller.
        if async_mode is not None:
            body["async_mode"] = async_mode

        def sync_add():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_add)
            if resp.status_code not in (200, 202):
                logger.error(f"EverMem v1 add returned {resp.status_code}: {resp.text[:200]}")
                return None

            resp_data = resp.json() if resp.text else {}
            inner = self._unwrap_v1_response(resp_data)
            task_id = inner.get("task_id") if isinstance(inner, dict) else None
            write_status = inner.get("status", "unknown") if isinstance(inner, dict) else "unknown"

            result: Dict = {"status": write_status}
            if task_id:
                result["task_id"] = task_id

            # Log async queued vs synchronous extracted for observability
            if resp.status_code == 202:
                logger.debug(
                    f"[EverMem add] async queued task_id={task_id} group_id={group_id} user_id={user_id}"
                )
            else:
                logger.debug(
                    f"[EverMem add] sync extracted status={write_status} group_id={group_id} user_id={user_id}"
                )

            # Separate flush call if requested
            if flush:
                result["flush"] = await self._flush(group_id=group_id, user_id=user_id)

            return result
        except Exception as e:
            logger.error(f"Failed to add memory to EverMemOS: {e}")
            return None

    async def _flush(
        self,
        group_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """Trigger memory extraction via v1 flush endpoint."""
        if group_id:
            url = f"{self.api_url}/api/v1/memories/group/flush"
            body: Dict = {"group_id": group_id}
        else:
            url = f"{self.api_url}/api/v1/memories/flush"
            body = {"user_id": user_id or "user_001"}

        def sync_flush():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_flush)
            if resp.status_code not in (200, 202):
                logger.error(f"EverMem v1 flush returned {resp.status_code}: {resp.text[:200]}")
                return "error"
            data = resp.json() if resp.text else {}
            inner = self._unwrap_v1_response(data)
            return inner.get("status", "unknown")
        except Exception as e:
            logger.error(f"Failed to flush memories in EverMemOS: {e}")
            return "error"

    # ------------------------------------------------------------------
    # search_memories  —  POST /api/v1/memories/search
    # ------------------------------------------------------------------

    async def search_memories(
        self,
        query: str,
        user_id: str = "user_001",
        min_score: float = 0.3,
        group_ids: Optional[List[str]] = None,
        memory_types: Optional[List[str]] = None,
        retrieve_method: str = "hybrid",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        top_k: int = 10,
        current_time: Optional[str] = None,
        radius: Optional[float] = None,
        include_original_data: Optional[bool] = None,
    ) -> List[Dict]:
        """
        Search for relevant memories in EverMemOS (v1 API).
        Uses POST /api/v1/memories/search with filters DSL.
        Results below min_score are filtered out.

        v1 response structure:
          {"data": {"episodes": [...], "profiles": [...], "total_count": N, "count": N}}
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot search memories.")
            return []

        # v1 API methods: keyword, vector, hybrid, agentic
        # Map legacy "rrf" to "hybrid" (both are RRF-based fusion)
        if retrieve_method == "rrf":
            retrieve_method = "hybrid"

        url = f"{self.api_url}/api/v1/memories/search"
        filters = self._build_filters(user_id=user_id, group_ids=group_ids)

        # Add time filters if provided
        if start_time or end_time:
            ts_filter: Dict = {}
            if start_time:
                ts_filter["gte"] = start_time
            if end_time:
                ts_filter["lte"] = end_time
            filters["timestamp"] = ts_filter

        body: Dict = {
            "query": query,
            "filters": filters,
            "method": retrieve_method,
            "top_k": top_k,
        }
        if memory_types:
            body["memory_types"] = memory_types
        if current_time:
            body["current_time"] = current_time
        if radius is not None:
            body["radius"] = radius
        if include_original_data is not None:
            body["include_original_data"] = include_original_data

        def sync_search():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_search)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 search returned {resp.status_code}: {resp.text[:200]}")
                return []

            raw = resp.json()
            data = self._unwrap_v1_response(raw)
            logger.debug(
                "[EverMem v1 search] user_id=%s group_ids=%s query=%r status=%d keys=%s",
                user_id, group_ids, query[:120], resp.status_code,
                list(data.keys())[:8] if isinstance(data, dict) else type(data).__name__,
            )

            if not isinstance(data, dict):
                return []

            # v1 search returns: data.episodes[], data.profiles[]
            episodes_list = data.get("episodes", [])
            profiles_list = data.get("profiles", [])

            extracted_memories: List[Dict] = []

            # Extract profiles (always relevant, no score filtering)
            for profile in profiles_list:
                if not isinstance(profile, dict):
                    continue
                profile_data = profile.get("profile_data") if isinstance(profile.get("profile_data"), dict) else {}
                explicit_info = profile_data.get("explicit_info") if isinstance(profile_data.get("explicit_info"), list) else []
                for info in explicit_info:
                    if not isinstance(info, dict):
                        continue
                    desc = str(info.get("description", "")).strip()
                    if desc:
                        extracted_memories.append({
                            "content": f"[用户画像] {desc}",
                            "type": "profile",
                            "score": 1.0,
                            "group_id": profile.get("group_id"),
                        })
                # Fallback if no explicit_info
                if not explicit_info:
                    desc = str(profile_data.get("description", "")).strip() or str(profile.get("description", "")).strip()
                    if desc:
                        extracted_memories.append({
                            "content": f"[用户画像] {desc}",
                            "type": "profile",
                            "score": 1.0,
                            "group_id": profile.get("group_id"),
                        })

            # Extract episodes with score filtering
            for index, mem in enumerate(episodes_list):
                if not isinstance(mem, dict):
                    continue
                # v1 episodes don't have a score field in get; search may include it
                score = mem.get("score", 0.0)
                if score < min_score:
                    continue
                mem_type = mem.get("type", mem.get("memory_type", "episodic_memory"))
                content = (
                    mem.get("episode")
                    or mem.get("summary")
                    or mem.get("subject")
                    or mem.get("content")
                    or mem.get("description")
                )
                if content:
                    type_label = {
                        "episodic_memory": "历史对话",
                        "foresight": "提醒/行动",
                        "profile": "用户画像",
                        "agent_case": "经验案例",
                        "agent_skill": "技能",
                    }.get(mem_type, "记忆")
                    extracted_memories.append({
                        "content": f"[{type_label}] {content}",
                        "type": mem_type,
                        "score": score,
                        "group_id": mem.get("group_id"),
                        "timestamp": mem.get("timestamp"),
                        "memory_id": mem.get("memory_id") or mem.get("id"),
                    })

            return extracted_memories
        except Exception as e:
            logger.error(f"Failed to search memories in EverMemOS: {e}")
            return []

    # ------------------------------------------------------------------
    # get_memories  —  POST /api/v1/memories/get
    # ------------------------------------------------------------------

    async def get_memories(
        self,
        user_id: str = "user_001",
        group_ids: Optional[List[str]] = None,
        memory_type: str = "episodic_memory",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        page_size: int = 100,
        page: Optional[int] = None,
        rank_by: Optional[str] = None,
        rank_order: Optional[str] = None,
    ) -> List[Dict]:
        """
        Get memories by type from EverMemOS (v1 API).
        Uses POST /api/v1/memories/get with filters DSL.

        Supported memory_type values (official v1):
          - episodic_memory  → {"data": {"episodes": [...], "total_count": N}}
          - profile          → {"data": {"profiles": [...], "total_count": N}}
          - agent_case       → {"data": {"agent_cases": [...], "total_count": N}}
          - agent_skill      → {"data": {"agent_skills": [...], "total_count": N}}
          - foresight        → {"data": {"foresights": [...], "total_count": N}}

        Legacy type 'event_log' is mapped to 'episodic_memory' (v1 consolidated).
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot get memories.")
            return []

        # v1 API does not support event_log type in get endpoint.
        # Fall back to episodic_memory since v1 consolidates all extracted facts there.
        if memory_type == "event_log":
            memory_type = "episodic_memory"

        url = f"{self.api_url}/api/v1/memories/get"
        filters = self._build_filters(user_id=user_id, group_ids=group_ids)

        if start_time or end_time:
            ts_filter: Dict = {}
            if start_time:
                ts_filter["gte"] = start_time
            if end_time:
                ts_filter["lte"] = end_time
            filters["timestamp"] = ts_filter

        body: Dict = {
            "memory_type": memory_type,
            "filters": filters,
            "page_size": min(page_size, 100),
        }
        if page is not None:
            body["page"] = page
        if rank_by is not None:
            body["rank_by"] = rank_by
        if rank_order is not None:
            body["rank_order"] = rank_order

        def sync_get():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_get)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 get returned {resp.status_code}: {resp.text[:200]}")
                return []

            raw = resp.json()
            data = self._unwrap_v1_response(raw)
            if not isinstance(data, dict):
                return []

            # v1 get returns typed arrays: episodes[], profiles[], agent_cases[], agent_skills[], foresights[]
            # Map memory_type to the expected response key
            type_to_key = {
                "episodic_memory": "episodes",
                "profile": "profiles",
                "agent_case": "agent_cases",
                "agent_skill": "agent_skills",
                "event_log": "episodes",  # event_log may come back as episodes
                "foresight": "foresights",
            }
            response_key = type_to_key.get(memory_type, "episodes")
            memories_list = data.get(response_key, [])

            # Fallback: try legacy key names
            if not memories_list:
                memories_list = data.get("memories", [])

            logger.debug(
                "[EverMem v1 get] user_id=%s group_ids=%s type=%s status=%d key=%s items=%d",
                user_id, group_ids, memory_type, resp.status_code, response_key, len(memories_list),
            )

            extracted_memories: List[Dict] = []

            if memory_type == "profile":
                # profiles are top-level in data.profiles[]
                for profile in memories_list:
                    if not isinstance(profile, dict):
                        continue
                    profile_data = profile.get("profile_data") if isinstance(profile.get("profile_data"), dict) else {}
                    explicit_info = profile_data.get("explicit_info") if isinstance(profile_data.get("explicit_info"), list) else []

                    descriptions: List[str] = []
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

                return extracted_memories

            # Non-profile types: episodic_memory, event_log, agent_case, agent_skill
            for mem in memories_list:
                if not isinstance(mem, dict):
                    continue
                raw_content = self._extract_original_data_text(mem.get("original_data"))
                content = (
                    mem.get("episode")
                    or mem.get("summary")
                    or mem.get("subject")
                    or mem.get("description")
                    or mem.get("profile")
                    or mem.get("value")
                    or mem.get("atomic_fact")
                    or mem.get("content")
                    or mem.get("message")
                    or mem.get("task_intent")  # agent_case
                    or mem.get("name")          # agent_skill
                )
                if not content:
                    content = raw_content
                if content:
                    extracted_memories.append({
                        "content": content,
                        "raw_content": raw_content,
                        "type": mem.get("type", mem.get("memory_type", memory_type)),
                        "group_id": mem.get("group_id"),
                        "timestamp": mem.get("timestamp"),
                        "memory_id": mem.get("memory_id") or mem.get("id"),
                        "role": mem.get("role"),
                        "sender_name": mem.get("sender_name"),
                    })
            return extracted_memories
        except Exception as e:
            logger.error(f"Failed to get memories from EverMemOS: {e}")
            return []

    # ------------------------------------------------------------------
    # settings  —  GET/PUT /api/v1/settings
    # ------------------------------------------------------------------

    async def get_settings(self) -> Optional[Dict]:
        """Retrieve current memory space settings from Evermind."""
        if not self.api_key:
            return None

        def sync_get():
            return httpx.get(
                f"{self.api_url}/api/v1/settings",
                headers=self._headers(),
                timeout=15.0,
            )

        try:
            resp = await asyncio.to_thread(sync_get)
            if resp.status_code != 200:
                logger.error(f"EverMem get settings returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to get EverMemOS settings: {e}")
            return None

    async def update_settings(self, settings: Dict) -> Optional[Dict]:
        """Update memory space settings (partial update)."""
        if not self.api_key:
            return None

        def sync_put():
            return httpx.put(
                f"{self.api_url}/api/v1/settings",
                headers=self._headers(),
                json=settings,
                timeout=15.0,
            )

        try:
            resp = await asyncio.to_thread(sync_put)
            if resp.status_code != 200:
                logger.error(f"EverMem update settings returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to update EverMemOS settings: {e}")
            return None

    # ------------------------------------------------------------------
    # delete_memories  —  POST /api/v1/memories/delete
    # ------------------------------------------------------------------

    async def delete_memories(
        self,
        memory_id: Optional[str] = None,
        user_id: Optional[str] = None,
        group_id: Optional[str] = None,
        session_id: Optional[str] = None,
        sender_id: Optional[str] = None,
    ) -> bool:
        """
        Delete memories by memory_id (single delete) or by filters (batch delete).
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot delete memories.")
            return False

        url = f"{self.api_url}/api/v1/memories/delete"
        body = {}
        if memory_id:
            body["memory_id"] = memory_id
        else:
            if user_id:
                body["user_id"] = user_id
            if group_id:
                body["group_id"] = group_id
            if session_id:
                body["session_id"] = session_id
            if sender_id:
                body["sender_id"] = sender_id

        def sync_delete():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_delete)
            if resp.status_code not in (200, 204):
                logger.error(f"EverMem v1 delete returned {resp.status_code}: {resp.text[:200]}")
                return False
            return True
        except Exception as e:
            logger.error(f"Failed to delete memories in EverMemOS: {e}")
            return False

    # ------------------------------------------------------------------
    # Groups API  —  POST/GET/PATCH /api/v1/groups
    # ------------------------------------------------------------------

    async def create_group(
        self,
        group_id: str,
        name: str,
        description: Optional[str] = None,
    ) -> Optional[Dict]:
        """Create a new group or update an existing one (upsert by group_id)."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/groups"
        body = {"group_id": group_id, "name": name}
        if description is not None:
            body["description"] = description

        def sync_post():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_post)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 create_group returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to create group in EverMemOS: {e}")
            return None

    async def get_group_details(self, group_id: str) -> Optional[Dict]:
        """Retrieve group details by group_id."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/groups/{group_id}"

        def sync_get():
            return httpx.get(url, headers=self._headers(), timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_get)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 get_group_details returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to get group details from EverMemOS: {e}")
            return None

    async def update_group(
        self,
        group_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[Dict]:
        """Update group fields. At least one of name or description must be provided."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/groups/{group_id}"
        body = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description

        def sync_patch():
            return httpx.patch(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_patch)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 update_group returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to update group in EverMemOS: {e}")
            return None

    # ------------------------------------------------------------------
    # Senders API  —  POST/GET/PATCH /api/v1/senders
    # ------------------------------------------------------------------

    async def create_sender(self, sender_id: str, name: str) -> Optional[Dict]:
        """Create a new sender or update an existing one (upsert by sender_id)."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/senders"
        body = {"sender_id": sender_id, "name": name}

        def sync_post():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_post)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 create_sender returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to create sender in EverMemOS: {e}")
            return None

    async def get_sender_details(self, sender_id: str) -> Optional[Dict]:
        """Retrieve sender details by sender_id."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/senders/{sender_id}"

        def sync_get():
            return httpx.get(url, headers=self._headers(), timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_get)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 get_sender_details returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to get sender details from EverMemOS: {e}")
            return None

    async def update_sender(self, sender_id: str, name: str) -> Optional[Dict]:
        """Update sender's display name."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/senders/{sender_id}"
        body = {"name": name}

        def sync_patch():
            return httpx.patch(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_patch)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 update_sender returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to update sender in EverMemOS: {e}")
            return None

    # ------------------------------------------------------------------
    # Tasks API  —  GET /api/v1/tasks/{task_id}
    # ------------------------------------------------------------------

    async def get_task_status(self, task_id: str) -> Optional[Dict]:
        """Query the processing status of a specific async task by task_id."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/tasks/{task_id}"

        def sync_get():
            return httpx.get(url, headers=self._headers(), timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_get)
            if resp.status_code != 200:
                logger.error(f"EverMem v1 get_task_status returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to get task status from EverMemOS: {e}")
            return None

    # ------------------------------------------------------------------
    # Storage API  —  POST /api/v1/object/sign
    # ------------------------------------------------------------------

    async def upload_multimodal_data(self, object_list: List[Dict]) -> Optional[Dict]:
        """Generate a pre-signed S3 upload URL for multimodal content."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/object/sign"
        body = {"objectList": object_list}

        def sync_post():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_post)
            if resp.status_code not in (200, 400):
                logger.error(f"EverMem v1 upload_multimodal_data returned {resp.status_code}: {resp.text[:200]}")
                return None
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to sign object upload in EverMemOS: {e}")
            return None

    async def presign_and_upload(
        self,
        file_bytes: bytes,
        file_name: str,
        file_type: str,
        file_ext: str,
    ) -> Optional[Dict]:
        """
        End-to-end: request a pre-signed S3 URL from Evermind, upload the file
        binary to S3, then return {"objectKey", "fileType", "fileName"} on success.

        upload_multimodal_data returns raw JSON (not unwrapped via _unwrap_v1_response),
        so the object list lives at resp["result"]["data"]["objectList"][0].
        """
        if not self.api_key:
            logger.error("EverMemService: Missing API key. Cannot presign_and_upload.")
            return None

        file_id = str(uuid.uuid4())
        sign_resp = await self.upload_multimodal_data([{
            "fileId": file_id,
            "fileName": file_name,
            "fileType": file_type,
            "name": file_name,
            "ext": file_ext,
        }])
        if not sign_resp:
            logger.error("presign_and_upload: sign step returned None")
            return None

        try:
            object_list = sign_resp["result"]["data"]["objectList"]
            if not object_list:
                logger.error(f"presign_and_upload: empty objectList in sign response: {sign_resp}")
                return None
            entry = object_list[0]
            object_key = entry["objectKey"]
            signed_info = entry.get("objectSignedInfo", {})
            upload_url = signed_info.get("url")
            fields = signed_info.get("fields")
        except (KeyError, TypeError, IndexError) as e:
            logger.error(f"presign_and_upload: failed to parse sign response: {e}")
            return None

        if not upload_url:
            logger.error("presign_and_upload: no upload URL in signed info")
            return None

        def sync_upload():
            if fields:
                return httpx.post(
                    upload_url,
                    data=fields,
                    files={"file": (file_name, file_bytes)},
                    timeout=60.0,
                )
            return httpx.put(
                upload_url,
                content=file_bytes,
                headers={"Content-Type": f"application/{file_ext}" if file_ext == "pdf" else f"image/{file_ext}"},
                timeout=60.0,
            )

        try:
            resp = await asyncio.to_thread(sync_upload)
            if resp.status_code not in (200, 201, 204):
                logger.error(f"presign_and_upload: S3 upload returned {resp.status_code}: {resp.text[:200]}")
                return None
            logger.debug(f"[EverMem presign] uploaded {file_type} '{file_name}' → {object_key}")
            return {"objectKey": object_key, "fileType": file_type, "fileName": file_name}
        except Exception as e:
            logger.error(f"presign_and_upload: S3 upload failed: {e}")
            return None

    # ------------------------------------------------------------------
    # Agent Memories API  —  POST /api/v1/memories/agent
    # ------------------------------------------------------------------

    async def add_agent_memories(
        self,
        user_id: str,
        session_id: str,
        messages: List[Dict],
        async_mode: bool = True,
    ) -> Optional[Dict]:
        """Add messages and extract memory into agent memory space (cases and skills)."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/memories/agent"
        body = {
            "user_id": user_id,
            "session_id": session_id,
            "messages": messages,
            "async_mode": async_mode,
        }

        def sync_post():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_post)
            if resp.status_code not in (200, 202):
                logger.error(f"EverMem v1 add_agent_memories returned {resp.status_code}: {resp.text[:200]}")
                return None
            return self._unwrap_v1_response(resp.json())
        except Exception as e:
            logger.error(f"Failed to add agent memories in EverMemOS: {e}")
            return None

    async def flush_agent_memories(self, user_id: str, session_id: str) -> Optional[str]:
        """Trigger agent-aware boundary detection on accumulated agent messages."""
        if not self.api_key:
            return None
        url = f"{self.api_url}/api/v1/memories/agent/flush"
        body = {
            "user_id": user_id,
            "session_id": session_id,
        }

        def sync_post():
            return httpx.post(url, headers=self._headers(), json=body, timeout=30.0)

        try:
            resp = await asyncio.to_thread(sync_post)
            if resp.status_code not in (200, 202):
                logger.error(f"EverMem v1 flush_agent_memories returned {resp.status_code}: {resp.text[:200]}")
                return "error"
            data = resp.json() if resp.text else {}
            inner = self._unwrap_v1_response(data)
            return inner.get("status", "unknown")
        except Exception as e:
            logger.error(f"Failed to flush agent memories in EverMemOS: {e}")
            return "error"

    # ------------------------------------------------------------------
    # utils
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_original_data_text(original_data) -> Optional[str]:
        if not original_data:
            return None

        if isinstance(original_data, str):
            stripped = original_data.strip()
            return stripped if stripped else None

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
