"""Tests for ProjectRecord model and cascade delete behavior."""

import pytest
from sqlalchemy import select

from app.db.models import ProjectRecord, SessionRecord


@pytest.mark.asyncio
async def test_project_record_creation(db_session):
    """ProjectRecord can be created and queried."""
    project = ProjectRecord(
        id="test-uuid-1234",
        key="my-project",
        name="My Project",
        color="#3B82F6",
    )
    db_session.add(project)
    await db_session.commit()

    result = await db_session.execute(
        select(ProjectRecord).where(ProjectRecord.key == "my-project")
    )
    fetched = result.scalar_one()
    assert fetched.id == "test-uuid-1234"
    assert fetched.name == "My Project"
    assert fetched.sequence == 0
    assert fetched.label is None
    assert fetched.icon is None
    assert fetched.description is None

    # Cleanup
    await db_session.delete(fetched)
    await db_session.commit()


@pytest.mark.asyncio
async def test_session_project_id_fk(db_session):
    """SessionRecord.project_id links to ProjectRecord."""
    project = ProjectRecord(id="p-fk-test", key="proj-fk", name="Proj", color="#000")
    db_session.add(project)
    await db_session.flush()

    session = SessionRecord(id="sess-fk-test", project_id="p-fk-test")
    db_session.add(session)
    await db_session.commit()

    result = await db_session.execute(
        select(SessionRecord).where(SessionRecord.id == "sess-fk-test")
    )
    fetched = result.scalar_one()
    assert fetched.project_id == "p-fk-test"

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_cascade_delete(db_session):
    """Deleting a project cascades to its sessions."""
    project = ProjectRecord(id="p-cascade", key="proj-cascade", name="Proj", color="#000")
    db_session.add(project)
    await db_session.flush()

    session = SessionRecord(id="sess-cascade", project_id="p-cascade")
    db_session.add(session)
    await db_session.commit()

    await db_session.delete(project)
    await db_session.commit()

    result = await db_session.execute(
        select(SessionRecord).where(SessionRecord.id == "sess-cascade")
    )
    assert result.scalar_one_or_none() is None
