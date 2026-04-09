"""Tests for agent_type field on Agent model."""

import pytest

from app.models.agents import Agent, AgentState


def test_agent_default_type_is_subagent():
    agent = Agent(id="a1", color="#fff", number=1, state=AgentState.WORKING)
    assert agent.agent_type == "subagent"


def test_agent_type_main():
    agent = Agent(id="a1", agent_type="main", color="#fff", number=1, state=AgentState.WORKING)
    assert agent.agent_type == "main"


def test_agent_serializes_agent_type():
    agent = Agent(id="a1", agent_type="main", color="#fff", number=1, state=AgentState.WORKING)
    data = agent.model_dump(by_alias=True)
    assert data["agentType"] == "main"


@pytest.mark.asyncio
async def test_project_grouped_state_boss_has_main_type():
    """Boss agent in ProjectGroup.agents should have agent_type='main'."""
    from app.core.event_processor import event_processor
    from app.core.project_registry import ProjectRegistry
    from app.core.state_machine import StateMachine

    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()

    sm = StateMachine()
    event_processor.sessions["s1"] = sm
    event_processor.project_registry.register_session_sync("s1", "proj", "/proj")

    result = await event_processor.get_project_grouped_state()
    agents = result.projects[0].agents
    main_agents = [a for a in agents if a.agent_type == "main"]
    sub_agents = [a for a in agents if a.agent_type == "subagent"]
    assert len(main_agents) == 1
    assert main_agents[0].name == "Claude"

    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()
