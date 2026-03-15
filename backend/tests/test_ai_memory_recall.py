import asyncio

from services.ai_service import AIService


class DummyEverMemService:
    def __init__(self):
        self.search_calls = []
        self.get_calls = []
        self.add_calls = []

    async def add_memory(self, content: str, user_id: str, sender: str, sender_name: str, flush: bool = False):
        self.add_calls.append(
            {
                "content": content,
                "user_id": user_id,
                "sender": sender,
                "sender_name": sender_name,
                "flush": flush,
            }
        )
        return {"status": "success"}

    async def search_memories(self, query: str, user_id: str, min_score: float = 0.3):
        self.search_calls.append({"query": query, "user_id": user_id, "min_score": min_score})
        return []

    async def get_memories(self, user_id: str = "user_001"):
        self.get_calls.append({"user_id": user_id})
        return [
            {"content": "用户前面提到他记得酸菜鱼。"},
            {"content": "用户还说 March 15 matters to him."},
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
    assert result["memories_retrieved"] == 2
    assert service.evermem_service.search_calls[0]["min_score"] == 0.15
    assert service.evermem_service.get_calls == [{"user_id": "cloud_demo"}]

    system_prompt = captured["messages"][0]["content"]
    assert "用户前面提到他记得酸菜鱼" in system_prompt
    assert "请优先直接总结这些具体记忆" in system_prompt
