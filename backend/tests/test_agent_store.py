"""Tests for AgentStore DB operations."""

import pytest
from sqlalchemy import select

from app.db.agent_store import agent_store
from app.db.models import AgentRecord, ProjectRecord, SessionRecord


async def _setup(db_session, pid="p-as", sid="s-as"):
    project = ProjectRecord(id=pid, key=f"proj-{pid}", name="P", color="#000")
    db_session.add(project)
    session = SessionRecord(id=sid, project_id=pid)
    db_session.add(session)
    await db_session.commit()
    return project


@pytest.mark.asyncio
async def test_create_agent(db_session):
    project = await _setup(db_session, "p-cr", "s-cr")

    agent = await agent_store.create_agent(
        db_session, session_id="s-cr", project_id="p-cr",
        external_id="main", agent_type="main", name="Claude",
        state="working", assignment="Fix bug"
    )
    assert agent.external_id == "main"
    assert agent.assignment == "Fix bug"
    assert agent.started_at is not None

    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_update_state(db_session):
    project = await _setup(db_session, "p-us", "s-us")

    agent = await agent_store.create_agent(
        db_session, session_id="s-us", project_id="p-us",
        external_id="main", agent_type="main", state="idle"
    )
    await agent_store.update_state(db_session, agent.id, "working")

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == agent.id))
    assert result.scalar_one().state == "working"

    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_update_assignment(db_session):
    project = await _setup(db_session, "p-ua", "s-ua")

    agent = await agent_store.create_agent(
        db_session, session_id="s-ua", project_id="p-ua",
        external_id="main", agent_type="main"
    )
    await agent_store.update_assignment(db_session, agent.id, "New task")

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == agent.id))
    assert result.scalar_one().assignment == "New task"

    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_mark_ended(db_session):
    project = await _setup(db_session, "p-me", "s-me")

    agent = await agent_store.create_agent(
        db_session, session_id="s-me", project_id="p-me",
        external_id="sub1", agent_type="subagent", state="working"
    )
    await agent_store.mark_ended(db_session, agent.id, "completed")

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == agent.id))
    fetched = result.scalar_one()
    assert fetched.state == "completed"
    assert fetched.ended_at is not None

    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_active_agents(db_session):
    project = await _setup(db_session, "p-ga", "s-ga")

    await agent_store.create_agent(
        db_session, session_id="s-ga", project_id="p-ga",
        external_id="main", agent_type="main", state="working"
    )
    a2 = await agent_store.create_agent(
        db_session, session_id="s-ga", project_id="p-ga",
        external_id="sub1", agent_type="subagent", state="working"
    )
    await agent_store.mark_ended(db_session, a2.id, "completed")

    active = await agent_store.get_active_agents(db_session, session_id="s-ga")
    assert len(active) == 1
    assert active[0].external_id == "main"

    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_find_by_external_id(db_session):
    project = await _setup(db_session, "p-fe", "s-fe")

    await agent_store.create_agent(
        db_session, session_id="s-fe", project_id="p-fe",
        external_id="main", agent_type="main", state="working"
    )

    found = await agent_store.find_by_external_id(db_session, "s-fe", "main")
    assert found is not None
    assert found.agent_type == "main"

    not_found = await agent_store.find_by_external_id(db_session, "s-fe", "nonexistent")
    assert not_found is None

    await db_session.delete(project)
    await db_session.commit()
