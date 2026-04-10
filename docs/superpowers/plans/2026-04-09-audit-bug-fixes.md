# Audit Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 14 bugs found by code audit — 6 high severity, 8 medium severity — across WebSocket handling, state management, rendering, and animation systems.

**Architecture:** Each task groups related bugs by file. Fixes are independent and can be committed separately. No new abstractions — all fixes are targeted changes to existing code.

**Tech Stack:** React, Zustand, TypeScript, PixiJS, WebSocket

---

## File Map

| File | Bugs | Action |
|------|------|--------|
| `frontend/src/hooks/useWebSocketEvents.ts` | #1, #2, #12, #13 | Modify |
| `frontend/src/hooks/useProjectWebSocket.ts` | #3 | Modify |
| `frontend/src/systems/compactionAnimation.ts` | #4 | Modify |
| `frontend/src/stores/gameStore.ts` | #5, #10, #11 | Modify |
| `frontend/src/components/game/OfficeGame.tsx` | #6, #14 | Modify |
| `frontend/src/components/game/OfficeRoom.tsx` | #7, #8, #9 | Modify |

---

### Task 1: useWebSocketEvents — Ghost agents, null check, reconnect, history

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

- [ ] **Step 1: Fix #1 — Ghost agents stuck in non-idle phases (line 207-222)**

Non-idle agents that disappear from backend in single-session mode are never removed. Add a force-remove fallback after a timeout.

**Replace** (lines 207-222):
```typescript
      // Detect removed agents (departures)
      for (const agentId of currentAgentIds) {
        if (!backendAgentIds.has(agentId)) {
          const agent = store.agents.get(agentId);

          if (agent && agent.phase === "idle") {
            // Agent at desk — trigger departure animation
            agentMachineService.triggerDeparture(agentId);
          } else if (currentSessionIdRef.current === "__all__") {
            // In multi-session view, force-remove stale agents that aren't
            // in the backend state (they may be stuck in non-idle phases
            // from a previous single-session view)
            agentMachineService.forceRemove(agentId);
            store.removeAgent(agentId);
            processedAgentsRef.current.delete(agentId);
          }
        }
      }
```

**With:**
```typescript
      // Detect removed agents (departures)
      for (const agentId of currentAgentIds) {
        if (!backendAgentIds.has(agentId)) {
          const agent = store.agents.get(agentId);

          if (agent && agent.phase === "idle") {
            // Agent at desk — trigger departure animation
            agentMachineService.triggerDeparture(agentId);
          } else {
            // Agent in non-idle phase (arriving, departing, etc.) but gone from backend.
            // Force-remove to prevent ghost agents accumulating.
            agentMachineService.forceRemove(agentId);
            store.removeAgent(agentId);
            processedAgentsRef.current.delete(agentId);
          }
        }
      }
```

- [ ] **Step 2: Fix #2 — state.boss null check (line 226)**

**Replace** (lines 225-227):
```typescript
      // Update boss state
      store.updateBossBackendState(state.boss.state);
      store.updateBossTask(state.boss.currentTask ?? null);
```

**With:**
```typescript
      // Update boss state (guard against missing boss in __all__ mode)
      if (state.boss) {
        store.updateBossBackendState(state.boss.state);
        store.updateBossTask(state.boss.currentTask ?? null);
      }
```

Also wrap the boss bubble section (lines 229-253) inside the same guard. Move the closing `}` to after line 253.

- [ ] **Step 3: Fix #12 — initialQueueSyncDoneRef not reset on reconnect (line 309-317)**

In the `ws.onopen` handler (around line 529-532), add a reset:

**After** `resetSpawnIndex();` (line 532), add:
```typescript
      initialQueueSyncDoneRef.current = null;
```

This ensures queue state is re-synced from backend after a reconnect.

- [ ] **Step 4: Fix #13 — history suppressed if event arrives before state_update (line 346-349)**

**Replace** (lines 346-349):
```typescript
      if (
        state.history &&
        state.history.length > 0 &&
        store.eventLog.length === 0
      ) {
```

**With:**
```typescript
      if (
        state.history &&
        state.history.length > 0 &&
        store.eventLog.length < state.history.length
      ) {
```

This way history is still loaded even if a few events arrived first, as long as the backend has more history than the frontend has events.

- [ ] **Step 5: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v projectStore.test`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useWebSocketEvents.ts
git commit -m "fix: ghost agents, boss null check, reconnect queue sync, history race"
```

---

### Task 2: useProjectWebSocket — Zombie WebSocket on unmount

**Files:**
- Modify: `frontend/src/hooks/useProjectWebSocket.ts`

- [ ] **Step 1: Fix #3 — Add unmount guard to prevent zombie reconnect**

**Replace** the entire `useEffect` body (lines 17-69) with:

```typescript
  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const ws = new WebSocket(`${WS_URL}/ws/projects`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "project_state" && msg.data) {
            updateFromServer(msg.data as MultiProjectGameState);
          } else if (msg.type === "tasks_update" && msg.data) {
            updateTasks(msg.data as TasksUpdate);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        // Reconnect after 3 seconds — but not if unmounted
        setTimeout(() => {
          if (!unmounted && (wsRef.current === ws || wsRef.current === null)) {
            connect();
          }
        }, 3000);
      };
    }

    connect();

    // Fetch initial task state so TaskDrawer renders immediately
    const abortController = new AbortController();
    fetch(`${API_BASE_URL}/api/v1/tasks/status`, { signal: abortController.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => {
        if (!status || unmounted) return;
        fetch(`${API_BASE_URL}/api/v1/tasks`, { signal: abortController.signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((tasks) => {
            if (!unmounted) {
              updateTasks({
                connected: status.connected,
                adapterType: status.adapterType,
                tasks,
              });
            }
          });
      })
      .catch(() => {});

    return () => {
      unmounted = true;
      abortController.abort();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) ws.close();
    };
  }, [updateFromServer, updateTasks]);
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep useProjectWebSocket`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useProjectWebSocket.ts
git commit -m "fix: prevent zombie WebSocket reconnect after unmount"
```

---

### Task 3: compactionAnimation — Stale closure for resolvedSessionId

**Files:**
- Modify: `frontend/src/systems/compactionAnimation.ts`

- [ ] **Step 1: Fix #4 — Add resolvedSessionId to both useEffect dependency arrays**

**Replace** tick effect deps (lines 296-303):
```typescript
  }, [
    phase,
    bossDesk,
    trashCanPosition,
    setCompactionPhase,
    contextUtilization,
    setContextUtilization,
  ]);
```

**With:**
```typescript
  }, [
    phase,
    bossDesk,
    trashCanPosition,
    setCompactionPhase,
    contextUtilization,
    setContextUtilization,
    resolvedSessionId,
  ]);
```

**Replace** start/stop effect deps (line 342):
```typescript
  }, [phase, bossDesk, animatedPosition, contextUtilization]);
```

**With:**
```typescript
  }, [phase, bossDesk, animatedPosition, contextUtilization, resolvedSessionId]);
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep compactionAnimation`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/systems/compactionAnimation.ts
git commit -m "fix: add resolvedSessionId to compaction useEffect deps (stale closure)"
```

---

### Task 4: gameStore — processBackendState Map wipe, enqueueBubble guard, reset Maps

**Files:**
- Modify: `frontend/src/stores/gameStore.ts`

- [ ] **Step 1: Fix #5 — processBackendState should merge, not replace contextUtilizations (line 1223)**

**Replace:**
```typescript
          contextUtilizations: new Map([[backendState.sessionId, backendState.office.contextUtilization ?? 0.0]]),
```

**With:**
```typescript
          contextUtilizations: new Map([
            ...get().contextUtilizations,
            [backendState.sessionId, backendState.office.contextUtilization ?? 0.0],
          ]),
```

- [ ] **Step 2: Fix #10 — enqueueBubble compaction guard uses wrong key (line 746)**

The `state.sessionId` can be `"__all__"` or `"None"`, neither of which will match a real session entry. For boss bubbles, we should check if ANY session is compacting.

**Replace** (lines 746-747):
```typescript
          const currentPhase = state.compactionPhases.get(state.sessionId) ?? "idle";
          const isCompacting = currentPhase !== "idle";
```

**With:**
```typescript
          // Check if any session is currently compacting (covers "__all__" and "None" sessionId)
          let isCompacting = false;
          for (const phase of state.compactionPhases.values()) {
            if (phase !== "idle") { isCompacting = true; break; }
          }
```

- [ ] **Step 3: Fix #11 — reset/resetForReplay share initialState Map references (lines 1088-1105)**

**Replace** (lines 1088-1095):
```typescript
    reset: () =>
      set({
        ...initialState,
        agents: new Map(),
        boss: { ...initialBossState, bubble: createEmptyBubbleState() },
        whiteboardData: { ...initialWhiteboardData },
        whiteboardMode: 0,
      }),
```

**With:**
```typescript
    reset: () =>
      set({
        ...initialState,
        agents: new Map(),
        boss: { ...initialBossState, bubble: createEmptyBubbleState() },
        compactionPhases: new Map(),
        isCompactingMap: new Map(),
        contextUtilizations: new Map(),
        whiteboardData: { ...initialWhiteboardData },
        whiteboardMode: 0,
      }),
```

Do the same for `resetForReplay` (lines 1097-1105) — add the three `new Map()` lines.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run tests/gameStoreCompaction.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v projectStore.test`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/gameStore.ts
git commit -m "fix: gameStore Map merge, enqueueBubble guard, reset fresh Maps"
```

---

### Task 5: OfficeGame — Per-session todos, pan/zoom fix

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: Fix #6 — todos inherited from project, not per-session (line 107)**

**Replace:**
```typescript
        todos: project?.todos ?? [],
```

**With:**
```typescript
        todos: [], // Session rooms don't have per-session todos (project-level would be misleading)
```

- [ ] **Step 2: Fix #14 — drag/pan doesn't set userHasZoomed (around line 284)**

Find the `TransformWrapper` props (around line 280-290). Add `onPanning` handler:

**After:**
```typescript
        onPinching={() => {
          userHasZoomed.current = true;
        }}
```

**Add:**
```typescript
        onPanning={() => {
          userHasZoomed.current = true;
        }}
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep OfficeGame`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/game/OfficeGame.tsx
git commit -m "fix: per-session empty todos, pan sets userHasZoomed"
```

---

### Task 6: OfficeRoom — Phantom bubble, selector stability, memo deps

**Files:**
- Modify: `frontend/src/components/game/OfficeRoom.tsx`

- [ ] **Step 1: Fix #7 — bossBubble rendered unconditionally in mergedView (line 689)**

**Replace:**
```typescript
      {bossBubble && (
        <pixiContainer x={bossPosition.x} y={bossPosition.y}>
          <BossBubble content={bossBubble} yOffset={-80} />
        </pixiContainer>
      )}
```

**With:**
```typescript
      {bossBubble && !isMergedView && !isMultiBossRoom && (
        <pixiContainer x={bossPosition.x} y={bossPosition.y}>
          <BossBubble content={bossBubble} yOffset={-80} />
        </pixiContainer>
      )}
```

- [ ] **Step 2: Fix #8 — Inline selector creates new function ref every render (lines 98-107)**

**Replace:**
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

**With:**
```typescript
  const roomKey = isRoom ? roomCtx.project.key : null;
  const contextUtilization = useGameStore(
    roomKey !== null
      ? selectContextUtilizationForSession(roomKey)
      : selectContextUtilization,
  );
  const isCompacting = useGameStore(
    roomKey !== null
      ? selectIsCompactingForSession(roomKey)
      : selectIsCompacting,
  );
```

Add the imports at the top of the file:
```typescript
import {
  // ... existing imports ...
  selectContextUtilizationForSession,
  selectIsCompactingForSession,
} from "@/stores/gameStore";
```

Note: `selectContextUtilizationForSession` and `selectIsCompactingForSession` are factory selectors already exported from gameStore (added in Step 2 of the scene unification). They return stable function references for a given sessionId.

- [ ] **Step 3: Fix #9 — useMemo deps list roomCtx instead of roomSubagents (lines 180, 197, 215)**

**Replace** `occupiedDesks` deps (line 197):
```typescript
  }, [isRoom, roomCtx, storeAgents]);
```
**With:**
```typescript
  }, [isRoom, roomSubagents, storeAgents]);
```

**Replace** `deskTasks` deps (line 215):
```typescript
  }, [isRoom, roomCtx, storeAgents]);
```
**With:**
```typescript
  }, [isRoom, roomSubagents, storeAgents]);
```

Also fix the `roomSubagents` memo itself (line 180):
**Replace:**
```typescript
    [isRoom, roomCtx],
```
**With:**
```typescript
    [isRoom, roomAgents],
```

(`roomAgents` is already extracted as `isRoom ? roomCtx.project.agents : []` at line 130)

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep OfficeRoom`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/game/OfficeRoom.tsx
git commit -m "fix: phantom bubble, selector stability, memo dependencies"
```

---

### Task 7: Final Validation

- [ ] **Step 1: Run full typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -v projectStore.test`
Expected: No new errors

- [ ] **Step 2: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Tag milestone**

```bash
git tag v0.19.0
```
