"""
EverMemOS Service
Service for interacting with EverMemOS long-term memory system.
"""
import httpx
import logging
from typing import List, Dict, Optional
import datetime
import uuid

logger = logging.getLogger(__name__)

class EverMemService:
    def __init__(self, api_url: str, api_key: str = None):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.headers = {"Content-Type": "application/json"}
        if self.api_key:
            self.headers["Authorization"] = f"Bearer {self.api_key}"

    async def add_memory(self, content: str, user_id: str = "user_001") -> Optional[Dict]:
        """
        Add a memory to EverMemOS.
        """
        url = f"{self.api_url}/api/v1/memories"

        # Generate a unique message ID if not provided (though typically this comes from the chat system)
        message_id = str(uuid.uuid4())

        # Current time in ISO format
        create_time = datetime.datetime.now(datetime.timezone.utc).isoformat()

        payload = {
            "message_id": message_id,
            "create_time": create_time,
            "sender": user_id,
            "content": content
        }

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, json=payload, headers=self.headers, timeout=10.0)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error(f"Failed to add memory to EverMemOS: {e}")
                return None

    async def search_memories(self, query: str, user_id: str = "user_001") -> List[Dict]:
        """
        Search for relevant memories in EverMemOS.
        """
        url = f"{self.api_url}/api/v1/memories/search"
        payload = {
            "query": query,
            "user_id": user_id,
            "memory_types": ["episodic_memory"],
            "retrieve_method": "hybrid"
        }

        async with httpx.AsyncClient() as client:
            try:
                # EverMemOS example uses GET with JSON body
                resp = await client.request("GET", url, json=payload, headers=self.headers, timeout=10.0)
                resp.raise_for_status()
                data = resp.json()

                # Parse the response structure based on the snippet
                # result -> memories (list of groups) -> memory details
                result = data.get("result", {})
                memories_groups = result.get("memories", [])

                # Flatten or extract relevant text
                extracted_memories = []
                for group in memories_groups:
                    if isinstance(group, list):
                        for mem in group:
                            if isinstance(mem, dict) and "content" in mem:
                                extracted_memories.append(mem)
                    elif isinstance(group, dict) and "content" in group:
                         extracted_memories.append(group)

                return extracted_memories
            except Exception as e:
                logger.error(f"Failed to search memories in EverMemOS: {e}")
                return []
