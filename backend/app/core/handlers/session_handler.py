"""Handler for SESSION_START and SESSION_END events.

Responsible for:
- Starting / stopping task-file polling on session boundaries.
- Deriving the task-list identifier from the project root.
- Triggering state broadcasts after handling.
- Detecting and cleaning up orphaned agents after /clear.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core.broadcast_service import broadcast_sessions_update, broadcast_state
from app.core.state_machine import StateMachine
from app.core.task_file_poller import get_task_file_poller
from app.core.transcript_poller import get_transcript_poller
from app.models.events import Event, EventType

__all__ = [
    "handle_session_start",
    "handle_session_end",
    "ensure_task_poller_running",
]

logger = logging.getLogger(__name__)

# Grace period (seconds) before orphaned agents are removed.
ORPHAN_GRACE_PERIOD = 10


async def handle_session_start(
    sm: StateMachine,
    event: Event,
    ensure_task_file_poller_fn: EnsurePollFn,
) -> None:
    """Handle a SESSION_START event.

    Starts task-file polling for the new session. If agents from a previous
    session are still present (e.g. after /clear), marks them as orphaned and
    schedules cleanup after a grace period.

    Args:
        sm: The StateMachine for this session.
        event: The SESSION_START event.
        ensure_task_file_poller_fn: Callable that initialises the task-file
            poller if it has not been started yet.
    """
    # Detect orphaned agents from a previous session (e.g. after /clear)
    existing_agent_ids = sm.get_active_agent_ids()
    if existing_agent_ids:
        logger.info(
            f"SESSION_START with {len(existing_agent_ids)} existing agents — "
            f"scheduling orphan cleanup after {ORPHAN_GRACE_PERIOD}s"
        )
        sm.mark_agents_orphaned(existing_agent_ids)
        asyncio.create_task(_cleanup_orphaned_agents(sm, event.session_id, existing_agent_ids))

    ensure_task_file_poller_fn()
    task_poller = get_task_file_poller()
    if task_poller:
        task_list_id = event.data.task_list_id if event.data else None
        await task_poller.start_polling(event.session_id, task_list_id=task_list_id)
    await broadcast_state(event.session_id, sm)
    await broadcast_sessions_update()  # Push updated session list


async def _cleanup_orphaned_agents(
    sm: StateMachine,
    session_id: str,
    orphaned_agent_ids: list[str],
) -> None:
    """Wait for the grace period, then remove agents that are still orphaned.

    Agents that received new activity (subagent_info, tool events) during the
    grace period will have their ``orphaned`` flag cleared, so they are skipped.
    """
    await asyncio.sleep(ORPHAN_GRACE_PERIOD)

    transcript_poller = get_transcript_poller()
    removed = 0
    for agent_id in orphaned_agent_ids:
        agent = sm.agents.get(agent_id)
        if agent is None:
            continue  # Already removed by a normal subagent_stop
        if not agent.orphaned:
            logger.info(f"Orphaned agent {agent_id} received activity — keeping")
            continue

        # Check if transcript is still being written to
        if transcript_poller and await transcript_poller.is_polling(agent_id):
            logger.info(f"Orphaned agent {agent_id} still has active transcript — keeping")
            agent.orphaned = False
            continue

        sm.trigger_agent_departure(agent_id)
        sm.remove_agent(agent_id)
        if transcript_poller:
            await transcript_poller.stop_polling(agent_id)
        removed += 1

    if removed:
        logger.info(f"Cleaned up {removed} orphaned agents")
        await broadcast_state(session_id, sm)


async def handle_session_end(
    sm: StateMachine,
    event: Event,
) -> None:
    """Handle a SESSION_END event.

    Stops task-file polling for the ending session.

    Args:
        sm: The StateMachine for this session.
        event: The SESSION_END event.
    """
    task_poller = get_task_file_poller()
    if task_poller:
        await task_poller.stop_polling(event.session_id)
    await broadcast_state(event.session_id, sm)
    await broadcast_sessions_update()  # Push updated session list


async def ensure_task_poller_running(
    sm: StateMachine,
    event: Event,
    ensure_task_file_poller_fn: EnsurePollFn,
    derive_task_list_id_fn: DeriveTaskListIdFn,
) -> None:
    """Auto-start task polling for sessions that missed SESSION_START.

    Called on any non-session-boundary event.  If polling is not yet active
    for this session, starts it now so mid-session backend restarts are
    handled gracefully.

    Args:
        sm: The StateMachine for this session (unused here, kept for symmetry).
        event: The current event being processed.
        ensure_task_file_poller_fn: Callable that initialises the poller.
        derive_task_list_id_fn: Async callable that derives the task list ID
            from the session's project root.
    """
    if event.event_type in (EventType.SESSION_START, EventType.SESSION_END):
        return

    ensure_task_file_poller_fn()
    task_poller = get_task_file_poller()
    if task_poller and not await task_poller.is_polling(event.session_id):
        task_list_id = event.data.task_list_id if event.data else None
        if not task_list_id:
            task_list_id = await derive_task_list_id_fn(event.session_id)
        await task_poller.start_polling(event.session_id, task_list_id=task_list_id)


def derive_task_list_id_from_root(project_root: str | None) -> str | None:
    """Derive a task_list_id from the project root path.

    Checks whether ``~/.claude/tasks/<project_name>/`` exists with JSON files,
    which happens when ``CLAUDE_CODE_TASK_LIST_ID`` is set to the project name.

    Args:
        project_root: Absolute path to the git project root, or None.

    Returns:
        The project name if a named task folder is found, otherwise None.
    """
    if not project_root:
        return None
    project_name = Path(project_root).name
    tasks_dir = Path.home() / ".claude" / "tasks" / project_name
    if tasks_dir.exists() and any(tasks_dir.glob("*.json")):
        logger.debug(f"Derived task_list_id '{project_name}' from project root {project_root}")
        return project_name
    return None


# ---------------------------------------------------------------------------
# Callback-type aliases used in type annotations above.
# These are defined here as strings (forward references) so that the module
# can be imported without importing the EventProcessor itself.
# ---------------------------------------------------------------------------

from collections.abc import Awaitable, Callable  # noqa: E402 – after __all__

EnsurePollFn = Callable[[], None]
DeriveTaskListIdFn = Callable[[str], Awaitable[str | None]]
