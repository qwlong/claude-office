"""TaskService — manages orchestrated task lifecycle."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import uuid4

from app.config import get_settings
from app.core.broadcast_service import broadcast_tasks_update
from app.core.project_registry import normalize_project_key
from app.models.tasks import Task, TaskStatus
from app.services.adapters import ExternalSession
from app.services.adapters.ao import AOAdapter

logger = logging.getLogger(__name__)


def _get_session_working_dirs() -> dict[str, str | None]:
    """Get working_directory for all active sessions from the event processor."""
    from app.core.event_processor import event_processor

    dirs: dict[str, str | None] = {}
    for sid in event_processor.sessions:
        project = event_processor.project_registry.get_project_for_session(sid)
        if project and project.root:
            dirs[sid] = project.root
    return dirs


class TaskService:
    """Manages task lifecycle, session matching, and state broadcasting."""

    def __init__(self) -> None:
        self.adapter: AOAdapter | None = None
        self.tasks: dict[str, Task] = {}
        self._poll_task: asyncio.Task | None = None  # type: ignore[type-arg]

    async def start(self) -> None:
        """Initialize adapter from config. Skip if AO_URL is empty."""
        settings = get_settings()
        if not settings.AO_URL:
            logger.info("AO_URL not set, task orchestration disabled")
            return
        self.adapter = AOAdapter(settings.AO_URL)
        await self.adapter.connect()
        self._poll_task = asyncio.create_task(self._poll_loop())
        logger.info("TaskService started with AO adapter")

    async def stop(self) -> None:
        """Cancel polling loop."""
        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None

    @property
    def connected(self) -> bool:
        return self.adapter.connected if self.adapter else False

    async def spawn(self, project_id: str, issue: str) -> Task:
        """Dispatch new task via adapter, create internal Task."""
        if not self.adapter or not self.adapter.connected:
            raise RuntimeError("No orchestration system connected")
        external = await self.adapter.spawn(project_id, issue)
        # Send the task description to the agent after spawn
        if issue:
            asyncio.create_task(self.adapter.send_message(external.session_id, issue))
        now = datetime.now(UTC)
        task = Task(
            id=str(uuid4()),
            external_session_id=external.session_id,
            adapter_type=self.adapter.adapter_type,
            project_key=normalize_project_key(project_id),
            issue=issue or external.issue,
            status=TaskStatus(external.status),
            pr_url=external.pr_url,
            pr_number=external.pr_number,
            ci_status=external.ci_status,
            review_status=external.review_status,
            worktree_path=external.worktree_path,
            office_session_id=None,
            created_at=now,
            updated_at=now,
        )
        self.tasks[task.id] = task
        await self._broadcast()
        return task

    async def _poll_loop(self) -> None:
        """Poll adapter every N seconds, update tasks, match sessions, broadcast."""
        interval = get_settings().AO_POLL_INTERVAL
        while True:
            await asyncio.sleep(interval)
            if not self.adapter:
                continue
            try:
                sessions = await self.adapter.poll()
                changed = self._update_tasks(sessions)
                if changed:
                    self._match_all_sessions()
                    await self._broadcast()
                self.adapter.connected = True
            except Exception:
                logger.warning("AO poll failed", exc_info=True)
                self.adapter.connected = False

    def _update_tasks(self, sessions: list[ExternalSession]) -> bool:
        """Sync external sessions into internal tasks. Returns True if anything changed."""
        changed = False

        for ext in sessions:
            # Find existing task by external_session_id
            existing = None
            for task in self.tasks.values():
                if task.external_session_id == ext.session_id:
                    existing = task
                    break

            if existing is None:
                now = datetime.now(UTC)
                task = Task(
                    id=str(uuid4()),
                    external_session_id=ext.session_id,
                    adapter_type=self.adapter.adapter_type if self.adapter else "unknown",
                    project_key=normalize_project_key(ext.project_id),
                    issue=ext.issue,
                    status=TaskStatus(ext.status),
                    pr_url=ext.pr_url,
                    pr_number=ext.pr_number,
                    ci_status=ext.ci_status,
                    review_status=ext.review_status,
                    worktree_path=ext.worktree_path,
                    office_session_id=None,
                    created_at=now,
                    updated_at=now,
                )
                self.tasks[task.id] = task
                changed = True
            else:
                new_status = TaskStatus(ext.status)
                if (
                    existing.status != new_status
                    or existing.pr_url != ext.pr_url
                    or existing.pr_number != ext.pr_number
                    or existing.ci_status != ext.ci_status
                    or existing.review_status != ext.review_status
                    or existing.worktree_path != ext.worktree_path
                ):
                    existing.status = new_status
                    existing.pr_url = ext.pr_url
                    existing.pr_number = ext.pr_number
                    existing.ci_status = ext.ci_status
                    existing.review_status = ext.review_status
                    existing.worktree_path = ext.worktree_path
                    existing.updated_at = datetime.now(UTC)
                    changed = True

        # Mark tasks as done if their session disappeared from AO
        active_session_ids = {ext.session_id for ext in sessions}
        for task in self.tasks.values():
            if (
                task.external_session_id not in active_session_ids
                and task.status not in (TaskStatus.done, TaskStatus.merged, TaskStatus.error)
            ):
                task.status = TaskStatus.done
                task.updated_at = datetime.now(UTC)
                changed = True

        return changed

    def _match_all_sessions(self) -> None:
        """Match tasks to office sessions via worktree_path."""
        dirs = _get_session_working_dirs()

        for task in self.tasks.values():
            if not task.worktree_path:
                continue
            for sid, wdir in dirs.items():
                if not wdir:
                    continue
                if (
                    task.worktree_path.startswith(wdir)
                    or wdir.startswith(task.worktree_path)
                ):
                    if task.office_session_id != sid:
                        task.office_session_id = sid
                    break

    async def _broadcast(self) -> None:
        """Push tasks_update message to all /ws/projects clients."""
        await broadcast_tasks_update(
            tasks=list(self.tasks.values()),
            connected=self.connected,
            adapter_type=self.adapter.adapter_type if self.adapter else None,
        )

    def get_tasks(self, project_key: str | None = None) -> list[Task]:
        """Get all tasks, optionally filtered by project."""
        tasks = list(self.tasks.values())
        if project_key:
            tasks = [t for t in tasks if t.project_key == project_key]
        return sorted(tasks, key=lambda t: t.created_at, reverse=True)


_task_service: TaskService | None = None


def get_task_service() -> TaskService:
    """Get or create the singleton TaskService."""
    global _task_service
    if _task_service is None:
        _task_service = TaskService()
    return _task_service
