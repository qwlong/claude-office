"""Tests for AgentRecord model and cascade delete behavior."""

import pytest
from sqlalchemy import select

from app.db.models import AgentRecord, ProjectRecord, SessionRecord


@pytest.mark.asyncio
async def test_agent_record_creation(db_session):
    """AgentRecord can be created and queried."""
    project = ProjectRecord(id="p-ag1", key="proj-ag1", name="P", color="#000")
    db_session.add(project)
    await db_session.flush()
    session = SessionRecord(id="s-ag1", project_id="p-ag1")
    db_session.add(session)
    await db_session.flush()

    agent = AgentRecord(
        id="a-ag1",
        session_id="s-ag1",
        project_id="p-ag1",
        external_id="main",
        agent_type="main",
        name="Claude",
        state="working",
        assignment="Fix the bug",
    )
    db_session.add(agent)
    await db_session.commit()

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == "a-ag1"))
    fetched = result.scalar_one()
    assert fetched.external_id == "main"
    assert fetched.agent_type == "main"
    assert fetched.name == "Claude"
    assert fetched.assignment == "Fix the bug"
    assert fetched.ended_at is None

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_agent_cascade_delete_with_session(db_session):
    """Deleting a session cascades to its agents."""
    project = ProjectRecord(id="p-agcs", key="proj-agcs", name="P", color="#000")
    db_session.add(project)
    await db_session.flush()
    session = SessionRecord(id="s-agcs", project_id="p-agcs")
    db_session.add(session)
    await db_session.flush()
    agent = AgentRecord(id="a-agcs", session_id="s-agcs", project_id="p-agcs",
                        external_id="main", agent_type="main")
    db_session.add(agent)
    await db_session.commit()

    await db_session.delete(session)
    await db_session.commit()

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == "a-agcs"))
    assert result.scalar_one_or_none() is None

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_agent_cascade_delete_with_project(db_session):
    """Deleting a project cascades to sessions and agents."""
    project = ProjectRecord(id="p-agcp", key="proj-agcp", name="P", color="#000")
    db_session.add(project)
    await db_session.flush()
    session = SessionRecord(id="s-agcp", project_id="p-agcp")
    db_session.add(session)
    await db_session.flush()
    agent = AgentRecord(id="a-agcp", session_id="s-agcp", project_id="p-agcp",
                        external_id="sub1", agent_type="subagent")
    db_session.add(agent)
    await db_session.commit()

    await db_session.delete(project)
    await db_session.commit()

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == "a-agcp"))
    assert result.scalar_one_or_none() is None
