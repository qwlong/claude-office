"""Tests for multi-boss merged state in Whole Office view."""

import pytest

from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine
from app.models.agents import BossState


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
async def test_merged_state_has_bosses_from_each_session():
    """Each active session should contribute one boss to the bosses list."""
    sm1 = StateMachine()
    sm1.boss_state = BossState.WORKING
    sm2 = StateMachine()
    sm2.boss_state = BossState.IDLE
    event_processor.sessions["session-aaa"] = sm1
    event_processor.sessions["session-bbb"] = sm2
    event_processor.project_registry.register_session_sync("session-aaa", "Project Alpha", "/tmp/alpha")
    event_processor.project_registry.register_session_sync("session-bbb", "Project Beta", "/tmp/beta")

    state = await event_processor.get_merged_state()
    assert state is not None
    assert len(state.bosses) == 2
    # Sorted by session_id
    assert state.bosses[0].session_id == "session-aaa"
    assert state.bosses[1].session_id == "session-bbb"
    # boss field is first in sorted order
    assert state.boss.session_id == "session-aaa"


@pytest.mark.asyncio
async def test_merged_state_boss_also_in_agents():
    """Boss should appear both in bosses list AND as agent with agentType=main."""
    sm = StateMachine()
    sm.boss_state = BossState.WORKING
    event_processor.sessions["sess1"] = sm
    event_processor.project_registry.register_session_sync("sess1", "Proj", "/tmp/proj")

    state = await event_processor.get_merged_state()
    assert state is not None
    assert len(state.bosses) == 1
    assert state.bosses[0].session_id == "sess1"
    main_agents = [a for a in state.agents if a.agent_type == "main"]
    assert len(main_agents) == 1


@pytest.mark.asyncio
async def test_merged_state_bosses_have_project_info():
    """Each boss should carry project_key and project_color."""
    sm = StateMachine()
    event_processor.sessions["sess1"] = sm
    event_processor.project_registry.register_session_sync("sess1", "My Project", "/tmp/proj")

    state = await event_processor.get_merged_state()
    assert state is not None
    boss = state.bosses[0]
    assert boss.session_id == "sess1"
    assert boss.project_key is not None
    assert boss.project_color is not None


@pytest.mark.asyncio
async def test_merged_state_bosses_sorted_by_session_id():
    """Bosses should be sorted by session_id for stable ordering."""
    for sid in ["zzz", "aaa", "mmm"]:
        sm = StateMachine()
        event_processor.sessions[sid] = sm
        event_processor.project_registry.register_session_sync(sid, f"Proj-{sid}", f"/tmp/{sid}")

    state = await event_processor.get_merged_state()
    assert state is not None
    session_ids = [b.session_id for b in state.bosses]
    assert session_ids == ["aaa", "mmm", "zzz"]
