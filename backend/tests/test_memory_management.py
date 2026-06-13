"""Integration tests for the memory management endpoints in routers/ai.py.

These tests mock out the EverMemService layer so we exercise the route handlers,
validation, and owner-key resolution without hitting the EverMind cloud.
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


def _evermem_headers(enabled: bool = True) -> dict:
    return {
        "X-EverMem-Enabled": "true" if enabled else "false",
        "X-EverMem-Url": "https://api.evermind.ai",
        "X-EverMem-Key": "test-key",
        "X-Client-Id": "test-client-id",
        "Authorization": "Bearer test-token",
    }


# ---------------------------------------------------------------------------
# GET /api/ai/memories
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_memories_requires_evermem(client):
    resp = client.get("/api/ai/memories", headers={"X-EverMem-Enabled": "false"})
    assert resp.status_code == 400
    assert "EverMemOS not enabled" in resp.text


@pytest.mark.asyncio
async def test_list_memories_rejects_unknown_type(client):
    headers = _evermem_headers()
    resp = client.get("/api/ai/memories", headers=headers, params={"memory_type": "bogus_type"})
    assert resp.status_code == 400
    assert "Unsupported memory_type" in resp.text


@pytest.mark.asyncio
async def test_list_memories_returns_paginated_items(client):
    fake_items = [
        {
            "memory_id": "m1",
            "content": "User likes suancai",
            "raw_content": None,
            "type": "episodic_memory",
            "group_id": "cloud_x::g1",
            "timestamp": 1_700_000_000_000,
            "role": "user",
            "sender_name": "User",
        },
        {
            "memory_id": "m2",
            "content": "User likes ham sausage",
            "raw_content": None,
            "type": "episodic_memory",
            "group_id": "cloud_x::g1",
            "timestamp": 1_700_000_001_000,
            "role": "user",
            "sender_name": "User",
        },
    ]

    with patch(
        "services.evermem_config.resolve_runtime_service",
    ) as mock_resolve, patch(
        "routers.ai._resolve_chat_owner_key", new=AsyncMock(return_value="cloud_test"),
    ):
        mock_service = MagicMock()
        mock_service.get_memories = AsyncMock(return_value=fake_items)
        mock_resolve.return_value = mock_service

        headers = _evermem_headers()
        resp = client.get(
            "/api/ai/memories",
            headers=headers,
            params={"memory_type": "episodic_memory", "page": 1, "page_size": 20},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["memory_type"] == "episodic_memory"
    assert body["page"] == 1
    assert body["page_size"] == 20
    assert body["count"] == 2
    assert [it["memory_id"] for it in body["items"]] == ["m1", "m2"]


@pytest.mark.asyncio
async def test_list_memories_clamps_page_bounds(client):
    with patch("services.evermem_config.resolve_runtime_service") as mock_resolve, patch(
        "routers.ai._resolve_chat_owner_key", new=AsyncMock(return_value="cloud_test"),
    ):
        mock_service = MagicMock()
        mock_service.get_memories = AsyncMock(return_value=[])
        mock_resolve.return_value = mock_service

        headers = _evermem_headers()
        resp = client.get(
            "/api/ai/memories",
            headers=headers,
            params={"memory_type": "profile", "page": 0, "page_size": 9999},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 100

    called_kwargs = mock_service.get_memories.call_args.kwargs
    assert called_kwargs["page"] == 1
    assert called_kwargs["page_size"] == 100


# ---------------------------------------------------------------------------
# DELETE /api/ai/memories/{memory_id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_memory_single(client):
    with patch("services.evermem_config.resolve_runtime_service") as mock_resolve, patch(
        "routers.ai._resolve_chat_owner_key", new=AsyncMock(return_value="cloud_test_owner"),
    ):
        mock_service = MagicMock()
        mock_service.delete_memories = AsyncMock(return_value=True)
        mock_service.get_memories = AsyncMock(return_value=[
            {"memory_id": "mem_abc", "type": "episodic_memory"},
        ])
        mock_resolve.return_value = mock_service

        headers = _evermem_headers()
        resp = client.delete("/api/ai/memories/mem_abc", headers=headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"success": True, "memory_id": "mem_abc"}
    mock_service.delete_memories.assert_awaited_once_with(memory_id="mem_abc")


@pytest.mark.asyncio
async def test_delete_memory_404_when_not_owned(client):
    with patch("services.evermem_config.resolve_runtime_service") as mock_resolve, patch(
        "routers.ai._resolve_chat_owner_key", new=AsyncMock(return_value="cloud_test_owner"),
    ):
        mock_service = MagicMock()
        mock_service.delete_memories = AsyncMock(return_value=True)
        mock_service.get_memories = AsyncMock(return_value=[])
        mock_resolve.return_value = mock_service

        headers = _evermem_headers()
        resp = client.delete("/api/ai/memories/mem_foreign", headers=headers)

    assert resp.status_code == 404
    mock_service.delete_memories.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_memory_requires_evermem(client):
    resp = client.delete(
        "/api/ai/memories/mem_abc",
        headers={"X-EverMem-Enabled": "false"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/ai/memories/clear
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_clear_memories_batch_for_owner(client):
    with patch("services.evermem_config.resolve_runtime_service") as mock_resolve, patch(
        "routers.ai._resolve_chat_owner_key", new=AsyncMock(return_value="cloud_test_owner"),
    ):
        mock_service = MagicMock()
        mock_service.delete_memories = AsyncMock(return_value=True)
        mock_resolve.return_value = mock_service

        headers = {**_evermem_headers(), "Content-Type": "application/json"}
        resp = client.post("/api/ai/memories/clear", headers=headers, json={})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["group_id"] is None
    assert body["user_id"] == "cloud_test_owner"
    mock_service.delete_memories.assert_awaited_once()


@pytest.mark.asyncio
async def test_clear_memories_with_group_scope(client):
    with patch("services.evermem_config.resolve_runtime_service") as mock_resolve, patch(
        "routers.ai._resolve_chat_owner_key", new=AsyncMock(return_value="cloud_test_owner"),
    ):
        mock_service = MagicMock()
        mock_service.delete_memories = AsyncMock(return_value=True)
        mock_resolve.return_value = mock_service

        headers = {**_evermem_headers(), "Content-Type": "application/json"}
        resp = client.post(
            "/api/ai/memories/clear",
            headers=headers,
            json={"group_id": "cloud_x::foresight"},
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert body["group_id"] == "cloud_x::foresight"

    kwargs = mock_service.delete_memories.call_args.kwargs
    assert kwargs["group_id"] == "cloud_x::foresight"


@pytest.mark.asyncio
async def test_clear_memories_requires_evermem(client):
    resp = client.post(
        "/api/ai/memories/clear",
        headers={"X-EverMem-Enabled": "false"},
        json={},
    )
    assert resp.status_code == 400
