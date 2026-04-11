# Unified Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all view modes to use a single data source (gameStore via `/ws/all` WebSocket), eliminating the dual-data-source bug where project/session views show stale or wrong agent data.

**Architecture:** Frontend WebSocket always connects to `/ws/all`. All agents from all sessions land in gameStore with their `sessionId` set. View switching only changes UI filtering (via `getFilteredSessionIds`), never reconnects WebSocket. MultiRoomCanvas still handles grid views (`projects`, `sessions`, `session`), but its room data is built from gameStore instead of `/ws/projects`. `project` (single project zoom) renders a full-size animated OfficeRoom filtered by sessionIds. `/ws/projects` is kept only for project metadata (names, colors, session counts) — no longer the source for agent data.

**Tech Stack:** Next.js, Zustand (gameStore/projectStore), PixiJS (@pixi/react), XState (agent state machines), WebSocket

---

### Task 1: WebSocket always connects to `__all__`

**Files:**
- Modify: `frontend/src/app/page.tsx:159-162`
- Modify: `frontend/src/hooks/useSessionSwitch.ts:45-59`

- [ ] **Step 1: Change WebSocket sessionId to always be `__all__`**

In `page.tsx`, the WebSocket connection currently uses the selected `sessionId`:
```typescript
// page.tsx line 162 — BEFORE
useWebSocketEvents({ sessionId });
```

Change to:
```typescript
// page.tsx line 162 — AFTER
useWebSocketEvents({ sessionId: "__all__" });
```

- [ ] **Step 2: Remove session-switch WebSocket reset**

In `useSessionSwitch.ts`, `handleSessionSelect` currently resets the gameStore and state machines when switching sessions (lines 48-53). Since we're always connected to `__all__`, we must NOT clear agents on session switch — that would wipe all data. Remove the reset:

```typescript
// useSessionSwitch.ts — BEFORE
const handleSessionSelect = async (id: string): Promise<void> => {
    if (id === sessionId) return;
    agentMachineService.reset();
    useGameStore.getState().resetForSessionSwitch();
    setSessionId(id);
    showStatus(...);
};
```

```typescript
// useSessionSwitch.ts — AFTER
const handleSessionSelect = async (id: string): Promise<void> => {
    if (id === sessionId) return;
    // No reset — WebSocket stays on __all__, agents persist in gameStore.
    // Session switch only affects UI filtering via projectStore.
    setSessionId(id);
    showStatus(...);
};
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"`
Expected: No errors from modified files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/hooks/useSessionSwitch.ts
git commit -m "feat: WebSocket always connects to __all__ for unified data source"
```

---

### Task 2: Simplify useFilteredData — remove fallback hacks

**Files:**
- Modify: `frontend/src/hooks/useFilteredData.ts`

- [ ] **Step 1: Remove project fallback in agents filter**

The fallback added earlier (lines 62-100) is no longer needed because `__all__` mode populates gameStore with all agents. Replace the entire `agents` useMemo:

```typescript
// useFilteredData.ts — AFTER
const agents = useMemo((): AgentAnimationState[] => {
  const all = Array.from(gameAgents.values()).sort(
    (a, b) => a.number - b.number,
  );
  if (!sessionIds) return all;
  return all.filter((a) => a.sessionId && sessionIds.has(a.sessionId));
}, [gameAgents, sessionIds]);
```

- [ ] **Step 2: Simplify boss filtering**

The boss should come from gameStore data filtered by sessionIds, not from activeProject. Replace the `boss` useMemo:

```typescript
// useFilteredData.ts — AFTER
const boss = useMemo((): BossAnimationState => {
  // In project/session view, find the boss from filtered bosses
  if (sessionIds && sessionIds.size > 0) {
    const filteredBosses = Array.from(gameBosses.values()).filter(
      (b) => b.sessionId && sessionIds.has(b.sessionId),
    );
    if (filteredBosses.length > 0) {
      // Return the most active boss (non-idle first)
      const active = filteredBosses.find((b) => b.backendState !== "idle");
      return active ?? filteredBosses[0];
    }
  }
  return gameBoss;
}, [sessionIds, gameBoss, gameBosses]);
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useFilteredData.ts
git commit -m "refactor: simplify useFilteredData, remove project data fallback"
```

---

### Task 3: OfficeGame — project view renders single animated OfficeRoom

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx:112-120,142-150`

The key change: when `viewMode === "project"`, render a single full-size `<OfficeRoom>` (like `"office"` mode) instead of `<MultiRoomCanvas>`. The filtering happens in gameStore via `useFilteredData`. `projects` overview and `sessions`/`session` views keep MultiRoomCanvas.

- [ ] **Step 1: Update isMultiRoom logic**

```typescript
// OfficeGame.tsx line 114 — BEFORE
const isMultiRoom = viewMode !== "office";
```

```typescript
// OfficeGame.tsx line 114 — AFTER
// "office" and "project" both render a single animated OfficeRoom.
// "projects", "sessions", "session" use MultiRoomCanvas grid.
const isMultiRoom = viewMode !== "office" && viewMode !== "project";
```

- [ ] **Step 2: Rebuild room data from gameStore agents**

Currently `sessionRooms` and `projects` use agent data from `/ws/projects` (projectStore). We need to enrich them with gameStore agent data so the mini rooms in `projects`/`sessions` views show correct counts.

Build a helper that enriches project rooms with gameStore agent counts:

```typescript
// OfficeGame.tsx — add import
import { useGameStore, selectAgents } from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
```

Then add a memo that enriches projects with gameStore agent counts:

```typescript
const gameAgents = useGameStore(useShallow(selectAgents));

// Enrich project rooms with live agent data from gameStore
const enrichedProjects = useMemo(() => {
  // Group gameStore agents by project (via sessionId → project lookup)
  const sessionToProject = new Map<string, string>();
  for (const s of storeSessions) {
    const proj = projects.find((p) => p.name === s.projectName);
    if (proj) sessionToProject.set(s.id, proj.key);
  }

  const agentsByProject = new Map<string, Agent[]>();
  for (const agent of gameAgents.values()) {
    if (!agent.sessionId) continue;
    const projKey = sessionToProject.get(agent.sessionId);
    if (!projKey) continue;
    if (!agentsByProject.has(projKey)) agentsByProject.set(projKey, []);
    agentsByProject.get(projKey)!.push(agent as unknown as Agent);
  }

  return projects.map((p) => ({
    ...p,
    agents: agentsByProject.get(p.key) ?? p.agents,
  }));
}, [projects, gameAgents, storeSessions]);
```

Use `enrichedProjects` instead of `projects` in `multiRoomRooms`.

- [ ] **Step 3: Update multiRoomRooms to use enriched data and exclude project view**

```typescript
// OfficeGame.tsx — AFTER
const multiRoomRooms = useMemo(() => {
  if (viewMode === "sessions") return sessionRooms;
  if (viewMode === "session")
    return sessionRooms.filter((r) => r.key === activeRoomKey);
  // "project" mode uses single OfficeRoom, not MultiRoomCanvas
  return enrichedProjects; // "projects" mode — with live agent data
}, [viewMode, sessionRooms, enrichedProjects, activeRoomKey]);
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/OfficeGame.tsx
git commit -m "feat: project view renders single animated OfficeRoom"
```

---

### Task 4: OfficeRoom — filter gameStore agents by sessionIds in project view

**Files:**
- Modify: `frontend/src/components/game/OfficeRoom.tsx:90-200`

When `viewMode === "project"` and `isRoom === false` (single OfficeRoom mode), the component already reads from `storeAgents`. But it needs to filter by the project's sessionIds. We use `useFilteredData` for panels — for the canvas we need to filter `storeAgents` directly.

- [ ] **Step 1: Import useFilteredData and filter agents**

Add the filtered sessionIds to OfficeRoom so it can filter gameStore agents when in project view:

```typescript
// OfficeRoom.tsx — add import
import { useFilteredData } from "@/hooks/useFilteredData";
import { useProjectStore, selectViewMode } from "@/stores/projectStore";
```

Then after the existing store reads (around line 98), add:

```typescript
const viewMode = useProjectStore(selectViewMode);
const { sessionIds } = useFilteredData();
```

- [ ] **Step 2: Filter storeAgents by sessionIds when not in room mode**

Update the `deskAgents` memo to filter by sessionIds when in project view:

```typescript
// OfficeRoom.tsx — update deskAgents memo
const deskAgents = useMemo(() => {
  let agents = storeAgents;

  // In project view (single OfficeRoom, not room mode), filter by sessionIds
  if (!isRoom && sessionIds) {
    const filtered = new Map<string, AgentAnimationState>();
    for (const [id, agent] of agents) {
      if (agent.sessionId && sessionIds.has(agent.sessionId)) {
        filtered.set(id, agent);
      }
    }
    agents = filtered;
  }

  // In merged view (__all__), filter out main agents (boss uses BossSprite)
  if (isMergedView) {
    const filtered = new Map(agents);
    for (const [id, agent] of agents) {
      if (agent.agentType === "main") filtered.delete(id);
    }
    return filtered;
  }

  return agents;
}, [isRoom, isMergedView, storeAgents, sessionIds]);
```

- [ ] **Step 3: Handle boss display for project view**

The boss in project view should come from the filtered data. The `useFilteredData` hook already returns the correct boss. Use it:

```typescript
// Where boss is used for rendering (around line 224+), add:
const filteredBoss = useFilteredData().boss;
```

Then in the boss rendering section, when `!isRoom && viewMode === "project"`, use `filteredBoss` instead of `storeBoss`.

- [ ] **Step 4: Verify compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/game/OfficeRoom.tsx
git commit -m "feat: OfficeRoom filters agents by sessionIds in project view"
```

---

### Task 5: AgentStatus count fix

**Files:**
- Modify: `frontend/src/components/game/AgentStatus.tsx:89-90`

The count logic needs to handle `__all__` mode where main agents are in `agentArray`. This was partially fixed already but should be verified against the new data flow.

- [ ] **Step 1: Verify count logic**

The current code:
```typescript
const hasMainInArray = agentArray.some((a) => a.agentType === "main");
const totalCount = hasMainInArray
  ? agentArray.length
  : agentArray.length + 1;
```

This is correct for unified data source:
- In `__all__` mode: main agents are in the array → `agentArray.length` is correct
- In single-session `"office"` mode: main agents NOT in array → `+1` for boss
- In `"project"` mode (now filtered from gameStore): main agents are in array (from `__all__`) → `agentArray.length` is correct

No code change needed. Just verify.

- [ ] **Step 2: Commit (skip if no changes)**

---

### Task 6: End-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "tests/"`
Expected: No errors from modified files.

- [ ] **Step 2: Test office view**

Open http://localhost:3000. Click "Whole Office". Verify:
- Agents from all active sessions appear
- Boss displays correctly
- Animations work (walking, typing, bubbles)

- [ ] **Step 3: Test projects overview**

Click "Projects" tab. Verify:
- Each project shows as a mini room in grid
- Agent counts are correct per project
- Clicking a project zooms to single animated room

- [ ] **Step 4: Test project zoom**

Click a project name (e.g., "deployclaw"). Verify:
- Full-size animated OfficeRoom appears (not mini room)
- Only agents from that project's sessions are shown
- AGENT STATE panel shows correct agent count and boss data
- Boss bubble shows that project's data, not another project's

- [ ] **Step 5: Test session view**

Click a specific session in the sidebar. Verify:
- Agents for only that session appear
- Events/conversation filter correctly

- [ ] **Step 6: Test switching between views**

Rapidly switch between office → project → session → projects → office. Verify:
- No stale agents lingering
- No console errors
- Agent counts update immediately

- [ ] **Step 7: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: unified data source — all views use gameStore via __all__ WebSocket"
```
