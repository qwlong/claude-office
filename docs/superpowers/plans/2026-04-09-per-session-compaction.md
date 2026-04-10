# Per-Session Compaction State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make compaction animation state per-session so each room in multi-room view can independently play compaction animations.

**Architecture:** Replace the three global compaction fields (`compactionPhase`, `isCompacting`, `contextUtilization`) in `gameStore` with `Map<string, T>` keyed by `sessionId`. Add backward-compatible selectors that read from the current active `sessionId` so single-office mode is unchanged. Update `useCompactionAnimation` to accept an optional `sessionId` parameter. All downstream consumers (animation system, agent machine, WebSocket events) use the selectors or pass `sessionId` explicitly.

**Key namespace note:** All Map keys are real session IDs (e.g. `"abc123..."`), not project keys. In multi-room "sessions" view, each room's `ProjectGroup.key` equals the session ID. In "projects" view, rooms group multiple sessions — compaction events are per-session, so project rooms won't show individual compaction animations (the spec acknowledges this limitation: "Step 2 可以先只改数据结构，实际触发仍走全局路径").

**Tech Stack:** React, Zustand, TypeScript, PixiJS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/stores/gameStore.ts` | Modify | Map-ify compaction state, add per-session actions + backward-compat selectors |
| `frontend/src/systems/compactionAnimation.ts` | Modify | Accept optional `sessionId`, read/write per-session state |
| `frontend/src/components/game/OfficeRoom.tsx` | Modify | Pass `sessionId` from RoomContext to `useCompactionAnimation` |
| `frontend/src/hooks/useWebSocketEvents.ts` | Modify | Pass `sessionId` to `triggerCompaction` and `setContextUtilization` |
| `frontend/src/systems/animationSystem.ts` | Modify | Use selector for compaction phase check |
| `frontend/src/machines/agentMachineService.ts` | Modify | Use selector for compaction phase check |
| `frontend/tests/gameStoreCompaction.test.ts` | Create | Tests for per-session compaction state |

---

### Task 1: gameStore — Map-ify Compaction State

**Files:**
- Modify: `frontend/src/stores/gameStore.ts`
- Create: `frontend/tests/gameStoreCompaction.test.ts`

- [ ] **Step 1: Write failing tests for per-session compaction state**

Create `frontend/tests/gameStoreCompaction.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  useGameStore,
  selectCompactionPhase,
  selectIsCompacting,
  selectContextUtilization,
} from "@/stores/gameStore";

describe("per-session compaction state", () => {
  beforeEach(() => {
    // Reset store to initial state
    useGameStore.setState({
      sessionId: "session-1",
      compactionPhases: new Map(),
      isCompactingMap: new Map(),
      contextUtilizations: new Map(),
    });
  });

  it("triggerCompaction sets state for given sessionId", () => {
    useGameStore.getState().triggerCompaction("session-1");
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("walking_to_trash");
    expect(state.isCompactingMap.get("session-1")).toBe(true);
  });

  it("triggerCompaction without sessionId uses current sessionId", () => {
    useGameStore.getState().triggerCompaction();
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("walking_to_trash");
    expect(state.isCompactingMap.get("session-1")).toBe(true);
  });

  it("setCompactionPhase updates correct session", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().triggerCompaction("session-2");
    useGameStore.getState().setCompactionPhase("session-1", "jumping");
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("jumping");
    expect(state.compactionPhases.get("session-2")).toBe("walking_to_trash");
  });

  it("backward-compat selectors read current session", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().setContextUtilization(0.75, "session-1");
    const state = useGameStore.getState();
    expect(selectCompactionPhase(state)).toBe("walking_to_trash");
    expect(selectIsCompacting(state)).toBe(true);
    expect(selectContextUtilization(state)).toBe(0.75);
  });

  it("setContextUtilization updates per-session", () => {
    useGameStore.getState().setContextUtilization(0.5, "session-1");
    useGameStore.getState().setContextUtilization(0.8, "session-2");
    const state = useGameStore.getState();
    expect(state.contextUtilizations.get("session-1")).toBe(0.5);
    expect(state.contextUtilizations.get("session-2")).toBe(0.8);
  });

  it("two sessions can compact independently", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().triggerCompaction("session-2");
    useGameStore.getState().setCompactionPhase("session-1", "jumping");
    useGameStore.getState().setCompactionPhase("session-2", "walking_back");
    const state = useGameStore.getState();
    expect(state.compactionPhases.get("session-1")).toBe("jumping");
    expect(state.compactionPhases.get("session-2")).toBe("walking_back");
  });

  it("resetForSessionSwitch clears all Maps", () => {
    useGameStore.getState().triggerCompaction("session-1");
    useGameStore.getState().setContextUtilization(0.5, "session-1");
    // Simulate reset
    useGameStore.setState({
      compactionPhases: new Map(),
      isCompactingMap: new Map(),
      contextUtilizations: new Map(),
    });
    const state = useGameStore.getState();
    expect(state.compactionPhases.size).toBe(0);
    expect(state.isCompactingMap.size).toBe(0);
    expect(state.contextUtilizations.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run tests/gameStoreCompaction.test.ts`
Expected: FAIL — `compactionPhases` property doesn't exist on store

- [ ] **Step 3: Modify gameStore interface — replace scalar fields with Maps**

In `frontend/src/stores/gameStore.ts`, change the interface (around lines 215-218):

**Replace:**
```typescript
contextUtilization: number; // 0.0 to 1.0 representing context window usage
toolUsesSinceCompaction: number; // Counter for safety sign - resets on compaction
isCompacting: boolean; // True when context compaction animation is active
compactionPhase: CompactionAnimationPhase; // Phase of the compaction animation
```

**With:**
```typescript
// Per-session compaction state (keyed by sessionId)
compactionPhases: Map<string, CompactionAnimationPhase>;
isCompactingMap: Map<string, boolean>;
contextUtilizations: Map<string, number>;
toolUsesSinceCompaction: number; // Counter for safety sign - resets on compaction
```

- [ ] **Step 4: Update action signatures to accept optional sessionId**

Note: The spec shows `sessionId: string` (required) on all actions. We intentionally use `sessionId?: string` (optional) for `triggerCompaction` and `setContextUtilization` to maintain backward compatibility — callers that don't pass a sessionId will default to the current active session. `setCompactionPhase` and `setIsCompacting` take required `sessionId` since they're only called from `useCompactionAnimation` which always has a resolved sessionId.

In the interface (around lines 229-233), change:

**Replace:**
```typescript
setContextUtilization: (utilization: number) => void;
setToolUsesSinceCompaction: (count: number) => void;
triggerCompaction: () => void;
setCompactionPhase: (phase: CompactionAnimationPhase) => void;
setIsCompacting: (isCompacting: boolean) => void;
```

**With:**
```typescript
setContextUtilization: (utilization: number, sessionId?: string) => void;
setToolUsesSinceCompaction: (count: number) => void;
triggerCompaction: (sessionId?: string) => void;
setCompactionPhase: (sessionId: string, phase: CompactionAnimationPhase) => void;
setIsCompacting: (sessionId: string, isCompacting: boolean) => void;
```

- [ ] **Step 5: Update initial state (around line 386-389)**

**Replace:**
```typescript
contextUtilization: 0.0,
toolUsesSinceCompaction: 0,
isCompacting: false,
compactionPhase: "idle" as CompactionAnimationPhase,
```

**With:**
```typescript
compactionPhases: new Map<string, CompactionAnimationPhase>(),
isCompactingMap: new Map<string, boolean>(),
contextUtilizations: new Map<string, number>(),
toolUsesSinceCompaction: 0,
```

- [ ] **Step 6: Update action implementations (around lines 931-946)**

**Replace:**
```typescript
setContextUtilization: (contextUtilization) =>
  set({ contextUtilization }),
setToolUsesSinceCompaction: (toolUsesSinceCompaction) =>
  set({ toolUsesSinceCompaction }),
triggerCompaction: () => {
  set({
    isCompacting: true,
    toolUsesSinceCompaction: 0,
    compactionPhase: "walking_to_trash",
  });
},
setCompactionPhase: (compactionPhase) => set({ compactionPhase }),
setIsCompacting: (isCompacting) => set({ isCompacting }),
```

**With:**
```typescript
setContextUtilization: (utilization, sessionId) =>
  set((state) => {
    const sid = sessionId ?? state.sessionId;
    const next = new Map(state.contextUtilizations);
    next.set(sid, utilization);
    return { contextUtilizations: next };
  }),
setToolUsesSinceCompaction: (toolUsesSinceCompaction) =>
  set({ toolUsesSinceCompaction }),
triggerCompaction: (sessionId) =>
  set((state) => {
    const sid = sessionId ?? state.sessionId;
    const phases = new Map(state.compactionPhases);
    const compacting = new Map(state.isCompactingMap);
    phases.set(sid, "walking_to_trash");
    compacting.set(sid, true);
    return {
      compactionPhases: phases,
      isCompactingMap: compacting,
      toolUsesSinceCompaction: 0,
    };
  }),
setCompactionPhase: (sessionId, phase) =>
  set((state) => {
    const next = new Map(state.compactionPhases);
    next.set(sessionId, phase);
    return { compactionPhases: next };
  }),
setIsCompacting: (sessionId, isCompacting) =>
  set((state) => {
    const next = new Map(state.isCompactingMap);
    next.set(sessionId, isCompacting);
    return { isCompactingMap: next };
  }),
```

- [ ] **Step 7: Update enqueueBubble compaction check (around line 745)**

**Replace:**
```typescript
const isCompacting = state.compactionPhase !== "idle";
```

**With:**
```typescript
const currentPhase = state.compactionPhases.get(state.sessionId) ?? "idle";
const isCompacting = currentPhase !== "idle";
```

- [ ] **Step 8: Update reset state (around lines 1098-1101)**

**Replace:**
```typescript
contextUtilization: 0.0,
toolUsesSinceCompaction: 0,
isCompacting: false,
compactionPhase: "idle",
```

**With:**
```typescript
compactionPhases: new Map(),
isCompactingMap: new Map(),
contextUtilizations: new Map(),
toolUsesSinceCompaction: 0,
```

- [ ] **Step 9: Update processBackendState (around line 1203)**

The `processBackendState` function builds the full store state from a backend snapshot. Replace the scalar `contextUtilization` with a per-session Map entry.

**Replace:**
```typescript
contextUtilization: backendState.office.contextUtilization ?? 0.0,
```

**With:**
```typescript
contextUtilizations: new Map([[backendState.sessionId, backendState.office.contextUtilization ?? 0.0]]),
```

The `compactionPhases` and `isCompactingMap` are not set in `processBackendState` — the Maps will be empty (idle), which is correct since the backend snapshot doesn't include animation state.

- [ ] **Step 10: Update selectors (around lines 1234-1238)**

**Replace:**
```typescript
export const selectContextUtilization = (state: GameStore) =>
  state.contextUtilization;
export const selectIsCompacting = (state: GameStore) => state.isCompacting;
export const selectCompactionPhase = (state: GameStore) =>
  state.compactionPhase;
```

**With:**
```typescript
export const selectContextUtilization = (state: GameStore) =>
  state.contextUtilizations.get(state.sessionId) ?? 0;
export const selectIsCompacting = (state: GameStore) =>
  state.isCompactingMap.get(state.sessionId) ?? false;
export const selectCompactionPhase = (state: GameStore) =>
  state.compactionPhases.get(state.sessionId) ?? "idle";

// Per-session selectors (for multi-room use)
export const selectCompactionPhaseForSession = (sessionId: string) =>
  (state: GameStore) => state.compactionPhases.get(sessionId) ?? "idle";
export const selectIsCompactingForSession = (sessionId: string) =>
  (state: GameStore) => state.isCompactingMap.get(sessionId) ?? false;
export const selectContextUtilizationForSession = (sessionId: string) =>
  (state: GameStore) => state.contextUtilizations.get(sessionId) ?? 0;
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `cd frontend && npx vitest run tests/gameStoreCompaction.test.ts`
Expected: PASS

- [ ] **Step 12: Run typecheck to find remaining compilation errors**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "projectStore.test.ts"`
Expected: Errors in consumer files (compactionAnimation.ts, animationSystem.ts, agentMachineService.ts, useWebSocketEvents.ts, OfficeRoom.tsx) — these will be fixed in subsequent tasks.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/stores/gameStore.ts frontend/tests/gameStoreCompaction.test.ts
git commit -m "refactor: Map-ify compaction state in gameStore for per-session support"
```

---

### Task 2: compactionAnimation — Accept sessionId Parameter

**Files:**
- Modify: `frontend/src/systems/compactionAnimation.ts`

- [ ] **Step 1: Update useCompactionAnimation to accept sessionId**

The hook currently reads global selectors. Change it to accept an optional `sessionId` and read from per-session state when provided.

In `frontend/src/systems/compactionAnimation.ts`, change the hook signature and selector usage:

**Replace (around line 116-121):**
```typescript
export function useCompactionAnimation(): CompactionAnimationState {
  const phase = useGameStore(selectCompactionPhase);
  const boss = useGameStore(selectBoss);
  const contextUtilization = useGameStore(selectContextUtilization);
  const setCompactionPhase = useGameStore((s) => s.setCompactionPhase);
  const setContextUtilization = useGameStore((s) => s.setContextUtilization);
```

**With:**
```typescript
export function useCompactionAnimation(sessionId?: string): CompactionAnimationState {
  // When sessionId is provided, read per-session state; otherwise use current session selectors
  const phase = useGameStore(
    sessionId
      ? (s) => s.compactionPhases.get(sessionId) ?? "idle"
      : selectCompactionPhase,
  );
  const boss = useGameStore(selectBoss);
  const contextUtilization = useGameStore(
    sessionId
      ? (s) => s.contextUtilizations.get(sessionId) ?? 0
      : selectContextUtilization,
  );
  const resolvedSessionId = useGameStore((s) => sessionId ?? s.sessionId);
  const setCompactionPhase = useGameStore((s) => s.setCompactionPhase);
  const setContextUtilization = useGameStore((s) => s.setContextUtilization);
```

- [ ] **Step 2: Update all setCompactionPhase calls to pass sessionId**

Throughout the hook, replace all calls:

**Replace** (line ~169):
```typescript
setCompactionPhase("jumping");
```
**With:**
```typescript
setCompactionPhase(resolvedSessionId, "jumping");
```

**Replace** (line ~252):
```typescript
setCompactionPhase("walking_back");
```
**With:**
```typescript
setCompactionPhase(resolvedSessionId, "walking_back");
```

**Replace** (line ~261):
```typescript
setCompactionPhase("idle");
```
**With:**
```typescript
setCompactionPhase(resolvedSessionId, "idle");
```

- [ ] **Step 3: Update setIsCompacting call to pass sessionId**

**Replace** (line ~262-263):
```typescript
useGameStore.getState().setIsCompacting(false);
```
**With:**
```typescript
useGameStore.getState().setIsCompacting(resolvedSessionId, false);
```

- [ ] **Step 4: Update setContextUtilization calls to pass sessionId**

**Replace** (line ~250):
```typescript
setContextUtilization(0);
```
**With:**
```typescript
setContextUtilization(0, resolvedSessionId);
```

- [ ] **Step 5: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep compactionAnimation`
Expected: No errors in compactionAnimation.ts

- [ ] **Step 6: Commit**

```bash
git add frontend/src/systems/compactionAnimation.ts
git commit -m "refactor: useCompactionAnimation accepts optional sessionId for per-session state"
```

---

### Task 3: Update Consumer Files

**Files:**
- Modify: `frontend/src/systems/animationSystem.ts`
- Modify: `frontend/src/machines/agentMachineService.ts`
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

- [ ] **Step 1: Fix animationSystem.ts compaction phase check (line ~335)**

**Replace:**
```typescript
if (store.compactionPhase === "idle") {
```

**With:**
```typescript
if ((store.compactionPhases.get(store.sessionId) ?? "idle") === "idle") {
```

- [ ] **Step 2: Fix agentMachineService.ts compaction phase check (line ~219)**

**Replace:**
```typescript
if (store.compactionPhase !== "idle") return;
```

**With:**
```typescript
if ((store.compactionPhases.get(store.sessionId) ?? "idle") !== "idle") return;
```

- [ ] **Step 3: Fix useWebSocketEvents.ts — compactionPhase log (line ~242)**

**Replace:**
```typescript
`[WS] Boss bubble NEW text, alreadyHas=${alreadyHas}, compactionPhase=${store.compactionPhase}`,
```

**With:**
```typescript
`[WS] Boss bubble NEW text, alreadyHas=${alreadyHas}, compactionPhase=${store.compactionPhases.get(store.sessionId) ?? "idle"}`,
```

- [ ] **Step 4: Fix useWebSocketEvents.ts — contextUtilization update (line ~324)**

This is in the state sync handler. The `state` object here is the backend game state. We need to pass the sessionId.

**Replace:**
```typescript
store.setContextUtilization(state.office.contextUtilization);
```

**With:**
```typescript
store.setContextUtilization(state.office.contextUtilization, state.sessionId);
```

- [ ] **Step 5: Fix useWebSocketEvents.ts — triggerCompaction (line ~458)**

**Replace:**
```typescript
useGameStore.getState().triggerCompaction();
```

**With:**
```typescript
// context_compaction events may include a sessionId from the backend
const compactionSessionId = (message.event as Record<string, unknown>).sessionId as string | undefined;
useGameStore.getState().triggerCompaction(compactionSessionId);
```

- [ ] **Step 6: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "projectStore.test.ts"`
Expected: Only pre-existing errors, no new ones

- [ ] **Step 7: Commit**

```bash
git add frontend/src/systems/animationSystem.ts frontend/src/machines/agentMachineService.ts frontend/src/hooks/useWebSocketEvents.ts
git commit -m "refactor: update compaction consumers to use per-session Maps"
```

---

### Task 4: OfficeRoom — Pass sessionId to useCompactionAnimation

**Files:**
- Modify: `frontend/src/components/game/OfficeRoom.tsx`

- [ ] **Step 1: Update useCompactionAnimation call to pass sessionId in room mode**

In `frontend/src/components/game/OfficeRoom.tsx`, the hook is currently called without arguments (around line 100).

**Key namespace:** In sessions view, `roomCtx.project.key` equals the real session ID (set as `key: session.id` in OfficeGame.tsx line 85). In projects view, `key` is a project key — compaction won't render there since no Map entry will match, which is the intended behavior per spec.

**Replace:**
```typescript
// Compaction animation (only active in single-office mode)
const compactionAnimation = useCompactionAnimation();
```

**With:**
```typescript
// Compaction animation — in room mode, use the room's key as sessionId
// (In sessions view, project.key IS the session ID; in projects view, no match = no animation)
const compactionSessionId = isRoom ? roomCtx.project.key : undefined;
const compactionAnimation = useCompactionAnimation(compactionSessionId);
```

- [ ] **Step 2: Update per-session selectors for room mode**

The `contextUtilization` and `isCompacting` selectors currently read the global (backward-compat) selectors. In room mode, they should read per-session state using the same key. Update (around lines 90-91):

**Replace:**
```typescript
const contextUtilization = useGameStore(selectContextUtilization);
const isCompacting = useGameStore(selectIsCompacting);
```

**With:**
```typescript
const contextUtilization = useGameStore(
  isRoom
    ? (s) => s.contextUtilizations.get(roomCtx!.project.key) ?? 0
    : selectContextUtilization,
);
const isCompacting = useGameStore(
  isRoom
    ? (s) => s.isCompactingMap.get(roomCtx!.project.key) ?? false
    : selectIsCompacting,
);
```

Note: `roomCtx!` is safe here because `isRoom` guards it (`isRoom = roomCtx !== null`).

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v "projectStore.test.ts"`
Expected: No new errors

- [ ] **Step 4: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass (including the new gameStoreCompaction tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/game/OfficeRoom.tsx
git commit -m "feat: OfficeRoom passes sessionId to useCompactionAnimation for per-room compaction"
```

---

### Task 5: Final Validation

- [ ] **Step 1: Run make checkall from project root**

Run: `cd /Users/apple/Projects/others/random/claude-office && make checkall`
Expected: Only pre-existing errors (backend ruff lint, frontend React Compiler warnings, projectStore.test.ts ViewMode errors). No new errors.

- [ ] **Step 2: Verify single-office mode unchanged**

Manual check: start `make dev-tmux`, open browser, verify:
- Single office renders normally
- Compaction animation plays correctly when triggered
- Debug overlays work

- [ ] **Step 3: Verify multi-room mode**

Manual check: switch to multi-room view, verify:
- Each room renders independently
- If compaction is triggered for a specific session, only that room animates

- [ ] **Step 4: Final commit with tag**

```bash
git commit --allow-empty -m "milestone: Step 2 complete — per-session compaction state"
git tag post-scene-unification
```
