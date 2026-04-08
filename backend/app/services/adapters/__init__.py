"""Adapter protocol for external orchestration systems."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class ExternalSession(BaseModel):
    """Normalized session info from any external orchestration system."""

    session_id: str
    project_id: str
    worktree_path: str | None = None
    issue: str | None = None
    status: str
    pr_url: str | None = None
    pr_number: int | None = None
    ci_status: str | None = None
    review_status: str | None = None


@runtime_checkable
class TaskAdapter(Protocol):
    """Interface for external orchestration system adapters."""

    adapter_type: str
    connected: bool

    async def connect(self) -> bool:
        """Probe if the external system is reachable."""
        ...

    async def spawn(self, project_id: str, issue: str) -> ExternalSession:
        """Dispatch a new task to the external system."""
        ...

    async def poll(self) -> list[ExternalSession]:
        """Fetch current session states from the external system."""
        ...

    async def get_projects(self) -> list[dict]:
        """Get configured projects from the external system."""
        ...
