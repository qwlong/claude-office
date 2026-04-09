# Agent Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist agents to DB so they survive restarts, and include main agent (boss) in agent counts.

**Architecture:** Add `AgentRecord` model with FKs to sessions and projects. Write to DB at key lifecycle points (create, state change, assignment change, leave). On restart, restore active agents from DB. Include main agent in `ProjectGroup.agents`.

**Tech Stack:** Python, SQLAlchemy (async), FastAPI, pytest, SQLite

**Spec:** `docs/superpowers/specs/2026-04-09-agent-persistence-design.md`

---

### Task 1: Add AgentRecord model

**Files:**
- Modify: `backend/app/db/models.py`
- Create: `backend/tests/test_agent_persistence.py`

- [ ] **Step 1: Write failing test**

```python
import pytest
from sqlalchemy import select
from app.db.models import AgentRecord, ProjectRecord, SessionRecord

@pytest.mark.asyncio
async def test_agent_record_creation(db_session):
    project = ProjectRecord(id="p1", key="proj", name="Proj", color="#000")
    db_session.add(project)
    await db_session.flush()

    session = SessionRecord(id="s1", project_id="p1")
    db_session.add(session)
    await db_session.flush()

    agent = AgentRecord(
        id="a1",
        session_id="s1",
        project_id="p1",
        external_id="main",
        agent_type="main",
        name="Claude",
        state="working",
    )
    db_session.add(agent)
    await db_session.commit()

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == "a1"))
    fetched = result.scalar_one()
    assert fetched.external_id == "main"
    assert fetched.agent_type == "main"
    assert fetched.name == "Claude"

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()

@pytest.mark.asyncio
async def test_agent_cascade_delete_with_session(db_session):
    project = ProjectRecord(id="p-ac", key="proj-ac", name="P", color="#000")
    db_session.add(project)
    await db_session.flush()
    session = SessionRecord(id="s-ac", project_id="p-ac")
    db_session.add(session)
    await db_session.flush()
    agent = AgentRecord(id="a-ac", session_id="s-ac", project_id="p-ac",
                        external_id="main", agent_type="main")
    db_session.add(agent)
    await db_session.commit()

    # Delete session → agent should cascade
    await db_session.delete(session)
    await db_session.commit()

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == "a-ac"))
    assert result.scalar_one_or_none() is None

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()

@pytest.mark.asyncio
async def test_agent_cascade_delete_with_project(db_session):
    project = ProjectRecord(id="p-acp", key="proj-acp", name="P", color="#000")
    db_session.add(project)
    await db_session.flush()
    session = SessionRecord(id="s-acp", project_id="p-acp")
    db_session.add(session)
    await db_session.flush()
    agent = AgentRecord(id="a-acp", session_id="s-acp", project_id="p-acp",
                        external_id="sub1", agent_type="subagent")
    db_session.add(agent)
    await db_session.commit()

    # Delete project → session + agent should cascade
    await db_session.delete(project)
    await db_session.commit()

    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == "a-acp"))
    assert result.scalar_one_or_none() is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_agent_persistence.py -v`
Expected: FAIL — `AgentRecord` not found

- [ ] **Step 3: Add AgentRecord model**

In `backend/app/db/models.py`, add after `SessionRecord`:

```python
class AgentRecord(Base):
    """Database model for agents within a session."""

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[str | None] = mapped_column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    external_id: Mapped[str] = mapped_column(String, nullable=False)
    agent_type: Mapped[str] = mapped_column(String, nullable=False)  # "main" / "subagent"
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    state: Mapped[str | None] = mapped_column(String, nullable=True)
    assignment: Mapped[str | None] = mapped_column(String, nullable=True)
    desk: Mapped[int | None] = mapped_column(nullable=True)
    color: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped[SessionRecord] = relationship("SessionRecord", back_populates="agents_list")
```

Add to `SessionRecord`:
```python
    agents_list: Mapped[list[AgentRecord]] = relationship("AgentRecord", back_populates="session", cascade="all, delete-orphan")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_agent_persistence.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/tests/test_agent_persistence.py
git commit -m "feat: add AgentRecord model with cascade delete"
```

---

### Task 2: Create agent DB service

**Files:**
- Create: `backend/app/db/agent_store.py`
- Create: `backend/tests/test_agent_store.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
from app.db.agent_store import AgentStore
from app.db.models import AgentRecord, ProjectRecord, SessionRecord

@pytest.mark.asyncio
async def test_create_agent(db_session):
    # Setup
    project = ProjectRecord(id="p-store", key="proj-store", name="P", color="#000")
    db_session.add(project)
    session = SessionRecord(id="s-store", project_id="p-store")
    db_session.add(session)
    await db_session.commit()

    store = AgentStore()
    agent = await store.create_agent(
        db_session, session_id="s-store", project_id="p-store",
        external_id="main", agent_type="main", name="Claude",
        state="working", assignment="Fix bug"
    )
    assert agent.external_id == "main"
    assert agent.assignment == "Fix bug"

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()

@pytest.mark.asyncio
async def test_update_agent_state(db_session):
    project = ProjectRecord(id="p-upd", key="proj-upd", name="P", color="#000")
    db_session.add(project)
    session = SessionRecord(id="s-upd", project_id="p-upd")
    db_session.add(session)
    await db_session.commit()

    store = AgentStore()
    agent = await store.create_agent(
        db_session, session_id="s-upd", project_id="p-upd",
        external_id="main", agent_type="main", state="idle"
    )
    await store.update_state(db_session, agent.id, "working")

    from sqlalchemy import select
    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == agent.id))
    assert result.scalar_one().state == "working"

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()

@pytest.mark.asyncio
async def test_mark_agent_ended(db_session):
    project = ProjectRecord(id="p-end", key="proj-end", name="P", color="#000")
    db_session.add(project)
    session = SessionRecord(id="s-end", project_id="p-end")
    db_session.add(session)
    await db_session.commit()

    store = AgentStore()
    agent = await store.create_agent(
        db_session, session_id="s-end", project_id="p-end",
        external_id="sub1", agent_type="subagent", state="working"
    )
    await store.mark_ended(db_session, agent.id, "completed")

    from sqlalchemy import select
    result = await db_session.execute(select(AgentRecord).where(AgentRecord.id == agent.id))
    fetched = result.scalar_one()
    assert fetched.state == "completed"
    assert fetched.ended_at is not None

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()

@pytest.mark.asyncio
async def test_get_active_agents_for_session(db_session):
    project = ProjectRecord(id="p-act", key="proj-act", name="P", color="#000")
    db_session.add(project)
    session = SessionRecord(id="s-act", project_id="p-act")
    db_session.add(session)
    await db_session.commit()

    store = AgentStore()
    await store.create_agent(db_session, session_id="s-act", project_id="p-act",
                             external_id="main", agent_type="main", state="working")
    a2 = await store.create_agent(db_session, session_id="s-act", project_id="p-act",
                                  external_id="sub1", agent_type="subagent", state="working")
    await store.mark_ended(db_session, a2.id, "completed")

    active = await store.get_active_agents(db_session, session_id="s-act")
    assert len(active) == 1
    assert active[0].external_id == "main"

    # Cleanup
    await db_session.delete(project)
    await db_session.commit()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_agent_store.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AgentStore**

Create `backend/app/db/agent_store.py`:

```python
"""Agent persistence: DB operations for agent lifecycle."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentRecord


class AgentStore:
    """Handles agent CRUD at key lifecycle points."""

    async def create_agent(
        self,
        db: AsyncSession,
        *,
        session_id: str,
        project_id: str | None = None,
        external_id: str,
        agent_type: str,
        name: str | None = None,
        state: str | None = None,
        assignment: str | None = None,
        desk: int | None = None,
        color: str | None = None,
    ) -> AgentRecord:
        now = datetime.now(UTC)
        record = AgentRecord(
            id=str(uuid.uuid4()),
            session_id=session_id,
            project_id=project_id,
            external_id=external_id,
            agent_type=agent_type,
            name=name,
            state=state,
            assignment=assignment,
            desk=desk,
            color=color,
            started_at=now,
        )
        db.add(record)
        await db.commit()
        return record

    async def update_state(self, db: AsyncSession, agent_id: str, state: str) -> None:
        result = await db.execute(select(AgentRecord).where(AgentRecord.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.state = state
            await db.commit()

    async def update_assignment(self, db: AsyncSession, agent_id: str, assignment: str) -> None:
        result = await db.execute(select(AgentRecord).where(AgentRecord.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.assignment = assignment
            await db.commit()

    async def mark_ended(self, db: AsyncSession, agent_id: str, state: str = "completed") -> None:
        result = await db.execute(select(AgentRecord).where(AgentRecord.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.state = state
            agent.ended_at = datetime.now(UTC)
            await db.commit()

    async def get_active_agents(
        self, db: AsyncSession, *, session_id: str | None = None, project_id: str | None = None
    ) -> list[AgentRecord]:
        query = select(AgentRecord).where(AgentRecord.ended_at.is_(None))
        if session_id:
            query = query.where(AgentRecord.session_id == session_id)
        if project_id:
            query = query.where(AgentRecord.project_id == project_id)
        result = await db.execute(query)
        return list(result.scalars().all())

    async def find_by_external_id(
        self, db: AsyncSession, session_id: str, external_id: str
    ) -> AgentRecord | None:
        result = await db.execute(
            select(AgentRecord).where(
                AgentRecord.session_id == session_id,
                AgentRecord.external_id == external_id,
                AgentRecord.ended_at.is_(None),
            )
        )
        return result.scalar_one_or_none()


agent_store = AgentStore()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_agent_store.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/agent_store.py backend/tests/test_agent_store.py
git commit -m "feat: add AgentStore for agent lifecycle DB operations"
```

---

### Task 3: Write to DB at key lifecycle points

**Files:**
- Modify: `backend/app/core/event_processor.py`
- Modify: `backend/app/core/handlers/session_handler.py`
- Modify: `backend/app/core/handlers/agent_handler.py`

- [ ] **Step 1: Create main agent on session_start**

In `event_processor.py`, after SESSION_START handling (around line 600):

```python
from app.db.agent_store import agent_store
from app.db.database import AsyncSessionLocal

# After project registration:
async with AsyncSessionLocal() as db:
    project = self.project_registry.get_project_for_session(event.session_id)
    await agent_store.create_agent(
        db,
        session_id=event.session_id,
        project_id=project.id if project else None,
        external_id="main",
        agent_type="main",
        name="Claude",
        state="working",
    )
```

- [ ] **Step 2: Create subagent on SUBAGENT_START**

In `event_processor.py`, after subagent_start handling:

```python
# After handle_subagent_start:
agent = sm.agents.get(event.data.agent_id or "")
if agent:
    async with AsyncSessionLocal() as db:
        project = self.project_registry.get_project_for_session(event.session_id)
        await agent_store.create_agent(
            db,
            session_id=event.session_id,
            project_id=project.id if project else None,
            external_id=event.data.agent_id or "",
            agent_type="subagent",
            name=agent.name,
            state=str(agent.state),
            assignment=agent.currentTask,
            color=agent.color,
        )
```

- [ ] **Step 3: Mark agent ended on SUBAGENT_STOP**

In `event_processor.py`, after handle_subagent_stop:

```python
# Find and mark ended
async with AsyncSessionLocal() as db:
    agent_rec = await agent_store.find_by_external_id(
        db, event.session_id, event.data.agent_id or ""
    )
    if agent_rec:
        await agent_store.mark_ended(db, agent_rec.id, "completed")
```

- [ ] **Step 4: Mark main agent ended on SESSION_END**

```python
# In SESSION_END handler:
async with AsyncSessionLocal() as db:
    agent_rec = await agent_store.find_by_external_id(db, event.session_id, "main")
    if agent_rec:
        await agent_store.mark_ended(db, agent_rec.id, "completed")
```

- [ ] **Step 5: Run existing tests**

Run: `cd backend && uv run pytest --ignore=tests/test_agent_lifecycle.py -q`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/event_processor.py
git commit -m "feat: write agents to DB at key lifecycle points"
```

---

### Task 4: Include main agent in ProjectGroup.agents

**Files:**
- Modify: `backend/app/core/event_processor.py`

- [ ] **Step 1: Add main agent to all_agents in get_project_grouped_state**

In `get_project_grouped_state`, around line 450, after the agent loop:

```python
for sid, sm in sessions:
    state = sm.to_game_state(sid)

    # Add boss as "main" agent
    main_agent = Agent(
        id=sid,  # Use session ID as main agent ID
        name="Claude",
        color=color,
        number=desk_num,
        state=state.boss.state.value if hasattr(state.boss.state, 'value') else str(state.boss.state),
        desk=desk_num,
        currentTask=state.boss.current_task,
        bubble=state.boss.bubble,
        session_id=sid,
        project_key=key,
    )
    all_agents.append(main_agent)
    desk_num += 1

    # Existing subagent loop
    for agent in state.agents:
        ...
```

This ensures `project.agents.length` includes the main agent, fixing the sidebar count.

- [ ] **Step 2: Run tests**

Run: `cd backend && uv run pytest tests/test_project_grouped_state.py tests/test_project_grouped_state_adv.py -v`
Expected: Tests may need count adjustments (+1 per session for main agent)

- [ ] **Step 3: Update affected tests**

Adjust expected agent counts in grouped state tests to include main agent.

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/event_processor.py backend/tests/
git commit -m "feat: include main agent (Claude) in ProjectGroup.agents"
```

---

### Task 5: Restore agents from DB on startup

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/core/event_processor.py`

- [ ] **Step 1: Add agent restore logic**

In `event_processor.py`, add method:

```python
async def restore_agents_from_db(self) -> None:
    """Restore active agents from DB into StateMachines."""
    from app.db.agent_store import agent_store

    async with AsyncSessionLocal() as db:
        for session_id, sm in self.sessions.items():
            agents = await agent_store.get_active_agents(db, session_id=session_id)
            for rec in agents:
                if rec.agent_type == "subagent" and rec.external_id not in sm.agents:
                    # Recreate agent in state machine
                    from app.models.agents import Agent, AgentState
                    agent = Agent(
                        id=rec.external_id,
                        name=rec.name,
                        color=rec.color or "#888888",
                        number=rec.desk or 1,
                        state=AgentState(rec.state) if rec.state else AgentState.WORKING,
                        desk=rec.desk,
                        currentTask=rec.assignment,
                    )
                    sm.agents[rec.external_id] = agent
```

- [ ] **Step 2: Call restore on startup**

In `main.py`, after `load_from_db`:

```python
await event_processor.restore_agents_from_db()
```

- [ ] **Step 3: Run tests**

Run: `cd backend && uv run pytest --ignore=tests/test_agent_lifecycle.py -q`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/event_processor.py backend/app/main.py
git commit -m "feat: restore active agents from DB on startup"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && uv run pytest --ignore=tests/test_agent_lifecycle.py -q`
Expected: ALL PASS

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: ALL PASS

- [ ] **Step 3: Manual verification**

1. Start backend, create a session with subagents
2. Check DB: `SELECT * FROM agents` — verify main + subagents recorded
3. Restart backend — verify agents restored
4. Check sidebar — project agent count includes main agent
5. Delete project via API — verify agents cascade deleted
