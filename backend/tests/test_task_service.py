"""Tests for TaskService — lifecycle, matching, and broadcasting."""

import asyncio
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.tasks import Task, TaskStatus
from app.services.adapters import ExternalSession
from app.services.task_service import TaskService, get_task_service


@pytest.fixture
def mock_adapter():
    adapter = MagicMock()
    adapter.adapter_type = "ao"
    adapter.connected = True
    adapter.connect = AsyncMock(return_value=True)
    adapter.poll = AsyncMock(return_value=[])
    adapter.spawn = AsyncMock()
    adapter.get_projects = AsyncMock(return_value=[])
    return adapter


@pytest.fixture
def service(mock_adapter):
    svc = TaskService()
    svc.adapter = mock_adapter
    return svc


class TestTaskServiceSpawn:
    @pytest.mark.asyncio
    async def test_spawn_creates_task(self, service, mock_adapter):
        mock_adapter.spawn.return_value = ExternalSession(
            session_id="ao-1",
            project_id="my-project",
            worktree_path="/tmp/wt/1",
            issue="#42",
            status="spawning",
        )
        with patch("app.services.task_service.broadcast_tasks_update", new_callable=AsyncMock):
            task = await service.spawn("my-project", "#42")

        assert task.external_session_id == "ao-1"
        assert task.project_key == "my-project"
        assert task.status == TaskStatus.spawning
        assert task.id in service.tasks

    @pytest.mark.asyncio
    async def test_spawn_fails_when_disconnected(self, service, mock_adapter):
        mock_adapter.connected = False
        service.adapter = mock_adapter
        with pytest.raises(Exception, match="No orchestration system connected"):
            await service.spawn("proj", "#1")


class TestTaskServiceUpdateTasks:
    def test_update_creates_new_task(self, service):
        sessions = [
            ExternalSession(
                session_id="ao-1",
                project_id="proj-a",
                status="working",
                issue="#10",
            ),
        ]
        changed = service._update_tasks(sessions)
        assert changed is True
        assert len(service.tasks) == 1
        task = list(service.tasks.values())[0]
        assert task.external_session_id == "ao-1"
        assert task.status == TaskStatus.working

    def test_update_modifies_existing_task(self, service):
        sessions1 = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
        ]
        service._update_tasks(sessions1)

        sessions2 = [
            ExternalSession(
                session_id="ao-1",
                project_id="proj-a",
                status="pr_open",
                pr_url="https://github.com/pull/1",
                pr_number=1,
                ci_status="passing",
            ),
        ]
        changed = service._update_tasks(sessions2)
        assert changed is True
        task = list(service.tasks.values())[0]
        assert task.status == TaskStatus.pr_open
        assert task.pr_url == "https://github.com/pull/1"

    def test_no_change_returns_false(self, service):
        sessions = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
        ]
        service._update_tasks(sessions)
        changed = service._update_tasks(sessions)
        assert changed is False


class TestTaskServiceMatchSessions:
    def test_match_by_worktree_path(self, service):
        sessions = [
            ExternalSession(
                session_id="ao-1",
                project_id="proj-a",
                status="working",
                worktree_path="/home/user/.agent-orchestrator/abc/worktrees/ao-1",
            ),
        ]
        service._update_tasks(sessions)

        with patch("app.services.task_service._get_session_working_dirs") as mock_dirs:
            mock_dirs.return_value = {
                "office-sess-1": "/home/user/.agent-orchestrator/abc/worktrees/ao-1",
            }
            service._match_all_sessions()

        task = list(service.tasks.values())[0]
        assert task.office_session_id == "office-sess-1"


class TestTaskServiceGetTasks:
    def test_get_all_tasks(self, service):
        sessions = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
            ExternalSession(session_id="ao-2", project_id="proj-b", status="spawning"),
        ]
        service._update_tasks(sessions)
        tasks = service.get_tasks()
        assert len(tasks) == 2

    def test_filter_by_project(self, service):
        sessions = [
            ExternalSession(session_id="ao-1", project_id="proj-a", status="working"),
            ExternalSession(session_id="ao-2", project_id="proj-b", status="spawning"),
        ]
        service._update_tasks(sessions)
        tasks = service.get_tasks(project_key="proj-a")
        assert len(tasks) == 1
        assert tasks[0].project_key == "proj-a"


class TestTaskServiceConnected:
    def test_connected_with_adapter(self, service, mock_adapter):
        mock_adapter.connected = True
        assert service.connected is True

    def test_not_connected_without_adapter(self):
        svc = TaskService()
        assert svc.connected is False
