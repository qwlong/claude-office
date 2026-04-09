"""Tests for multi-boss merged state in Whole Office view."""

import pytest

from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine
from app.models.agents import Agent, AgentState, BossState


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
    sm2.boss_state = BossState.WORKING
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
    sm.boss_state = BossState.WORKING
    event_processor.sessions["sess1"] = sm
    event_processor.project_registry.register_session_sync("sess1", "My Project", "/tmp/proj")

    state = await event_processor.get_merged_state()
    assert state is not None
    boss = state.bosses[0]
    assert boss.session_id == "sess1"
    assert boss.project_key is not None
    assert boss.project_color is not None


@pytest.mark.asyncio
async def test_merged_state_bosses_sorted_by_activity():
    """Bosses sorted by activity: non-idle first, then by agent count desc, then session_id."""
    # s-idle: idle, no agents (should be filtered out entirely)
    sm_idle = StateMachine()
    sm_idle.boss_state = BossState.IDLE
    event_processor.sessions["s-idle"] = sm_idle

    # s-working-0: working, 0 agents
    sm_w0 = StateMachine()
    sm_w0.boss_state = BossState.WORKING
    event_processor.sessions["s-working-0"] = sm_w0

    # s-working-2: working, 2 agents
    sm_w2 = StateMachine()
    sm_w2.boss_state = BossState.WORKING
    sm_w2.agents = {
        "a1": Agent(id="a1", color="#fff", number=1, state=AgentState.WORKING),
        "a2": Agent(id="a2", color="#fff", number=2, state=AgentState.WORKING),
    }
    event_processor.sessions["s-working-2"] = sm_w2

    # s-idle-1: idle but has 1 agent (still active)
    sm_i1 = StateMachine()
    sm_i1.boss_state = BossState.IDLE
    sm_i1.agents = {
        "a3": Agent(id="a3", color="#fff", number=3, state=AgentState.WORKING),
    }
    event_processor.sessions["s-idle-1"] = sm_i1

    for sid in ["s-idle", "s-working-0", "s-working-2", "s-idle-1"]:
        event_processor.project_registry.register_session_sync(sid, f"Proj-{sid}", f"/tmp/{sid}")

    state = await event_processor.get_merged_state()
    assert state is not None

    # s-idle filtered out (idle + no agents)
    # Remaining 3: s-working-2 (working, 2 agents), s-working-0 (working, 0), s-idle-1 (idle, 1)
    session_ids = [b.session_id for b in state.bosses]
    assert len(session_ids) == 3
    assert session_ids[0] == "s-working-2"  # working + most agents
    assert session_ids[1] == "s-working-0"  # working + 0 agents
    assert session_ids[2] == "s-idle-1"     # idle but has agent


@pytest.mark.asyncio
async def test_merged_state_max_3_bosses():
    """At most 3 bosses should be returned even if more sessions are active."""
    for i in range(5):
        sm = StateMachine()
        sm.boss_state = BossState.WORKING
        sid = f"s-{i:02d}"
        event_processor.sessions[sid] = sm
        event_processor.project_registry.register_session_sync(sid, f"Proj-{i}", f"/tmp/{i}")

    state = await event_processor.get_merged_state()
    assert state is not None
    assert len(state.bosses) == 3


@pytest.mark.asyncio
async def test_merged_state_idle_no_agents_filtered():
    """Sessions with idle boss and no agents should not appear in bosses list."""
    sm_active = StateMachine()
    sm_active.boss_state = BossState.WORKING
    event_processor.sessions["active"] = sm_active

    sm_dead = StateMachine()
    sm_dead.boss_state = BossState.IDLE
    event_processor.sessions["dead"] = sm_dead

    for sid in ["active", "dead"]:
        event_processor.project_registry.register_session_sync(sid, f"Proj-{sid}", f"/tmp/{sid}")

    state = await event_processor.get_merged_state()
    assert state is not None
    assert len(state.bosses) == 1
    assert state.bosses[0].session_id == "active"
