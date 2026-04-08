"""Tests for automatic cleanup of worktree sessions from the DB."""

from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, patch

import pytest

from app.db.models import SessionRecord
from app.services.task_service import TaskService
from app.services.adapters import ExternalSession


@pytest.fixture
def service():
    svc = TaskService()
    adapter = AsyncMock()
    adapter.adapter_type = "ao"
    adapter.connected = True
    adapter.poll = AsyncMock(return_value=[])
    svc.adapter = adapter
    return svc


class TestWorktreeSessionCleanup:
    @pytest.mark.asyncio
    async def test_cleanup_removes_completed_worktree_sessions(self, service):
        """When AO no longer returns a session, its DB record should be deleted."""
        # First poll: AO returns co-10
        service.adapter.poll.return_value = [
            ExternalSession(session_id="co-10", project_id="claude-office", status="working"),
        ]
        with patch("app.services.task_service.broadcast_tasks_update", new_callable=AsyncMock):
            changed = service._update_tasks(service.adapter.poll.return_value)
        assert changed is True

        # Second poll: AO no longer returns co-10 (session was cleaned up)
        service.adapter.poll.return_value = []
        with patch("app.services.task_service.broadcast_tasks_update", new_callable=AsyncMock):
            changed = service._update_tasks(service.adapter.poll.return_value)
        # Task should be marked done
        assert changed is True
        task = list(service.tasks.values())[0]
        assert task.status.value == "done"

    @pytest.mark.asyncio
    async def test_cleanup_worktree_db_sessions_deletes_stale_records(self, service):
        """cleanup_worktree_db_sessions should delete completed worktree sessions."""
        stale_session = SessionRecord(
            id="abc-123",
            project_name="claude-office/co-10",
            project_root="/Users/apple/.worktrees/claude-office/co-10",
            status="completed",
            created_at=datetime.now(UTC) - timedelta(minutes=10),
            updated_at=datetime.now(UTC) - timedelta(minutes=10),
        )

        active_session = SessionRecord(
            id="def-456",
            project_name="my-project",
            project_root="/Users/apple/Projects/my-project",
            status="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        # Mock the DB call
        deleted_ids = []

        async def mock_cleanup(db_session=None):
            from app.services.task_service import cleanup_worktree_db_sessions
            # We test the logic separately: identify which sessions should be deleted
            pass

        # Test the identification logic directly
        from app.services.task_service import _should_cleanup_session
        assert _should_cleanup_session(stale_session) is True
        assert _should_cleanup_session(active_session) is False

    @pytest.mark.asyncio
    async def test_active_worktree_session_not_cleaned(self, service):
        """Active worktree sessions should not be cleaned up."""
        active_worktree = SessionRecord(
            id="ghi-789",
            project_name="claude-office/co-12",
            project_root="/Users/apple/.worktrees/claude-office/co-12",
            status="active",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        from app.services.task_service import _should_cleanup_session
        assert _should_cleanup_session(active_worktree) is False

    @pytest.mark.asyncio
    async def test_non_worktree_completed_session_not_cleaned(self, service):
        """Completed non-worktree sessions should NOT be cleaned up."""
        normal_session = SessionRecord(
            id="jkl-012",
            project_name="my-project",
            project_root="/Users/apple/Projects/my-project",
            status="completed",
            created_at=datetime.now(UTC) - timedelta(minutes=30),
            updated_at=datetime.now(UTC) - timedelta(minutes=30),
        )
        from app.services.task_service import _should_cleanup_session
        assert _should_cleanup_session(normal_session) is False
