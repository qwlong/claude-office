import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.core.broadcast_service import broadcast_state
from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine


@pytest.fixture(autouse=True)
def clean_processor():
    event_processor.sessions.clear()
    event_processor._db_sessions_restored = True
    event_processor.project_registry = ProjectRegistry()
    yield
    event_processor.sessions.clear()
    event_processor._db_sessions_restored = True
    event_processor.project_registry = ProjectRegistry()


@pytest.mark.asyncio
async def test_broadcast_state_sends_to_project_subscribers():
    """broadcast_state should send project_state to project WebSocket subscribers."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session_sync("s1", "my-proj", "/proj")

    mock_ws = MagicMock()

    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        mock_manager.all_session_connections = []
        mock_manager.project_connections = [mock_ws]
        mock_manager.broadcast_to_project_subscribers = AsyncMock()

        await broadcast_state("s1", sm)

        mock_manager.broadcast_to_project_subscribers.assert_called_once()
        call_args = mock_manager.broadcast_to_project_subscribers.call_args[0][0]
        assert call_args["type"] == "project_state"
        assert "data" in call_args
        assert isinstance(call_args["data"]["projects"], list)


@pytest.mark.asyncio
async def test_broadcast_state_skips_project_when_no_subscribers():
    """broadcast_state should not call project broadcast when no subscribers."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm

    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        mock_manager.all_session_connections = []
        mock_manager.project_connections = []

        await broadcast_state("s1", sm)

        assert not mock_manager.broadcast_to_project_subscribers.called


@pytest.mark.asyncio
async def test_broadcast_project_state_has_correct_shape():
    """The project_state message should have the expected structure."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session_sync("s1", "test-proj", "/test")

    with patch("app.core.broadcast_service.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        mock_manager.all_session_connections = []
        mock_manager.project_connections = [MagicMock()]
        mock_manager.broadcast_to_project_subscribers = AsyncMock()

        await broadcast_state("s1", sm)

        msg = mock_manager.broadcast_to_project_subscribers.call_args[0][0]
        data = msg["data"]
        assert "projects" in data
        assert "office" in data
        assert "lastUpdated" in data
        project = data["projects"][0]
        assert project["key"] == "test-proj"
        assert "color" in project
        assert "agents" in project
        assert "boss" in project
        assert "sessionCount" in project
