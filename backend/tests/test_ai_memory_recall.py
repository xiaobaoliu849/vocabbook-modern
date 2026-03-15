import asyncio

from services.ai_service import AIService


class DummyEverMemService:
    def __init__(self):
        self.search_calls = []
        self.get_calls = []
        self.add_calls = []

    async def add_memory(
        self,
        content: str,
        user_id: str,
        sender: str,
        sender_name: str,
        flush: bool = False,
        group_id: str = None,
        group_name: str = None,
        role: str = "user",
        refer_list=None,
    ):
        self.add_calls.append(
            {
                "content": content,
                "user_id": user_id,
                "sender": sender,
                "sender_name": sender_name,
                "flush": flush,
                "group_id": group_id,
                "group_name": group_name,
                "role": role,
            }
        )
        return {"status": "success"}

    async def search_memories(
        self,
        query: str,
        user_id: str,
        min_score: float = 0.3,
        group_ids=None,
        memory_types=None,
        retrieve_method: str = "keyword",
        start_time=None,
        end_time=None,
        top_k: int = 10,
    ):
        self.search_calls.append({
            "query": query,
            "user_id": user_id,
            "min_score": min_score,
            "group_ids": group_ids,
            "memory_types": memory_types,
            "retrieve_method": retrieve_method,
            "top_k": top_k,
        })
        if group_ids == ["session-1"]:
            return [
                {
                    "content": "[历史对话] The user asked about today's weather.",
                    "type": "episodic_memory",
                    "score": 0.95,
                }
            ]
        lowered = query.lower()
        if "suancai" in lowered or "march 15" in lowered or "sausages" in lowered:
            return [
                {
                    "content": "[历史对话] Assistant responded to a user inquiry about suancai and ham sausage on March 15.",
                    "type": "episodic_memory",
                    "score": 0.9,
                },
                {
                    "content": "[历史对话] The user said they only remembered the suancai issue and ham sausage when talking about March 15.",
                    "type": "episodic_memory",
                    "score": 0.42,
                }
            ]
        return [
            {"content": "[用户画像] User likes discussing hobbies.", "type": "profile", "score": 1.0},
            {"content": "[历史对话] User once said thank you.", "type": "episodic_memory", "score": 0.22},
        ]

    async def get_memories(self, user_id: str = "user_001", group_ids=None, memory_type: str = "episodic_memory", start_time=None, end_time=None, page_size: int = 100):
        self.get_calls.append({"user_id": user_id, "group_ids": group_ids, "memory_type": memory_type, "page_size": page_size})
        if group_ids == ["session-1"]:
            return []
        return [
            {"content": "On March 14, the user asked whether the assistant knew who they were.", "timestamp": "2026-03-14T18:01:00+00:00", "role": "user", "sender_name": "User"},
            {"content": "The user mentioned suancai and sausages when talking about March 15.", "timestamp": "2026-03-15T01:00:00+00:00", "role": "user", "sender_name": "User"},
        ]


def test_recall_questions_fall_back_to_recent_memories():
    service = AIService(provider="openai", api_key="test-key", evermem_enabled=False)
    service.evermem_user_id = "cloud_demo"
    service.evermem_service = DummyEverMemService()

    captured = {}

    async def fake_call_llm(messages, temperature=0.7):
        captured["messages"] = messages
        return "ok"

    service._call_llm = fake_call_llm

    result = asyncio.run(
        service.chat(
            messages=[{"role": "user", "content": "What did I tell you before about March 15?"}],
            session_id="session-1",
        )
    )

    assert result["memory_saved"] is True
    assert result["memories_retrieved"] >= 1
    assert service.evermem_service.search_calls[0]["min_score"] == 0.15
    assert service.evermem_service.search_calls[0]["group_ids"] == ["session-1"]
    assert service.evermem_service.search_calls[0]["retrieve_method"] == "rrf"
    assert any(call["group_ids"] is None for call in service.evermem_service.search_calls)
    assert service.evermem_service.get_calls == [
        {"user_id": "cloud_demo", "group_ids": ["session-1"], "memory_type": "event_log", "page_size": 100},
        {"user_id": "cloud_demo", "group_ids": None, "memory_type": "event_log", "page_size": 100},
    ]
    assert any("suancai" in call["query"].lower() or "march 15" in call["query"].lower() for call in service.evermem_service.search_calls)
    assert service.evermem_service.add_calls[0]["group_id"] == "session-1"
    assert service.evermem_service.add_calls[0]["role"] == "user"
    assert service.evermem_service.add_calls[1]["group_id"] == "session-1"
    assert service.evermem_service.add_calls[1]["role"] == "assistant"
    assert service.evermem_service.add_calls[1]["flush"] is True

    system_prompt = captured["messages"][0]["content"]
    assert "User likes discussing hobbies" not in system_prompt
    assert "today's weather" not in system_prompt
    assert "Assistant responded to a user inquiry" not in system_prompt
    assert "suancai and sausages" in system_prompt
    assert "[事件记录]" in system_prompt
    assert "请优先总结精确的历史事实" in system_prompt


def test_generic_follow_up_recall_uses_recent_session_event_logs():
    service = AIService(provider="openai", api_key="test-key", evermem_enabled=False)
    service.evermem_user_id = "cloud_demo"
    service.evermem_service = DummyEverMemService()

    captured = {}

    async def fake_call_llm(messages, temperature=0.7):
        captured["messages"] = messages
        return "ok"

    async def session_get_memories(user_id: str = "user_001", group_ids=None, memory_type: str = "episodic_memory", start_time=None, end_time=None, page_size: int = 100):
        service.evermem_service.get_calls.append({"user_id": user_id, "group_ids": group_ids, "memory_type": memory_type, "page_size": page_size})
        if group_ids == ["session-1"]:
            return [
                {"content": "Do you remember that I said I only remembered the suancai issue and ham sausage when we talked about March 15?", "timestamp": "2026-03-15T02:24:00+00:00", "role": "user", "sender_name": "User"},
                {"content": "I only remembered the suancai issue and ham sausage when we talked about March 15.", "timestamp": "2026-03-15T02:23:00+00:00", "role": "user", "sender_name": "User"},
            ]
        return []

    async def empty_session_search(*args, **kwargs):
        service.evermem_service.search_calls.append({
            "query": kwargs.get("query"),
            "user_id": kwargs.get("user_id"),
            "min_score": kwargs.get("min_score"),
            "group_ids": kwargs.get("group_ids"),
            "memory_types": kwargs.get("memory_types"),
            "retrieve_method": kwargs.get("retrieve_method"),
            "top_k": kwargs.get("top_k"),
        })
        return []

    service._call_llm = fake_call_llm
    service.evermem_service.get_memories = session_get_memories
    service.evermem_service.search_memories = empty_session_search

    result = asyncio.run(
        service.chat(
            messages=[{"role": "user", "content": "What two food things did I say I remembered?"}],
            session_id="session-1",
        )
    )

    assert result["memories_retrieved"] >= 1
    system_prompt = captured["messages"][0]["content"]
    assert "suancai issue and ham sausage" in system_prompt
    assert "[事件记录]" in system_prompt
    assert "What two food things did I say I remembered?" not in system_prompt
