# Agent Type Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `agent_type` ("main" / "subagent") field to Agent model so frontend can distinguish boss from subagents — render boss only as BossSprite (not as desk agent), while showing both in AgentStatus panel.

**Architecture:** Add `agent_type` to backend Agent Pydantic model, set it on boss-as-agent in event_processor, add to frontend generated types and AgentAnimationState, filter in canvas rendering.

**Tech Stack:** Python (Pydantic), TypeScript, Vitest

---

### Task 1: Add agent_type to backend Agent model

**Files:**
- Modify: `backend/app/models/agents.py`
- Test: `backend/tests/test_agent_type.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_agent_type.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_agent_type.py -v`
Expected: FAIL — `agent_type` not a field

- [ ] **Step 3: Add agent_type field to Agent model**

In `backend/app/models/agents.py`, add after `native_id`:

```python
    agent_type: str = "subagent"  # "main" or "subagent"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_agent_type.py -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/agents.py backend/tests/test_agent_type.py
git commit -m "feat: add agent_type field to Agent model (main/subagent)"
```

---

### Task 2: Set agent_type="main" on boss-as-agent in event_processor

**Files:**
- Modify: `backend/app/core/event_processor.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_agent_type.py`:

```python
import pytest
from app.core.event_processor import event_processor
from app.core.project_registry import ProjectRegistry
from app.core.state_machine import StateMachine

@pytest.mark.asyncio
async def test_project_grouped_state_boss_has_main_type():
    """Boss agent in ProjectGroup.agents should have agent_type='main'."""
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

    # Cleanup
    event_processor.sessions.clear()
    event_processor.project_registry = ProjectRegistry()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_agent_type.py::test_project_grouped_state_boss_has_main_type -v`
Expected: FAIL — boss agent has default agent_type="subagent"

- [ ] **Step 3: Add agent_type="main" to both boss_as_agent constructions**

In `event_processor.py`, find both `boss_as_agent = Agent(...)` blocks and add `agent_type="main"`:

1. `get_merged_state` (~line 304): `Agent(id=..., agent_type="main", ...)`
2. `get_project_grouped_state` (~line 468): `Agent(id=..., agent_type="main", ...)`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_agent_type.py -v`
Expected: ALL PASS

- [ ] **Step 5: Run all project grouped state tests**

Run: `cd backend && uv run pytest tests/test_project_grouped_state.py tests/test_project_grouped_state_adv.py tests/test_agent_type.py -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/event_processor.py backend/tests/test_agent_type.py
git commit -m "feat: set agent_type=main on boss-as-agent in project state"
```

---

### Task 3: Add agentType to frontend types and AgentAnimationState

**Files:**
- Modify: `frontend/src/types/generated.ts`
- Modify: `frontend/src/stores/gameStore.ts`

- [ ] **Step 1: Add agentType to Agent interface in generated.ts**

```typescript
export interface Agent {
  id: Id;
  nativeId?: Nativeid;
  agentType?: string;  // "main" or "subagent"
  name?: Name;
  // ...rest unchanged
}
```

- [ ] **Step 2: Add agentType to AgentAnimationState in gameStore.ts**

```typescript
export interface AgentAnimationState {
  id: string;
  agentType: "main" | "subagent";
  name: string | null;
  // ...rest unchanged
}
```

- [ ] **Step 3: Set agentType in addAgent**

In `addAgent` implementation, add:

```typescript
agentType: (backendAgent.agentType as "main" | "subagent") ?? "subagent",
```

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/generated.ts frontend/src/stores/gameStore.ts
git commit -m "feat: add agentType to frontend Agent types"
```

---

### Task 4: Filter boss from canvas rendering, keep in AgentStatus

**Files:**
- Modify: `frontend/src/hooks/useFilteredData.ts`
- Modify: `frontend/tests/useFilteredData.test.ts` (or new test)

- [ ] **Step 1: Write failing test**

Add to `frontend/tests/useFilteredData.test.ts` or create separate test:

The `useFilteredData` hook should return two agent lists:
- `agents`: all agents (for AgentStatus panel)
- `subagents`: only subagents (for canvas rendering)

Actually, simpler: the hook already returns `agents`. Components that need only subagents can filter by `agentType !== "main"`. No hook change needed.

The canvas filtering happens in `OfficeGame.tsx` / `MultiRoomCanvas.tsx` where agents are rendered. These components should skip `agent_type === "main"` agents since boss is rendered separately via BossSprite.

- [ ] **Step 2: Filter in OfficeGame/MultiRoomCanvas**

In the canvas rendering code where agents from `ProjectGroup.agents` are rendered, filter:

```typescript
const renderAgents = project.agents.filter(a => a.agentType !== "main");
```

This needs to be done in `MultiRoomCanvas.tsx` or wherever the multi-room agents are rendered as desk sprites.

- [ ] **Step 3: Verify AgentStatus still shows boss**

AgentStatus uses `useFilteredData().agents` which includes all agents. Boss card is rendered separately at the top. The subagent `.map()` should filter out main agents:

```typescript
{agentArray.filter(a => a.agentType !== "main").map((agent) => (
```

- [ ] **Step 4: Run typecheck + tests**

Run: `cd frontend && npx tsc --noEmit && ./node_modules/.bin/vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: filter boss from canvas rendering, keep in AgentStatus"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && uv run pytest --ignore=tests/test_agent_lifecycle.py -q`
Expected: ALL PASS

- [ ] **Step 2: Run all frontend tests**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: ALL PASS

- [ ] **Step 3: Manual verification**

1. Whole Office — boss rendered as BossSprite at desk, NOT as desk agent
2. Projects view — each project shows correct agent count (includes boss)
3. Session view — AgentStatus shows boss card + subagent cards
4. Canvas — only subagents at desks, boss at boss desk
