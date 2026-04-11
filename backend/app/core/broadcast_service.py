"""WebSocket broadcasting helpers for the EventProcessor.

Provides standalone async functions that send state and event payloads to all
WebSocket connections for a given session.  Extracted from EventProcessor so
that handler modules can import just what they need without pulling in the
full EventProcessor class.
"""

from typing import Any

from app.api.websocket import manager
from app.core.state_machine import StateMachine
from app.models.sessions import GameState, HistoryEntry

__all__ = [
    "broadcast_state",
    "broadcast_event",
    "broadcast_error",
    "broadcast_tasks_update",
]


async def broadcast_state(session_id: str, sm: StateMachine) -> None:
    """Broadcast the current GameState to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the update.
        sm: The StateMachine holding current state.
    """
    game_state: GameState = sm.to_game_state(session_id)
    await manager.broadcast(
        {
            "type": "state_update",
            "timestamp": game_state.last_updated.isoformat(),
            "state": game_state.model_dump(mode="json", by_alias=True),
        },
        session_id,
    )

    # Also notify all-session subscribers with merged state
    if manager.all_session_connections:
        from app.core.event_processor import event_processor

        merged = await event_processor.get_merged_state()
        if merged:
            await manager.broadcast_to_all_subscribers(
                {
                    "type": "state_update",
                    "timestamp": merged.last_updated.isoformat(),
                    "state": merged.model_dump(mode="json", by_alias=True),
                },
            )

    # Also notify project subscribers with project-grouped state
    if manager.project_connections:
        from app.core.event_processor import event_processor

        project_state = await event_processor.get_project_grouped_state()
        if project_state:
            await manager.broadcast_to_project_subscribers(
                {
                    "type": "project_state",
                    "data": project_state.model_dump(mode="json", by_alias=True),
                },
            )


async def broadcast_event(
    session_id: str,
    event_dict: HistoryEntry,
) -> None:
    """Broadcast a single event payload to session clients and all-session subscribers.

    Args:
        session_id: The session whose clients should receive the event.
        event_dict: The history-entry TypedDict describing the event.
    """
    payload: dict[str, Any] = {
        "type": "event",
        "timestamp": event_dict["timestamp"],
        "session_id": session_id,
        "event": dict(event_dict),
    }
    await manager.broadcast(payload, session_id)

    # Also notify all-session subscribers so Whole Office view gets events
    if manager.all_session_connections:
        await manager.broadcast_to_all_subscribers(payload)


async def broadcast_tasks_update(
    tasks: list,
    connected: bool,
    adapter_type: str | None,
) -> None:
    """Push tasks_update to all /ws/projects subscribers."""
    if not manager.project_connections:
        return
    from app.models.tasks import Task

    await manager.broadcast_to_project_subscribers(
        {
            "type": "tasks_update",
            "data": {
                "connected": connected,
                "adapterType": adapter_type,
                "tasks": [
                    t.model_dump(by_alias=True, mode="json") if isinstance(t, Task) else t
                    for t in tasks
                ],
            },
        },
    )


async def broadcast_sessions_update() -> None:
    """Push updated session list to all /ws/projects subscribers."""
    if not manager.project_connections:
        return
    from app.api.routes.sessions import build_session_list
    from app.db.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            sessions = await build_session_list(db)
        await manager.broadcast_to_project_subscribers(
            {
                "type": "sessions_update",
                "data": sessions,
            },
        )
    except Exception:
        pass  # Non-critical — frontend will poll on next interval if this fails


async def broadcast_error(session_id: str, message: str, timestamp: str) -> None:
    """Broadcast an error message to all clients connected to *session_id*.

    Args:
        session_id: The session whose clients should receive the error.
        message: Human-readable error description.
        timestamp: ISO-format timestamp string for the error.
    """
    await manager.broadcast(
        {
            "type": "error",
            "message": message,
            "timestamp": timestamp,
        },
        session_id,
    )
