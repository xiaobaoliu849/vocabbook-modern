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

    async def get_memories(self, user_id: str = "user_001"):
        self.get_calls.append({"user_id": user_id})
        return [
            {"content": "On March 14, the user asked whether the assistant knew who they were."},
            {"content": "The user mentioned suancai and sausages when talking about March 15."},
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
    assert service.evermem_service.get_calls == []
    assert any("suancai" in call["query"].lower() or "march 15" in call["query"].lower() for call in service.evermem_service.search_calls)

    system_prompt = captured["messages"][0]["content"]
    assert "User likes discussing hobbies" not in system_prompt
    assert "Assistant responded to a user inquiry" not in system_prompt
    assert "suancai issue and ham sausage" in system_prompt
    assert "请优先总结最近几条具体事实" in system_prompt
