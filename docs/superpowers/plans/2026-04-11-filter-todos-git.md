# Filter Todos and Git Status by Project/Session — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos and git status should filter by the currently viewed project/session, not show data from all sessions.

**Architecture:** Add `todos` and `gitStatus` to `useFilteredData()` output, filtered by sessionIds. Components read from filtered data instead of raw gameStore.

**Tech Stack:** TypeScript/React, Zustand

---

### Task 1: Filter todos by sessionIds

**Files:**
- Modify: `frontend/src/hooks/useFilteredData.ts` — add filtered todos
- Modify: `frontend/src/components/game/OfficeRoom.tsx` — use filtered todos

- [ ] **Step 1: Check if todos have sessionId**

Verify that `TodoItem` type has a `sessionId` field. If not, todos can't be filtered per-session — need to add `sessionId` to backend todo tracking.

```bash
grep -n "sessionId\|session_id" frontend/src/types/generated.ts | grep -i todo
```

- [ ] **Step 2: Add todos to useFilteredData output**

```typescript
const todos = useMemo(() => {
  const all = useGameStore.getState().todos;
  if (!sessionIds) return all;
  return all.filter((t) => t.sessionId && sessionIds.has(t.sessionId));
}, [sessionIds]);

return { agents, boss, bosses, events, conversation, sessionIds, todos };
```

- [ ] **Step 3: OfficeRoom uses filtered todos**

Replace `isRoom ? roomCtx.project.todos : storeTodos` with filtered todos from useFilteredData when in project view.

- [ ] **Step 4: Commit**

---

### Task 2: Filter git status by session

**Files:**
- Modify: `frontend/src/stores/gameStore.ts` — `gitStatus` becomes `Map<string, GitStatus>`
- Modify: `frontend/src/hooks/useWebSocketEvents.ts` — store git status per sessionId
- Modify: `frontend/src/hooks/useFilteredData.ts` — add filtered gitStatus
- Modify: `frontend/src/components/layout/SessionSidebar.tsx` — use filtered gitStatus
- Modify: `frontend/src/components/game/GitStatusPanel.tsx` — use filtered gitStatus

- [ ] **Step 1: Check how git status is currently received**

```bash
grep -n "git_status\|gitStatus\|setGitStatus" frontend/src/hooks/useWebSocketEvents.ts
```

Determine if git_status messages include a sessionId.

- [ ] **Step 2: Store git status per session in gameStore**

Change `gitStatus: GitStatus | null` to `gitStatusMap: Map<string, GitStatus>`.

- [ ] **Step 3: Add filtered gitStatus to useFilteredData**

```typescript
const gitStatus = useMemo(() => {
  if (!sessionIds) return gameStore.gitStatusMap; // all
  // Return first matching session's git status
  for (const [sid, status] of gameStore.gitStatusMap) {
    if (sessionIds.has(sid)) return status;
  }
  return null;
}, [sessionIds]);
```

- [ ] **Step 4: Update GitStatusPanel to use filtered data**
- [ ] **Step 5: Commit**

---

### Task 3: Verification

- [ ] **Step 1: Open project view — verify only that project's todos shown**
- [ ] **Step 2: Open project view — verify git status matches the project's session**
- [ ] **Step 3: Switch projects — verify data updates**
