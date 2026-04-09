# ViewMode Filtering Cleanup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the filtering code — remove dead code, export and test `getFilteredSessionIds`, fix unsafe type casts.

**Architecture:** Consolidate filtering into `agentFilter.ts` (agent/session ID computation) + `filterHelpers.ts` (array filtering). Remove unused `getFilteredAgents`. Export and test `getFilteredSessionIds`.

**Tech Stack:** TypeScript, Vitest, React hooks

---

### Task 1: Remove dead `getFilteredAgents` function

**Files:**
- Modify: `frontend/src/utils/agentFilter.ts`
- Modify: `frontend/tests/agentFilter.test.ts`

- [ ] **Step 1: Remove `getFilteredAgents` from agentFilter.ts**

Delete the `getFilteredAgents` function (lines 31-46). It is no longer imported anywhere — AgentStatus now uses `useFilteredData` which calls `getFilteredAgentIds`.

- [ ] **Step 2: Remove `getFilteredAgents` tests from agentFilter.test.ts**

Delete the `describe("getFilteredAgents", ...)` block and update the import to remove `getFilteredAgents`.

- [ ] **Step 3: Run tests**

Run: `cd frontend && ./node_modules/.bin/vitest run tests/agentFilter.test.ts`
Expected: ALL PASS (only `getFilteredAgentIds` and `groupAgentsBySessionId` tests remain)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/agentFilter.ts frontend/tests/agentFilter.test.ts
git commit -m "cleanup: remove dead getFilteredAgents function"
```

---

### Task 2: Move `getFilteredSessionIds` to agentFilter.ts, export and test

**Files:**
- Modify: `frontend/src/utils/agentFilter.ts`
- Modify: `frontend/src/hooks/useFilteredData.ts`
- Modify: `frontend/tests/agentFilter.test.ts`

- [ ] **Step 1: Write failing tests for `getFilteredSessionIds`**

Add to `frontend/tests/agentFilter.test.ts`:

```typescript
import { getFilteredSessionIds } from "../src/utils/agentFilter";

describe("getFilteredSessionIds", () => {
  const projects = [
    makeProject({ key: "proj-1", name: "My Project" }),
    makeProject({ key: "proj-2", name: "Other Project" }),
  ];

  const sessions = [
    { id: "sess-1", projectName: "My Project" },
    { id: "sess-2", projectName: "My Project" },
    { id: "sess-3", projectName: "Other Project" },
  ];

  it("returns null for office view", () => {
    expect(getFilteredSessionIds("office", null, projects, sessions)).toBeNull();
  });

  it("returns null for projects overview", () => {
    expect(getFilteredSessionIds("projects", null, projects, sessions)).toBeNull();
  });

  it("returns null for sessions overview", () => {
    expect(getFilteredSessionIds("sessions", null, projects, sessions)).toBeNull();
  });

  it("returns all session IDs for a project in project view", () => {
    const result = getFilteredSessionIds("project", "proj-1", projects, sessions);
    expect(result).toEqual(new Set(["sess-1", "sess-2"]));
  });

  it("returns single session ID in session view", () => {
    const result = getFilteredSessionIds("session", "sess-1", projects, sessions);
    expect(result).toEqual(new Set(["sess-1"]));
  });

  it("returns empty Set for unknown project", () => {
    const result = getFilteredSessionIds("project", "nonexistent", projects, sessions);
    expect(result).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && ./node_modules/.bin/vitest run tests/agentFilter.test.ts`
Expected: FAIL — `getFilteredSessionIds` is not exported from agentFilter

- [ ] **Step 3: Move `getFilteredSessionIds` from useFilteredData.ts to agentFilter.ts**

Cut the function from `frontend/src/hooks/useFilteredData.ts` and paste into `frontend/src/utils/agentFilter.ts`. Export it. Update the import in `useFilteredData.ts`.

The function signature uses inline types for `projects` and `sessions` params. Simplify to use `ProjectGroup[]` and `SessionInfo[]` (import `SessionInfo` from projectStore or define a minimal interface).

```typescript
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
  if (viewMode === "session" && activeRoomKey) {
    return new Set([activeRoomKey]);
  }
  return null;
}
```

Update `useFilteredData.ts` to import from agentFilter:
```typescript
import { getFilteredAgentIds, getFilteredSessionIds } from "@/utils/agentFilter";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && ./node_modules/.bin/vitest run tests/agentFilter.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/agentFilter.ts frontend/src/hooks/useFilteredData.ts frontend/tests/agentFilter.test.ts
git commit -m "refactor: move getFilteredSessionIds to agentFilter.ts with tests"
```

---

### Task 3: Fix unsafe type cast in filterConversation

**Files:**
- Modify: `frontend/src/utils/filterHelpers.ts`
- Modify: `frontend/tests/useFilteredData.test.ts`

The current `filterConversation` casts `c as Record<string, unknown>` to read `sessionId`. This is because `ConversationEntry` (from generated.ts) doesn't have `sessionId` but we inject it at runtime via `setConversation`.

- [ ] **Step 1: Write test for filterConversation with typed sessionId**

Update `frontend/tests/useFilteredData.test.ts` — the existing tests already use `sessionId` on conversation entries. Verify they still pass after the type change.

- [ ] **Step 2: Define a `ConversationEntryWithSession` type in filterHelpers.ts**

```typescript
/** ConversationEntry extended with sessionId injected by setConversation. */
export type ConversationEntryWithSession = ConversationEntry & { sessionId?: string };
```

Update `filterConversation` signature:

```typescript
export function filterConversation(
  conversation: ConversationEntryWithSession[],
  sessionIds: Set<string> | null,
): ConversationEntryWithSession[] {
  if (!sessionIds) return conversation;
  return conversation.filter((c) => c.sessionId && sessionIds.has(c.sessionId));
}
```

Update `gameStore.ts` `conversation` field to use `ConversationEntryWithSession[]` or keep as `ConversationEntry[]` and let the `setConversation` implementation handle the cast in one place.

- [ ] **Step 3: Run tests**

Run: `cd frontend && ./node_modules/.bin/vitest run && npx tsc --noEmit`
Expected: ALL PASS, no type errors (except pre-existing projectStore.test.ts ones)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/filterHelpers.ts frontend/src/hooks/useFilteredData.ts frontend/tests/useFilteredData.test.ts
git commit -m "cleanup: type-safe sessionId on ConversationEntry, remove unsafe cast"
```

---

### Task 4: Clean up agentFilter.test.ts — remove stale import

**Files:**
- Modify: `frontend/tests/agentFilter.test.ts`

- [ ] **Step 1: Verify no stale imports remain**

After Task 1 removed `getFilteredAgents`, ensure the test file no longer imports it. Clean up any unused imports.

- [ ] **Step 2: Run all tests**

Run: `cd frontend && ./node_modules/.bin/vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/agentFilter.test.ts
git commit -m "cleanup: remove stale imports from agentFilter tests"
```

---

### Task 5: Full verification

- [ ] **Step 1: Run typecheck + all tests**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v projectStore.test.ts && ./node_modules/.bin/vitest run`
Expected: zero new type errors, ALL tests pass

- [ ] **Step 2: Verify file structure is clean**

Final file responsibilities:

| File | Responsibility |
|------|---------------|
| `agentFilter.ts` | Pure functions: `getFilteredAgentIds`, `getFilteredSessionIds`, `groupAgentsBySessionId` |
| `filterHelpers.ts` | Pure functions: `filterEvents`, `filterConversation` (array filtering by sessionId) |
| `useFilteredData.ts` | React hook: composes the above, reads from stores, returns filtered data |

No dead code, no unsafe casts, all functions tested.
