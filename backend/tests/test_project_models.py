from datetime import UTC, datetime

from app.models.agents import Agent, AgentState, Boss, BossState, OfficeState
from app.models.projects import MultiProjectGameState, ProjectGroup


def test_project_group_creation():
    group = ProjectGroup(
        key="my-proj",
        name="My Project",
        color="#3B82F6",
        root="/path/to/proj",
        agents=[],
        boss=Boss(state=BossState.IDLE),
        session_count=1,
    )
    assert group.key == "my-proj"
    assert group.session_count == 1


def test_multi_project_game_state():
    state = MultiProjectGameState(
        projects=[
            ProjectGroup(
                key="a",
                name="A",
                color="#3B82F6",
                root="/a",
                agents=[],
                boss=Boss(state=BossState.IDLE),
                session_count=1,
            )
        ],
        office=OfficeState(),
        last_updated=datetime.now(UTC),
    )
    assert len(state.projects) == 1
    assert state.session_id == "__all__"


def test_agent_has_project_key():
    agent = Agent(
        id="a1",
        color="#fff",
        number=1,
        state=AgentState.WORKING,
        project_key="my-proj",
        session_id="sess-1",
    )
    assert agent.project_key == "my-proj"
    assert agent.session_id == "sess-1"
