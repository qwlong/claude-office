"""Models for orchestration tasks — independent of Agent lifecycle."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class TaskStatus(StrEnum):
    """Lifecycle stages for an orchestrated task."""

    spawning = "spawning"
    working = "working"
    pr_open = "pr_open"
    ci_failed = "ci_failed"
    review_pending = "review_pending"
    changes_requested = "changes_requested"
    approved = "approved"
    merged = "merged"
    done = "done"
    error = "error"


class Task(BaseModel):
    """An orchestrated task, tracked independently of Agent lifecycle."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    external_session_id: str
    adapter_type: str
    project_key: str
    issue: str | None = None
    status: TaskStatus
    pr_url: str | None = None
    pr_number: int | None = None
    ci_status: str | None = None
    review_status: str | None = None
    worktree_path: str | None = None
    office_session_id: str | None = None
    created_at: datetime
    updated_at: datetime
