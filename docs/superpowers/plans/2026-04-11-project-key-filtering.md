# Project Key-Based Filtering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile string-based project name matching with stable key-based matching for session → project filtering.

**Architecture:** Backend adds `projectKey` to session REST response. Frontend `SessionInfo` carries `projectKey`. `getFilteredSessionIds()` matches `session.projectKey === activeRoomKey` instead of `session.projectName === project.name`. OfficeGame grouping uses the same key-based lookup.

**Tech Stack:** FastAPI (backend), TypeScript/React (frontend), Zustand stores

---

### Task 1: Backend — add projectKey to session response

**Files:**
- Modify: `backend/app/api/routes/sessions.py:46-57,125-136`

- [ ] **Step 1: Add projectKey to SessionSummary type**

```python
# sessions.py — SessionSummary
class SessionSummary(TypedDict):
    id: str
    label: str | None
    projectName: str | None
    projectKey: str | None          # ← ADD
    projectRoot: str | None
    createdAt: str
    updatedAt: str
    status: str
    eventCount: int
```

- [ ] **Step 2: Populate projectKey in list_sessions**

In the loop building session summaries (around line 125), look up the project from the registry:

```python
project = event_processor.project_registry.get_project_for_session(rec.id)
sessions.append({
    "id": rec.id,
    "label": rec.label,
    "projectName": rec.project_name,
    "projectKey": project.key if project else None,   # ← ADD
    "projectRoot": rec.project_root,
    # ... rest unchanged
})
```

- [ ] **Step 3: Verify backend**

```bash
curl -s http://localhost:8000/api/v1/sessions | python3 -c "
import json, sys
for s in json.load(sys.stdin)[:3]:
    print(f\"{s['id'][:8]} projectKey={s.get('projectKey')} projectName={s.get('projectName')}\")
"
```
Expected: Each session shows a `projectKey` value.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes/sessions.py
git commit -m "feat: add projectKey to session REST response"
```

---

### Task 2: Frontend — add projectKey to Session and SessionInfo types

**Files:**
- Modify: `frontend/src/hooks/useSessions.ts:17-26`
- Modify: `frontend/src/stores/projectStore.ts:12-14`
- Modify: `frontend/src/app/page.tsx:136-140`

- [ ] **Step 1: Add projectKey to Session interface**

```typescript
// useSessions.ts
export interface Session {
  id: string;
  label: string | null;
  projectName: string | null;
  projectKey: string | null;       // ← ADD
  projectRoot: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
  eventCount: number;
}
```

- [ ] **Step 2: Add projectKey to SessionInfo**

```typescript
// projectStore.ts
export interface SessionInfo {
  id: string;
  projectName: string | null;
  projectKey: string | null;       // ← ADD
}
```

- [ ] **Step 3: Pass projectKey in page.tsx setSessions**

```typescript
// page.tsx — update the sessions sync effect
const filtered = sessions
  .filter((s) => s.id !== "__all__")
  .map((s) => ({ id: s.id, projectName: s.projectName, projectKey: s.projectKey }));
setSessions(filtered);
```

- [ ] **Step 4: Verify compilation**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSessions.ts frontend/src/stores/projectStore.ts frontend/src/app/page.tsx
git commit -m "feat: add projectKey to Session and SessionInfo types"
```

---

### Task 3: Frontend — use projectKey in getFilteredSessionIds

**Files:**
- Modify: `frontend/src/utils/agentFilter.ts:31-50`

- [ ] **Step 1: Update getFilteredSessionIds to use projectKey**

```typescript
// agentFilter.ts — BEFORE
export function getFilteredSessionIds(
  viewMode: ViewMode,
  activeRoomKey: string | null,
  projects: ProjectGroup[],
  sessions: { id: string; projectName: string | null }[],
): Set<string> | null {
  if (viewMode === "project" && activeRoomKey) {
    const project = projects.find((p) => p.key === activeRoomKey);
    if (!project) return new Set();
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.projectName === project.name) ids.add(s.id);
    }
    return ids;
  }
  // ...
}
```

```typescript
// agentFilter.ts — AFTER
export function getFilteredSessionIds(
  viewMode: ViewMode,
  activeRoomKey: string | null,
  projects: ProjectGroup[],
  sessions: { id: string; projectName: string | null; projectKey: string | null }[],
): Set<string> | null {
  if (viewMode === "project" && activeRoomKey) {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.projectKey === activeRoomKey) ids.add(s.id);
    }
    return ids;
  }
  // ... rest unchanged
}
```

Note: `projects` parameter is no longer needed for the "project" case but keep it for backward compat (other code may use it).

- [ ] **Step 2: Verify compilation**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/agentFilter.ts
git commit -m "refactor: use projectKey instead of projectName for session filtering"
```

---

### Task 4: Frontend — use projectKey in OfficeGame grouping

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx:162-197`

- [ ] **Step 1: Update enrichedProjects to use projectKey**

The current code builds `sessionToProject` map using `projects.find(p => p.name === s.projectName)`. Change to use `projectKey`:

```typescript
// OfficeGame.tsx enrichedProjects — BEFORE
const sessionToProject = new Map<string, string>();
for (const s of storeSessions) {
  const proj = projects.find((p) => p.name === s.projectName);
  if (proj) sessionToProject.set(s.id, proj.key);
}

// OfficeGame.tsx enrichedProjects — AFTER
const sessionToProject = new Map<string, string>();
for (const s of storeSessions) {
  if (s.projectKey) sessionToProject.set(s.id, s.projectKey);
}
```

- [ ] **Step 2: Update sessionRooms to use projectKey**

```typescript
// OfficeGame.tsx sessionRooms — BEFORE
const projectByName = new Map(projects.map((p) => [p.name, p]));
// ...
const project = projectByName.get(session.projectName ?? "") ?? projects[0];

// OfficeGame.tsx sessionRooms — AFTER
const projectByKey = new Map(projects.map((p) => [p.key, p]));
// ...
const project = projectByKey.get(session.projectKey ?? "") ?? projects[0];
```

- [ ] **Step 3: Verify compilation**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/OfficeGame.tsx
git commit -m "refactor: use projectKey for agent grouping in OfficeGame"
```

---

### Task 5: Verification

- [ ] **Step 1: End-to-end check**

1. Open http://localhost:3000
2. Click a project in sidebar → verify correct agents shown
3. Switch between projects → verify filtering updates
4. Check AGENT STATE panel matches canvas

- [ ] **Step 2: Verify REST response**

```bash
curl -s http://localhost:8000/api/v1/sessions | python3 -c "
import json, sys
for s in json.load(sys.stdin)[:5]:
    print(f\"{s['id'][:8]} key={s.get('projectKey')} name={s.get('projectName')}\")
"
```

- [ ] **Step 3: Final commit if needed**
