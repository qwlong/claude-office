"""Tests for Task model and TaskStatus enum."""

import pytest
from datetime import datetime, UTC

from app.models.tasks import Task, TaskStatus


class TestTaskStatus:
    def test_all_statuses_exist(self):
        expected = {
            "spawning", "working", "idle", "blocked", "pr_open", "ci_failed",
            "review_pending", "changes_requested", "approved",
            "merged", "done", "error",
        }
        assert {s.value for s in TaskStatus} == expected

    def test_status_is_str_enum(self):
        assert TaskStatus.spawning == "spawning"
        assert isinstance(TaskStatus.working, str)


class TestTask:
    def _make_task(self, **overrides) -> Task:
        defaults = {
            "id": "task-1",
            "external_session_id": "ao-sess-1",
            "adapter_type": "ao",
            "project_key": "my-project",
            "issue": "#123 Fix bug",
            "status": TaskStatus.working,
            "pr_url": None,
            "pr_number": None,
            "ci_status": None,
            "review_status": None,
            "worktree_path": "/tmp/worktree/123",
            "office_session_id": None,
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
        }
        defaults.update(overrides)
        return Task(**defaults)

    def test_create_task(self):
        task = self._make_task()
        assert task.id == "task-1"
        assert task.adapter_type == "ao"
        assert task.status == TaskStatus.working

    def test_camel_case_serialization(self):
        task = self._make_task()
        data = task.model_dump(by_alias=True, mode="json")
        assert "externalSessionId" in data
        assert "projectKey" in data
        assert "ciStatus" in data
        assert "officeSessionId" in data

    def test_optional_fields_default_none(self):
        task = self._make_task(pr_url=None, ci_status=None)
        assert task.pr_url is None
        assert task.ci_status is None

    def test_task_with_pr_info(self):
        task = self._make_task(
            status=TaskStatus.pr_open,
            pr_url="https://github.com/org/repo/pull/45",
            pr_number=45,
            ci_status="passing",
            review_status="pending",
        )
        assert task.pr_number == 45
        assert task.ci_status == "passing"
