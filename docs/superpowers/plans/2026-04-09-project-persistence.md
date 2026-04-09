# Project Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist projects to DB so they survive restarts, eliminating "Unknown" project bug and enabling project editing.

**Architecture:** Add `ProjectRecord` SQLAlchemy model, refactor `ProjectRegistry` to be DB-backed with in-memory cache, add PATCH/DELETE API endpoints. Session table gets `project_id` FK with cascade delete.

**Tech Stack:** Python, SQLAlchemy (async), FastAPI, pytest, SQLite

**Spec:** `docs/superpowers/specs/2026-04-09-project-persistence-design.md`

---

### Task 1: Add ProjectRecord model and update SessionRecord

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Write failing test for ProjectRecord**

Create `backend/tests/test_project_persistence.py`:

```python
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

    result = await db_session.execute(select(ProjectRecord).where(ProjectRecord.key == "my-project"))
    fetched = result.scalar_one()
    assert fetched.id == "test-uuid-1234"
    assert fetched.name == "My Project"
    assert fetched.sequence == 0

@pytest.mark.asyncio
async def test_session_project_id_fk(db_session):
    """SessionRecord.project_id links to ProjectRecord."""
    project = ProjectRecord(id="p1", key="proj", name="Proj", color="#000")
    db_session.add(project)
    await db_session.flush()

    session = SessionRecord(id="sess-1", project_id="p1")
    db_session.add(session)
    await db_session.commit()

    result = await db_session.execute(select(SessionRecord).where(SessionRecord.id == "sess-1"))
    fetched = result.scalar_one()
    assert fetched.project_id == "p1"

@pytest.mark.asyncio
async def test_cascade_delete(db_session):
    """Deleting a project cascades to its sessions."""
    project = ProjectRecord(id="p1", key="proj", name="Proj", color="#000")
    db_session.add(project)
    await db_session.flush()

    session = SessionRecord(id="sess-1", project_id="p1")
    db_session.add(session)
    await db_session.commit()

    await db_session.delete(project)
    await db_session.commit()

    result = await db_session.execute(select(SessionRecord).where(SessionRecord.id == "sess-1"))
    assert result.scalar_one_or_none() is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_project_persistence.py -v`
Expected: FAIL — `ProjectRecord` not found

- [ ] **Step 3: Add ProjectRecord model and update SessionRecord**

In `backend/app/db/models.py`:

```python
import uuid

class ProjectRecord(Base):
    """Database model for projects."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    color: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    icon: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    description: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    path: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    sequence: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    sessions: Mapped[list[SessionRecord]] = relationship(
        "SessionRecord", back_populates="project", cascade="all, delete-orphan"
    )
```

Add to `SessionRecord`:

```python
    project_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, default=None
    )
    project: Mapped[ProjectRecord | None] = relationship("ProjectRecord", back_populates="sessions")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_project_persistence.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/tests/test_project_persistence.py
git commit -m "feat: add ProjectRecord model with cascade delete to sessions"
```

---

### Task 2: Refactor ProjectRegistry to DB-backed

**Files:**
- Modify: `backend/app/core/project_registry.py`
- Create: `backend/tests/test_project_registry.py`

- [ ] **Step 1: Write failing tests for DB-backed ProjectRegistry**

```python
import pytest
from app.core.project_registry import ProjectRegistry, normalize_project_key

@pytest.mark.asyncio
async def test_register_session_creates_project(db_session):
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)

    project = await registry.register_session(db_session, "sess-1", "My Project", "/path/to/project")
    assert project.key == "my-project"
    assert project.name == "My Project"
    assert project.color is not None

@pytest.mark.asyncio
async def test_register_session_reuses_existing(db_session):
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)

    p1 = await registry.register_session(db_session, "sess-1", "My Project", "/path")
    p2 = await registry.register_session(db_session, "sess-2", "My Project", "/path")
    assert p1.id == p2.id

@pytest.mark.asyncio
async def test_load_from_db_restores_state(db_session):
    registry1 = ProjectRegistry()
    await registry1.load_from_db(db_session)
    await registry1.register_session(db_session, "sess-1", "My Project", "/path")

    # Simulate restart
    registry2 = ProjectRegistry()
    await registry2.load_from_db(db_session)
    project = registry2.get_project_for_session("sess-1")
    assert project is not None
    assert project.name == "My Project"

@pytest.mark.asyncio
async def test_get_all_projects(db_session):
    registry = ProjectRegistry()
    await registry.load_from_db(db_session)
    await registry.register_session(db_session, "s1", "Project A", None)
    await registry.register_session(db_session, "s2", "Project B", None)

    projects = registry.get_all_projects()
    assert len(projects) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_project_registry.py -v`
Expected: FAIL — `load_from_db` doesn't exist

- [ ] **Step 3: Refactor ProjectRegistry**

Rewrite `backend/app/core/project_registry.py`:
- `register_session` becomes `async` — creates/finds `ProjectRecord` in DB, updates `SessionRecord.project_id`
- `load_from_db` — loads all projects + session mappings from DB at startup
- Keep in-memory cache (`_projects`, `_session_to_project`) for fast reads
- `get_project_for_session` and `get_all_projects` read from cache (sync)

```python
class ProjectRegistry:
    def __init__(self) -> None:
        self._projects: dict[str, ProjectState] = {}
        self._session_to_project: dict[str, str] = {}
        self._color_index: int = 0

    async def load_from_db(self, db: AsyncSession) -> None:
        """Load all projects and session mappings from DB."""
        result = await db.execute(select(ProjectRecord))
        for rec in result.scalars().all():
            self._projects[rec.key] = ProjectState(
                id=rec.id, key=rec.key, name=rec.name,
                root=rec.path, color=rec.color, session_ids=[]
            )
            self._color_index = max(self._color_index, ...)

        # Load session-to-project mappings
        result = await db.execute(
            select(SessionRecord.id, ProjectRecord.key)
            .join(ProjectRecord, SessionRecord.project_id == ProjectRecord.id)
            .where(SessionRecord.project_id.isnot(None))
        )
        for session_id, project_key in result.all():
            self._session_to_project[session_id] = project_key
            if project_key in self._projects:
                self._projects[project_key].session_ids.append(session_id)

    async def register_session(
        self, db: AsyncSession, session_id: str, project_name: str, project_root: str | None
    ) -> ProjectState:
        """Register session under a project. Creates project in DB if new."""
        key = normalize_project_key(project_name)

        if key not in self._projects:
            color = PROJECT_COLORS[self._color_index % len(PROJECT_COLORS)]
            self._color_index += 1
            record = ProjectRecord(key=key, name=project_name, color=color, path=project_root)
            db.add(record)
            await db.flush()
            self._projects[key] = ProjectState(
                id=record.id, key=key, name=project_name,
                root=project_root, color=color, session_ids=[]
            )

        project = self._projects[key]
        if session_id not in project.session_ids:
            project.session_ids.append(session_id)
        self._session_to_project[session_id] = key

        # Update session record
        result = await db.execute(select(SessionRecord).where(SessionRecord.id == session_id))
        session_rec = result.scalar_one_or_none()
        if session_rec:
            session_rec.project_id = project.id
            await db.commit()

        return project
```

Note: `ProjectState` gets a new `id` field.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_project_registry.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/project_registry.py backend/tests/test_project_registry.py
git commit -m "refactor: ProjectRegistry backed by DB with in-memory cache"
```

---

### Task 3: Update event_processor to use async ProjectRegistry

**Files:**
- Modify: `backend/app/core/event_processor.py`

- [ ] **Step 1: Update all `register_session` calls to be async and pass db session**

Key changes:
- `_auto_register_project` already has a DB session — pass it to `registry.register_session(db, ...)`
- `get_project_grouped_state` — the DB restore block that calls `register_session` needs to be async with DB session
- Startup: call `registry.load_from_db(db)` on first use

- [ ] **Step 2: Remove the inline DB session restore logic in `get_project_grouped_state`**

The `get_project_grouped_state` method currently has ~40 lines of inline DB restore + project registration. With DB-backed registry, this becomes:

```python
if not self._db_sessions_restored:
    async with AsyncSessionLocal() as db:
        await self.project_registry.load_from_db(db)
    self._db_sessions_restored = True
```

- [ ] **Step 3: Run existing tests**

Run: `cd backend && uv run pytest -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/event_processor.py
git commit -m "refactor: event_processor uses async DB-backed ProjectRegistry"
```

---

### Task 4: Add PATCH and DELETE API endpoints

**Files:**
- Modify: `backend/app/api/routes/projects.py`
- Create: `backend/tests/test_project_api.py`

- [ ] **Step 1: Write failing tests for PATCH and DELETE**

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_patch_project(client: AsyncClient, seed_project):
    resp = await client.patch(f"/api/v1/projects/{seed_project.key}", json={"name": "New Name", "color": "#FF0000"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["color"] == "#FF0000"

@pytest.mark.asyncio
async def test_delete_project_cascades(client: AsyncClient, seed_project_with_sessions):
    key = seed_project_with_sessions.key
    resp = await client.delete(f"/api/v1/projects/{key}")
    assert resp.status_code == 200

    # Verify sessions are gone
    resp = await client.get("/api/v1/sessions")
    assert len(resp.json()) == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_project_api.py -v`
Expected: FAIL — 405 Method Not Allowed

- [ ] **Step 3: Implement PATCH and DELETE endpoints**

```python
from pydantic import BaseModel

class ProjectUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    label: str | None = None
    icon: str | None = None
    description: str | None = None
    sequence: int | None = None

@router.patch("/{key}")
async def update_project(key: str, update: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectRecord).where(ProjectRecord.key == key))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)

    # Update in-memory cache
    event_processor.project_registry.update_cache(project)

    return {...}

@router.delete("/{key}")
async def delete_project(key: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectRecord).where(ProjectRecord.key == key))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.delete(project)
    await db.commit()

    # Clean up in-memory state
    event_processor.project_registry.remove_project(key)

    return {"status": "success", "message": f"Project {key} deleted"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_project_api.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/routes/projects.py backend/tests/test_project_api.py
git commit -m "feat: add PATCH and DELETE endpoints for projects"
```

---

### Task 5: Data migration — backfill existing sessions

**Files:**
- Create: `backend/app/db/migrate_projects.py`

- [ ] **Step 1: Write migration script**

```python
"""One-time migration: create ProjectRecord entries from existing sessions."""

async def migrate_projects(db: AsyncSession) -> int:
    """Backfill projects table from sessions.project_name.
    Returns number of projects created.
    """
    result = await db.execute(
        select(SessionRecord.project_name, SessionRecord.project_root)
        .where(SessionRecord.project_name.isnot(None))
        .distinct()
    )
    created = 0
    for project_name, project_root in result.all():
        key = normalize_project_key(project_name)
        existing = await db.execute(select(ProjectRecord).where(ProjectRecord.key == key))
        if existing.scalar_one_or_none():
            continue
        color = PROJECT_COLORS[created % len(PROJECT_COLORS)]
        record = ProjectRecord(key=key, name=project_name, color=color, path=project_root)
        db.add(record)
        created += 1

    await db.flush()

    # Backfill session.project_id
    projects = await db.execute(select(ProjectRecord))
    key_to_id = {p.key: p.id for p in projects.scalars().all()}

    sessions = await db.execute(select(SessionRecord).where(SessionRecord.project_name.isnot(None)))
    for session in sessions.scalars().all():
        key = normalize_project_key(session.project_name)
        if key in key_to_id:
            session.project_id = key_to_id[key]

    await db.commit()
    return created
```

- [ ] **Step 2: Call migration on startup**

In `backend/app/main.py` after `create_all`:

```python
from app.db.migrate_projects import migrate_projects
async with AsyncSessionLocal() as db:
    count = await migrate_projects(db)
    if count > 0:
        logger.info(f"Migrated {count} projects from existing sessions")
```

- [ ] **Step 3: Test migration**

Run: `cd backend && uv run pytest tests/test_project_persistence.py -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/migrate_projects.py backend/app/main.py
git commit -m "feat: auto-migrate existing sessions to projects table on startup"
```

---

### Task 6: Update existing projects API to use DB

**Files:**
- Modify: `backend/app/api/routes/projects.py`

- [ ] **Step 1: Update list_projects and get_project to read from DB**

```python
@router.get("")
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ProjectRecord).order_by(ProjectRecord.sequence, ProjectRecord.name))
    projects = result.scalars().all()
    return [
        {
            "id": p.id,
            "key": p.key,
            "name": p.name,
            "color": p.color,
            "label": p.label,
            "icon": p.icon,
            "path": p.path,
            "sequence": p.sequence,
            "session_count": len(event_processor.project_registry.get_project(p.key).session_ids)
                if event_processor.project_registry.get_project(p.key) else 0,
        }
        for p in projects
    ]
```

- [ ] **Step 2: Run all tests**

Run: `cd backend && uv run pytest -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/routes/projects.py
git commit -m "refactor: projects API reads from DB instead of memory-only registry"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && uv run pytest -v`
Expected: ALL PASS

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: ALL PASS

- [ ] **Step 3: Manual verification**

1. Start backend — projects table auto-created, existing sessions migrated
2. Verify projects list in sidebar (no "Unknown")
3. Restart backend — projects persist (same colors, same names)
4. Test PATCH: `curl -X PATCH http://localhost:8000/api/v1/projects/my-key -H 'Content-Type: application/json' -d '{"color":"#FF0000"}'`
5. Test DELETE: `curl -X DELETE http://localhost:8000/api/v1/projects/my-key` — verify sessions cascade deleted

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: project persistence verified end-to-end"
```
