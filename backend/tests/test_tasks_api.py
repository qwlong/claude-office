"""Tests for /api/v1/tasks endpoints."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, UTC

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.tasks import Task, TaskStatus
from app.services.task_service import TaskService


def _make_task(**overrides) -> Task:
    defaults = {
        "id": "task-1",
        "external_session_id": "ao-1",
        "adapter_type": "ao",
        "project_key": "my-project",
        "issue": "#42",
        "status": TaskStatus.working,
        "pr_url": None,
        "pr_number": None,
        "ci_status": None,
        "review_status": None,
        "worktree_path": None,
        "office_session_id": None,
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }
    defaults.update(overrides)
    return Task(**defaults)


@pytest.fixture
def mock_task_service():
    svc = MagicMock(spec=TaskService)
    svc.connected = True
    svc.adapter = MagicMock()
    svc.adapter.adapter_type = "ao"
    svc.get_tasks.return_value = [_make_task()]
    svc.tasks = {"task-1": _make_task()}
    svc.spawn = AsyncMock()
    svc.adapter.get_projects = AsyncMock(return_value=[{"id": "proj-a", "name": "My Project"}])
    return svc


@pytest.mark.asyncio
class TestTasksAPI:
    async def test_get_status(self, mock_task_service):
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/tasks/status")
                assert resp.status_code == 200
                data = resp.json()
                assert data["connected"] is True
                assert data["adapterType"] == "ao"

    async def test_get_tasks(self, mock_task_service):
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/tasks")
                assert resp.status_code == 200
                data = resp.json()
                assert len(data) == 1
                assert data[0]["projectKey"] == "my-project"

    async def test_get_tasks_not_connected(self, mock_task_service):
        mock_task_service.connected = False
        mock_task_service.adapter = None
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/tasks/status")
                assert resp.status_code == 200
                data = resp.json()
                assert data["connected"] is False

    async def test_spawn_task(self, mock_task_service):
        mock_task_service.spawn.return_value = _make_task(status=TaskStatus.spawning)
        with patch("app.api.routes.tasks.get_task_service", return_value=mock_task_service):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/tasks/spawn",
                    json={"project_id": "my-project", "issue": "#42"},
                )
                assert resp.status_code == 200
                data = resp.json()
                assert data["status"] == "spawning"
