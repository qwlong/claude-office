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
async def test_session_without_registry_skipped():
    """Sessions not registered with ProjectRegistry should be skipped."""
    sm = StateMachine()
    event_processor.sessions["orphan-session"] = sm
    # Note: NOT registering with project_registry

    result = await event_processor.get_project_grouped_state()
    # No registered projects → empty projects list
    assert result is not None
    assert len(result.projects) == 0


@pytest.mark.asyncio
async def test_multi_session_same_project_metadata_only():
    """Two sessions under the same project should have correct session count, no agents."""
    sm1 = StateMachine()
    sm1.agents["a1"] = Agent(
        id="a1", name="Agent A1", color="#fff", number=1, state=AgentState.WORKING
    )
    sm2 = StateMachine()
    sm2.agents["a2"] = Agent(
        id="a2", name="Agent A2", color="#fff", number=2, state=AgentState.WORKING
    )

    event_processor.sessions["s1"] = sm1
    event_processor.sessions["s2"] = sm2
    event_processor.project_registry.register_session_sync("s1", "shared-proj", "/shared")
    event_processor.project_registry.register_session_sync("s2", "shared-proj", "/shared")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    assert len(result.projects) == 1
    assert result.projects[0].session_count == 2
    # Agents are empty — frontend derives them from /ws/all
    assert len(result.projects[0].agents) == 0


@pytest.mark.asyncio
async def test_grouped_state_boss_is_default_idle():
    """Boss should default to idle since we no longer extract boss state."""
    sm1 = StateMachine()
    sm1.boss_state = BossState.WORKING

    event_processor.sessions["s1"] = sm1
    event_processor.project_registry.register_session_sync("s1", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    assert result is not None
    # Boss is default idle — frontend uses filteredBoss from gameStore
    assert result.projects[0].boss.state == BossState.IDLE


@pytest.mark.asyncio
async def test_grouped_state_no_agents_in_metadata():
    """Project grouped state should not include agents (agents come from /ws/all)."""
    sm = StateMachine()
    for i in range(4):
        sm.agents[f"a{i}"] = Agent(
            id=f"a{i}", name=f"Agent {i}", color="#fff", number=i, state=AgentState.WORKING
        )

    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session_sync("s1", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    assert len(result.projects[0].agents) == 0  # Metadata only


@pytest.mark.asyncio
async def test_grouped_state_serializes_to_json():
    """MultiProjectGameState should serialize correctly for WebSocket."""
    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session_sync("s1", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    json_data = result.model_dump(by_alias=True, mode="json")

    assert json_data["sessionId"] == "__all__"
    assert isinstance(json_data["projects"], list)
    assert json_data["projects"][0]["key"] == "proj"
    assert "lastUpdated" in json_data
