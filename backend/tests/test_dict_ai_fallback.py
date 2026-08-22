"""Regression tests for the dict AI fallback's HTTP client isolation.

The fallback runs inside a short-lived event loop created by ``asyncio.run``
(see ``DictService.search_word_ai_fallback``). It must therefore never touch
the process-wide shared AsyncClient from ``services.http_client`` — that
client's connection pool is bound to whichever event loop used it first, and
driving it from another loop fails with "Event loop is closed" /
"attached to a different loop" errors.
"""
import asyncio
import json
from unittest.mock import patch

import httpx
import pytest

import services.ai_service as ai_service_module
from services.dict_service import DictService


def _llm_response_payload(content: str) -> dict:
    return {
        "choices": [
            {"message": {"content": content}}
        ]
    }


FENCED_JSON = (
    "```json\n"
    "{\n"
    '    "phonetic": "/ˌserənˈdɪpɪti/",\n'
    '    "meaning": "n. 意外发现珍宝的运气",\n'
    '    "example": "They found the café by pure serendipity.\\n他们纯属偶然发现了这家咖啡馆。"\n'
    "}\n"
    "```"
)


def _mock_client_factory(handler, created_clients):
    class _MockAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs.pop("transport", None)
            super().__init__(*args, transport=httpx.MockTransport(handler), **kwargs)
            created_clients.append(self)

    return _MockAsyncClient


@pytest.fixture
def ai_env(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("AI_API_KEY", "test-key")


def test_call_llm_uses_injected_client(ai_env):
    """_call_llm honors an explicitly passed client instead of the shared one."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=_llm_response_payload("hello"))

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(ai_service_module, "get_http_client", side_effect=AssertionError("shared client must not be used")):
                ai = ai_service_module.AIService()
                return await ai._call_llm([{"role": "user", "content": "hi"}], client=client)

    result = asyncio.run(run())
    assert result == "hello"
    assert len(calls) == 1


def test_ai_fallback_avoids_shared_client(ai_env):
    """The fallback parses the LLM JSON without ever touching the shared client."""
    created_clients = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_llm_response_payload(FENCED_JSON))

    with patch.object(
        ai_service_module,
        "get_http_client",
        side_effect=AssertionError("fallback must not use the shared client"),
    ), patch.object(
        httpx,
        "AsyncClient",
        _mock_client_factory(handler, created_clients),
    ):
        result = DictService.search_word_ai_fallback("serendipity")

    assert result is not None
    assert result["word"] == "serendipity"
    assert result["phonetic"] == "/ˌserənˈdɪpɪti/"
    assert "serendipity" in result["meaning"] or "意外发现" in result["meaning"]
    assert len(created_clients) == 1
    # The dedicated client must be closed again after the call.
    assert created_clients[0].is_closed


def test_ai_fallback_returns_none_without_key(monkeypatch):
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with patch.object(
        ai_service_module,
        "get_http_client",
        side_effect=AssertionError("must not even create a client without a key"),
    ):
        assert DictService.search_word_ai_fallback("serendipity") is None
