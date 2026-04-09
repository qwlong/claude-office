"""Tests for DB-backed ProjectRegistry."""

import pytest
from sqlalchemy import select

from app.core.project_registry import ProjectRegistry
from app.db.models import ProjectRecord, SessionRecord


@pytest.mark.asyncio
async def test_register_session_creates_project(db_session):
    """register_session creates a new project in DB if it doesn't exist."""
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)

    project = await registry.register_session(db_session, "sess-reg-1", "My Project", "/path/to/project")
    assert project.key == "my-project"
    assert project.name == "My Project"
    assert project.color is not None
    assert project.id is not None

    # Verify in DB
    result = await db_session.execute(
        select(ProjectRecord).where(ProjectRecord.key == "my-project")
    )
    db_project = result.scalar_one()
    assert db_project.name == "My Project"

    # Cleanup
    await db_session.delete(db_project)
    await db_session.commit()


@pytest.mark.asyncio
async def test_register_session_reuses_existing(db_session):
    """Registering two sessions under same project name reuses the project."""
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)

    p1 = await registry.register_session(db_session, "sess-reuse-1", "Same Project", "/path")
    p2 = await registry.register_session(db_session, "sess-reuse-2", "Same Project", "/path")
    assert p1.id == p2.id
    assert "sess-reuse-1" in p1.session_ids
    assert "sess-reuse-2" in p1.session_ids

    # Cleanup
    result = await db_session.execute(
        select(ProjectRecord).where(ProjectRecord.key == "same-project")
    )
    await db_session.delete(result.scalar_one())
    await db_session.commit()


@pytest.mark.asyncio
async def test_register_session_updates_session_project_id(db_session):
    """register_session sets session.project_id in DB."""
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)

    # Pre-create session record
    session_rec = SessionRecord(id="sess-pid-test")
    db_session.add(session_rec)
    await db_session.commit()

    project = await registry.register_session(db_session, "sess-pid-test", "PID Project", None)

    result = await db_session.execute(
        select(SessionRecord).where(SessionRecord.id == "sess-pid-test")
    )
    session = result.scalar_one()
    assert session.project_id == project.id

    # Cleanup
    result = await db_session.execute(
        select(ProjectRecord).where(ProjectRecord.key == "pid-project")
    )
    await db_session.delete(result.scalar_one())
    await db_session.commit()


@pytest.mark.asyncio
async def test_load_from_db_restores_state(db_session):
    """After restart, load_from_db restores projects and session mappings."""
    registry1 = ProjectRegistry()
    await registry1.load_from_db(db_session)

    # Pre-create session
    session_rec = SessionRecord(id="sess-restore-test")
    db_session.add(session_rec)
    await db_session.commit()

    await registry1.register_session(db_session, "sess-restore-test", "Restore Project", "/path")

    # Simulate restart
    registry2 = ProjectRegistry()
    await registry2.load_from_db(db_session)
    project = registry2.get_project_for_session("sess-restore-test")
    assert project is not None
    assert project.name == "Restore Project"

    # Cleanup
    result = await db_session.execute(
        select(ProjectRecord).where(ProjectRecord.key == "restore-project")
    )
    await db_session.delete(result.scalar_one())
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_all_projects(db_session):
    """get_all_projects returns all registered projects."""
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)

    await registry.register_session(db_session, "s-all-1", "Project A", None)
    await registry.register_session(db_session, "s-all-2", "Project B", None)

    projects = registry.get_all_projects()
    keys = {p.key for p in projects}
    assert "project-a" in keys
    assert "project-b" in keys

    # Cleanup
    for key in ["project-a", "project-b"]:
        result = await db_session.execute(
            select(ProjectRecord).where(ProjectRecord.key == key)
        )
        rec = result.scalar_one_or_none()
        if rec:
            await db_session.delete(rec)
    await db_session.commit()
