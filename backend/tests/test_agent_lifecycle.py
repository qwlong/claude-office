"""Tests for agent lifecycle features: orphan detection, stale cleanup, merge, dismiss."""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.event_processor import event_processor
from app.core.state_machine import StateMachine
from app.main import app
from app.models.agents import Agent, AgentState
from app.models.events import Event, EventData, EventType

client = TestClient(app)


def _make_agent(agent_id: str = "agent1", state: AgentState = AgentState.WORKING) -> Agent:
    """Create a test agent."""
    return Agent(
        id=agent_id,
        name=f"Test-{agent_id[-4:]}",
        color="#3B82F6",
        number=1,
        state=state,
    )


def _seed_session_with_agents(
    session_id: str | None = None, agent_count: int = 2
) -> tuple[str, StateMachine]:
    """Create a session with agents in the event processor."""
    sid = session_id or f"test-{uuid4()}"
    sm = StateMachine()
    for i in range(agent_count):
        aid = f"agent_{i}"
        sm.agents[aid] = _make_agent(aid)
        sm.arrival_queue.append(aid)
    event_processor.sessions[sid] = sm
    return sid, sm


# ============================================================================
# StateMachine orphan methods
# ============================================================================


class TestGetActiveAgentIds:
    def test_empty(self) -> None:
        sm = StateMachine()
        assert sm.get_active_agent_ids() == []

    def test_returns_all_ids(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a2"] = _make_agent("a2")
        ids = sm.get_active_agent_ids()
        assert sorted(ids) == ["a1", "a2"]


class TestMarkAgentsOrphaned:
    def test_marks_existing_agents(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a2"] = _make_agent("a2")
        sm.mark_agents_orphaned(["a1", "a2"])
        assert sm.agents["a1"].orphaned is True
        assert sm.agents["a2"].orphaned is True

    def test_skips_nonexistent_agents(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.mark_agents_orphaned(["a1", "nonexistent"])
        assert sm.agents["a1"].orphaned is True

    def test_default_not_orphaned(self) -> None:
        agent = _make_agent("a1")
        assert agent.orphaned is False


class TestTriggerAgentDeparture:
    def test_sets_waiting_state(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.trigger_agent_departure("a1")
        assert sm.agents["a1"].state == AgentState.WAITING

    def test_adds_to_handin_queue(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.trigger_agent_departure("a1")
        assert "a1" in sm.handin_queue

    def test_no_duplicate_in_handin_queue(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.handin_queue.append("a1")
        sm.trigger_agent_departure("a1")
        assert sm.handin_queue.count("a1") == 1

    def test_nonexistent_agent_no_error(self) -> None:
        sm = StateMachine()
        sm.trigger_agent_departure("nonexistent")  # Should not raise

    def test_records_agent_stop_in_whiteboard(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.whiteboard.record_agent_start("a1", "Test", "#3B82F6")
        sm.trigger_agent_departure("a1")
        lifespans = sm.whiteboard.get_agent_lifespans_snapshot()
        stopped = [ls for ls in lifespans if ls.agent_id == "a1" and ls.end_time is not None]
        assert len(stopped) == 1


class TestLastActivityTime:
    def test_default_is_now(self) -> None:
        agent = _make_agent("a1")
        assert (datetime.now() - agent.last_activity_time).total_seconds() < 2

    def test_updated_on_pre_tool_use(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        old_time = sm.agents["a1"].last_activity_time

        event = Event(
            event_type=EventType.PRE_TOOL_USE,
            session_id="test",
            data=EventData(agent_id="a1", tool_name="Read"),
        )
        sm.transition(event)
        assert sm.agents["a1"].last_activity_time >= old_time

    def test_orphaned_cleared_on_tool_use(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a1"].orphaned = True

        event = Event(
            event_type=EventType.PRE_TOOL_USE,
            session_id="test",
            data=EventData(agent_id="a1", tool_name="Read"),
        )
        sm.transition(event)
        assert sm.agents["a1"].orphaned is False

    def test_orphaned_cleared_on_post_tool_use(self) -> None:
        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a1"].orphaned = True

        event = Event(
            event_type=EventType.POST_TOOL_USE,
            session_id="test",
            data=EventData(agent_id="a1", tool_name="Read"),
        )
        sm.transition(event)
        assert sm.agents["a1"].orphaned is False


# ============================================================================
# Session handler orphan cleanup
# ============================================================================


class TestSessionStartOrphanDetection:
    @pytest.mark.asyncio
    async def test_marks_agents_orphaned_on_session_start(self) -> None:
        from app.core.handlers.session_handler import handle_session_start

        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a2"] = _make_agent("a2")

        event = Event(
            event_type=EventType.SESSION_START,
            session_id="test",
            data=EventData(),
        )

        with (
            patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
            patch("app.core.handlers.session_handler.get_task_file_poller", return_value=None),
            patch("app.core.handlers.session_handler.asyncio.create_task") as mock_create_task,
        ):
            await handle_session_start(sm, event, lambda: None)

        assert sm.agents["a1"].orphaned is True
        assert sm.agents["a2"].orphaned is True
        mock_create_task.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_orphan_cleanup_when_no_agents(self) -> None:
        from app.core.handlers.session_handler import handle_session_start

        sm = StateMachine()

        event = Event(
            event_type=EventType.SESSION_START,
            session_id="test",
            data=EventData(),
        )

        with (
            patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
            patch("app.core.handlers.session_handler.get_task_file_poller", return_value=None),
            patch("app.core.handlers.session_handler.asyncio.create_task") as mock_create_task,
        ):
            await handle_session_start(sm, event, lambda: None)

        mock_create_task.assert_not_called()


class TestCleanupOrphanedAgents:
    @pytest.mark.asyncio
    async def test_removes_orphaned_agents_after_grace_period(self) -> None:
        from app.core.handlers.session_handler import _cleanup_orphaned_agents

        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a1"].orphaned = True
        sm.agents["a2"] = _make_agent("a2")
        sm.agents["a2"].orphaned = True

        with (
            patch("app.core.handlers.session_handler.asyncio.sleep", new_callable=AsyncMock),
            patch("app.core.handlers.session_handler.get_transcript_poller", return_value=None),
            patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
        ):
            await _cleanup_orphaned_agents(sm, "test", ["a1", "a2"])

        assert "a1" not in sm.agents
        assert "a2" not in sm.agents

    @pytest.mark.asyncio
    async def test_keeps_agents_no_longer_orphaned(self) -> None:
        from app.core.handlers.session_handler import _cleanup_orphaned_agents

        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a1"].orphaned = False  # Received activity during grace period
        sm.agents["a2"] = _make_agent("a2")
        sm.agents["a2"].orphaned = True

        with (
            patch("app.core.handlers.session_handler.asyncio.sleep", new_callable=AsyncMock),
            patch("app.core.handlers.session_handler.get_transcript_poller", return_value=None),
            patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
        ):
            await _cleanup_orphaned_agents(sm, "test", ["a1", "a2"])

        assert "a1" in sm.agents  # Kept — no longer orphaned
        assert "a2" not in sm.agents  # Removed — still orphaned

    @pytest.mark.asyncio
    async def test_keeps_agents_with_active_transcript(self) -> None:
        from app.core.handlers.session_handler import _cleanup_orphaned_agents

        sm = StateMachine()
        sm.agents["a1"] = _make_agent("a1")
        sm.agents["a1"].orphaned = True

        mock_poller = AsyncMock()
        mock_poller.is_polling = AsyncMock(return_value=True)

        with (
            patch("app.core.handlers.session_handler.asyncio.sleep", new_callable=AsyncMock),
            patch(
                "app.core.handlers.session_handler.get_transcript_poller",
                return_value=mock_poller,
            ),
            patch("app.core.handlers.session_handler.broadcast_state", new_callable=AsyncMock),
        ):
            await _cleanup_orphaned_agents(sm, "test", ["a1"])

        assert "a1" in sm.agents
        assert sm.agents["a1"].orphaned is False  # Cleared because transcript active


# ============================================================================
# Agents API endpoints
# ============================================================================


class TestAgentsDismissAPI:
    def test_dismiss_agent(self) -> None:
        sid, sm = _seed_session_with_agents(agent_count=2)

        response = client.post(
            "/api/v1/agents/dismiss",
            json={"agent_id": "agent_0", "session_id": sid},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "dismissed"
        assert "agent_0" not in sm.agents
        assert "agent_1" in sm.agents

    def test_dismiss_nonexistent_agent(self) -> None:
        sid, _ = _seed_session_with_agents(agent_count=1)

        response = client.post(
            "/api/v1/agents/dismiss",
            json={"agent_id": "nonexistent", "session_id": sid},
        )
        assert response.status_code == 404

    def test_dismiss_nonexistent_session(self) -> None:
        response = client.post(
            "/api/v1/agents/dismiss",
            json={"agent_id": "agent_0", "session_id": "fake-session"},
        )
        assert response.status_code == 404


class TestAgentsMergeAPI:
    def test_merge_agents(self) -> None:
        sid, sm = _seed_session_with_agents(agent_count=2)
        sm.agents["agent_0"].current_task = "Research A"
        sm.agents["agent_1"].current_task = "Research B"

        response = client.post(
            "/api/v1/agents/merge",
            json={
                "source_agent_id": "agent_0",
                "target_agent_id": "agent_1",
                "session_id": sid,
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "merged"
        assert "agent_0" not in sm.agents
        assert "agent_1" in sm.agents
        assert "Research A" in sm.agents["agent_1"].current_task

    def test_merge_nonexistent_source(self) -> None:
        sid, _ = _seed_session_with_agents(agent_count=1)

        response = client.post(
            "/api/v1/agents/merge",
            json={
                "source_agent_id": "nonexistent",
                "target_agent_id": "agent_0",
                "session_id": sid,
            },
        )
        assert response.status_code == 404

    def test_merge_nonexistent_target(self) -> None:
        sid, _ = _seed_session_with_agents(agent_count=1)

        response = client.post(
            "/api/v1/agents/merge",
            json={
                "source_agent_id": "agent_0",
                "target_agent_id": "nonexistent",
                "session_id": sid,
            },
        )
        assert response.status_code == 404


class TestAgentsCleanupAPI:
    def test_cleanup_removes_agents_without_transcript(self) -> None:
        sid, sm = _seed_session_with_agents(agent_count=3)

        with patch(
            "app.api.routes.agents.get_transcript_poller",
            return_value=None,
        ):
            response = client.post(
                "/api/v1/agents/cleanup",
                json={"session_id": sid},
            )

        assert response.status_code == 200
        assert response.json()["removed"] == 3
        assert len(sm.agents) == 0

    def test_cleanup_keeps_agents_with_active_transcript(self) -> None:
        sid, sm = _seed_session_with_agents(agent_count=2)

        mock_poller = AsyncMock()
        mock_poller.is_polling = AsyncMock(side_effect=lambda aid: aid == "agent_0")

        with patch(
            "app.api.routes.agents.get_transcript_poller",
            return_value=mock_poller,
        ):
            response = client.post(
                "/api/v1/agents/cleanup",
                json={"session_id": sid},
            )

        assert response.status_code == 200
        assert response.json()["removed"] == 1
        assert "agent_0" in sm.agents  # Kept — has active transcript
        assert "agent_1" not in sm.agents  # Removed

    def test_cleanup_nonexistent_session(self) -> None:
        response = client.post(
            "/api/v1/agents/cleanup",
            json={"session_id": "fake-session"},
        )
        assert response.status_code == 404

    def test_cleanup_empty_session(self) -> None:
        sid, _ = _seed_session_with_agents(agent_count=0)

        with patch(
            "app.api.routes.agents.get_transcript_poller",
            return_value=None,
        ):
            response = client.post(
                "/api/v1/agents/cleanup",
                json={"session_id": sid},
            )

        assert response.status_code == 200
        assert response.json()["removed"] == 0
