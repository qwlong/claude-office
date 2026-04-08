import pytest
from unittest.mock import AsyncMock, patch

from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry


@pytest.fixture(autouse=True)
def clean_processor():
    """Reset event_processor state between tests."""
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()
    yield
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()


def test_event_processor_has_project_registry():
    assert isinstance(event_processor.project_registry, ProjectRegistry)


@pytest.mark.asyncio
async def test_session_start_registers_project():
    """When a session starts with project_name, it should be registered."""
    from app.models.events import Event, EventData, EventType

    event = Event(
        session_id="test-sess-1",
        event_type=EventType.SESSION_START,
        timestamp="2026-04-08T10:00:00Z",
        data=EventData(
            session_id="test-sess-1",
            project_name="my-project",
        ),
    )

    with (
        patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
        patch("app.core.broadcast_service.broadcast_state", new_callable=AsyncMock),
        patch("app.core.broadcast_service.broadcast_event", new_callable=AsyncMock),
    ):
        await event_processor.process_event(event)

    project = event_processor.project_registry.get_project_for_session("test-sess-1")
    assert project is not None
    assert project.name == "my-project"


@pytest.mark.asyncio
async def test_session_end_unregisters_project():
    """When the last session of a project ends, the project should be removed."""
    from app.models.events import Event, EventData, EventType

    # Start session
    start_event = Event(
        session_id="test-sess-2",
        event_type=EventType.SESSION_START,
        timestamp="2026-04-08T10:00:00Z",
        data=EventData(
            session_id="test-sess-2",
            project_name="temp-project",
        ),
    )

    end_event = Event(
        session_id="test-sess-2",
        event_type=EventType.SESSION_END,
        timestamp="2026-04-08T10:01:00Z",
        data=EventData(session_id="test-sess-2"),
    )

    with (
        patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
        patch("app.core.broadcast_service.broadcast_state", new_callable=AsyncMock),
        patch("app.core.broadcast_service.broadcast_event", new_callable=AsyncMock),
    ):
        await event_processor.process_event(start_event)
        await event_processor.process_event(end_event)

    project = event_processor.project_registry.get_project_for_session("test-sess-2")
    assert project is None
    assert event_processor.project_registry.get_all_projects() == []
