"""Tests for agent_type field on Agent model."""

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
