# Strip /ws/projects Agent Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant agent/boss/todos data from `/ws/projects` WebSocket. Frontend already derives this from gameStore (`/ws/all`). This eliminates double computation on the backend and double transmission over two WebSocket connections.

**Architecture:** Backend `get_project_grouped_state()` returns metadata-only ProjectGroups (key, name, color, root, sessionCount). Frontend `ProjectSidebar` computes agent counts from gameStore. `enrichedProjects` in OfficeGame remains the sole source for room agent data.

**Tech Stack:** FastAPI (backend), TypeScript/React (frontend), Zustand

---

### Task 1: Backend — strip agents/boss/todos from ProjectGroup

**Files:**
- Modify: `backend/app/models/projects.py` — make agents/boss/todos optional or remove
- Modify: `backend/app/core/event_processor.py:470-548` — simplify get_project_grouped_state

- [ ] **Step 1: Make agents/boss/todos optional in ProjectGroup model**

```python
# projects.py — AFTER
class ProjectGroup(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    key: str
    name: str
    color: str
    root: str | None
    agents: list[Agent] = Field(default_factory=list)
    boss: Boss = Field(default_factory=lambda: Boss(state="idle"))
    session_count: int
    todos: list[TodoItem] = Field(default_factory=list)
```

- [ ] **Step 2: Simplify get_project_grouped_state — skip agent/boss/todos construction**

Remove the inner loop that builds `all_agents`, `group_boss`, `all_todos`. Just build metadata:

```python
for key, sessions in project_sessions.items():
    project = self.project_registry.get_project(key)
    registry_count = len(project.session_ids) if project else len(sessions)
    groups.append(ProjectGroup(
        key=key,
        name=project.name if project else "Unknown",
        color=project.color if project else "#888888",
        root=project.root if project else None,
        session_count=max(registry_count, len(sessions)),
    ))
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/projects.py backend/app/core/event_processor.py
git commit -m "perf: strip agent/boss/todos from /ws/projects response"
```

---

### Task 2: Frontend — ProjectSidebar uses gameStore for agent counts

**Files:**
- Modify: `frontend/src/components/layout/ProjectSidebar.tsx`

- [ ] **Step 1: Add gameStore subscription and compute agent counts**

```typescript
import { useGameStore, selectAgents } from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
import { selectSessions } from "@/stores/projectStore";

// Inside component:
const storeSessions = useProjectStore(selectSessions);
const gameAgents = useGameStore(useShallow(selectAgents));

const agentCountByProject = useMemo(() => {
  const sessionToProject = new Map<string, string>();
  for (const s of storeSessions) {
    if (s.projectKey) sessionToProject.set(s.id, s.projectKey);
  }
  const counts = new Map<string, number>();
  for (const agent of gameAgents.values()) {
    if (!agent.sessionId) continue;
    const projKey = sessionToProject.get(agent.sessionId);
    if (!projKey) continue;
    counts.set(projKey, (counts.get(projKey) ?? 0) + 1);
  }
  return counts;
}, [gameAgents, storeSessions]);
```

- [ ] **Step 2: Replace project.agents.length with agentCountByProject**

Line 97: total count → `Array.from(agentCountByProject.values()).reduce((sum, c) => sum + c, 0)`
Line 157: per-project → `agentCountByProject.get(project.key) ?? 0`

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/ProjectSidebar.tsx
git commit -m "refactor: ProjectSidebar agent counts from gameStore"
```

---

### Task 3: Frontend — remove groupAgentsBySessionId (dead code)

**Files:**
- Modify: `frontend/src/utils/agentFilter.ts` — remove function if unused
- Check: `frontend/src/components/game/OfficeGame.tsx` — was the import already removed?

- [ ] **Step 1: Verify no remaining usages**

```bash
grep -r "groupAgentsBySessionId" frontend/src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Remove if unused, commit**

---

### Task 4: Verify end-to-end

- [ ] **Step 1: TypeScript compilation**
- [ ] **Step 2: Open http://localhost:3000, check ProjectSidebar shows correct agent counts**
- [ ] **Step 3: Switch between projects, verify agent counts update in real time**
- [ ] **Step 4: Check projects overview grid — rooms show correct agent counts in labels**
