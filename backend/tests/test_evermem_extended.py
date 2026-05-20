import asyncio
import pytest
from unittest.mock import MagicMock, patch
import httpx
from services.evermem_service import EverMemService


@pytest.fixture
def service():
    return EverMemService(api_url="https://api.evermind.ai", api_key="test_api_key")


@pytest.mark.asyncio
async def test_delete_memories_single(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 204
        mock_post.return_value = mock_resp

        result = await service.delete_memories(memory_id="mem_123")

        assert result is True
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/memories/delete",
            headers={"Authorization": "Bearer test_api_key"},
            json={"memory_id": "mem_123"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_delete_memories_batch(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 204
        mock_post.return_value = mock_resp

        result = await service.delete_memories(
            user_id="user_123", group_id="group_456", session_id="sess_789", sender_id="send_abc"
        )

        assert result is True
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/memories/delete",
            headers={"Authorization": "Bearer test_api_key"},
            json={
                "user_id": "user_123",
                "group_id": "group_456",
                "session_id": "sess_789",
                "sender_id": "send_abc",
            },
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_create_group(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"group_id": "group_123", "name": "Test Group"}}
        mock_post.return_value = mock_resp

        result = await service.create_group(
            group_id="group_123", name="Test Group", description="Desc"
        )

        assert result == {"group_id": "group_123", "name": "Test Group"}
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/groups",
            headers={"Authorization": "Bearer test_api_key"},
            json={"group_id": "group_123", "name": "Test Group", "description": "Desc"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_get_group_details(service):
    with patch("httpx.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"group_id": "group_123", "name": "Test Group"}}
        mock_get.return_value = mock_resp

        result = await service.get_group_details(group_id="group_123")

        assert result == {"group_id": "group_123", "name": "Test Group"}
        mock_get.assert_called_once_with(
            "https://api.evermind.ai/api/v1/groups/group_123",
            headers={"Authorization": "Bearer test_api_key"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_update_group(service):
    with patch("httpx.patch") as mock_patch:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"group_id": "group_123", "name": "New Name"}}
        mock_patch.return_value = mock_resp

        result = await service.update_group(group_id="group_123", name="New Name")

        assert result == {"group_id": "group_123", "name": "New Name"}
        mock_patch.assert_called_once_with(
            "https://api.evermind.ai/api/v1/groups/group_123",
            headers={"Authorization": "Bearer test_api_key"},
            json={"name": "New Name"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_create_sender(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"sender_id": "send_123", "name": "Test Sender"}}
        mock_post.return_value = mock_resp

        result = await service.create_sender(sender_id="send_123", name="Test Sender")

        assert result == {"sender_id": "send_123", "name": "Test Sender"}
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/senders",
            headers={"Authorization": "Bearer test_api_key"},
            json={"sender_id": "send_123", "name": "Test Sender"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_get_sender_details(service):
    with patch("httpx.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"sender_id": "send_123", "name": "Test Sender"}}
        mock_get.return_value = mock_resp

        result = await service.get_sender_details(sender_id="send_123")

        assert result == {"sender_id": "send_123", "name": "Test Sender"}
        mock_get.assert_called_once_with(
            "https://api.evermind.ai/api/v1/senders/send_123",
            headers={"Authorization": "Bearer test_api_key"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_update_sender(service):
    with patch("httpx.patch") as mock_patch:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"sender_id": "send_123", "name": "New Sender Name"}}
        mock_patch.return_value = mock_resp

        result = await service.update_sender(sender_id="send_123", name="New Sender Name")

        assert result == {"sender_id": "send_123", "name": "New Sender Name"}
        mock_patch.assert_called_once_with(
            "https://api.evermind.ai/api/v1/senders/send_123",
            headers={"Authorization": "Bearer test_api_key"},
            json={"name": "New Sender Name"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_get_task_status(service):
    with patch("httpx.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"task_id": "task_123", "status": "success"}}
        mock_get.return_value = mock_resp

        result = await service.get_task_status(task_id="task_123")

        assert result == {"task_id": "task_123", "status": "success"}
        mock_get.assert_called_once_with(
            "https://api.evermind.ai/api/v1/tasks/task_123",
            headers={"Authorization": "Bearer test_api_key"},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_upload_multimodal_data(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": 0, "result": {"data": {"objectList": []}}}
        mock_post.return_value = mock_resp

        result = await service.upload_multimodal_data(
            [{"fileName": "test.png", "fileType": "image", "fileId": "123"}]
        )

        assert result == {"status": 0, "result": {"data": {"objectList": []}}}
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/object/sign",
            headers={"Authorization": "Bearer test_api_key"},
            json={"objectList": [{"fileName": "test.png", "fileType": "image", "fileId": "123"}]},
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_add_agent_memories(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"task_id": "task_agent"}}
        mock_post.return_value = mock_resp

        result = await service.add_agent_memories(
            user_id="user_123", session_id="sess_123", messages=[{"role": "user", "timestamp": 123, "content": "hello"}]
        )

        assert result == {"task_id": "task_agent"}
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/memories/agent",
            headers={"Authorization": "Bearer test_api_key"},
            json={
                "user_id": "user_123",
                "session_id": "sess_123",
                "messages": [{"role": "user", "timestamp": 123, "content": "hello"}],
                "async_mode": True,
            },
            timeout=30.0,
        )


@pytest.mark.asyncio
async def test_flush_agent_memories(service):
    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": {"status": "extracted"}}
        mock_post.return_value = mock_resp

        result = await service.flush_agent_memories(user_id="user_123", session_id="sess_123")

        assert result == "extracted"
        mock_post.assert_called_once_with(
            "https://api.evermind.ai/api/v1/memories/agent/flush",
            headers={"Authorization": "Bearer test_api_key"},
            json={"user_id": "user_123", "session_id": "sess_123"},
            timeout=30.0,
        )
