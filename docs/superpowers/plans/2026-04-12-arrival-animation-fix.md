# Arrival Animation Fix — Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents arrive with visible walk animation (elevator → desk) in ~2-4 seconds, without getting stuck. First agent gets full boss interaction, subsequent agents skip queue and walk directly to desk. Departure unchanged.

---

### Task 1: Add SPAWN_WALK_TO_DESK to XState machine (TDD)

**Files:**
- Modify: `frontend/src/machines/agentMachine.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/agentMachineSpawn.test.ts
import { createActor } from "xstate";

test("SPAWN_WALK_TO_DESK goes to walking_to_desk_direct then idle", () => {
  const machine = createAgentMachine(mockActions);
  const actor = createActor(machine);
  actor.start();
  
  actor.send({ type: "SPAWN_WALK_TO_DESK", agentId: "a1", name: "Test", desk: 1, position: {x:0,y:0} });
  expect(actor.getSnapshot().value).toBe("walking_to_desk_direct");
  
  actor.send({ type: "ARRIVED_AT_DESK" });
  expect(actor.getSnapshot().value).toBe("idle");
});
```

- [ ] **Step 2: Add `walking_to_desk_direct` state**

New state between `idle` and `arrival`:
```typescript
walking_to_desk_direct: {
  entry: [
    { type: "notifyPhaseChange", params: { phase: "walking_to_desk" } },
    "openElevator",
    "startWalkingToDesk",
  ],
  on: {
    ARRIVED_AT_DESK: "idle",
  },
},
```

- [ ] **Step 3: Add SPAWN_WALK_TO_DESK global event**

```typescript
SPAWN_WALK_TO_DESK: {
  target: ".walking_to_desk_direct",
  actions: assign({
    agentId: ({ event }) => event.agentId,
    agentName: ({ event }) => event.name,
    desk: ({ event }) => event.desk,
    currentPosition: ({ event }) => event.position,
    targetPosition: ({ event }) => event.position,
  }),
},
```

- [ ] **Step 4: Run test, verify pass**
- [ ] **Step 5: Commit**

---

### Task 2: Accelerate arrival timing constants

**Files:**
- Modify: `frontend/src/systems/animationSystem.ts`
- Modify: `frontend/src/machines/agentMachine.ts`

- [ ] **Step 1: Reduce BUBBLE_DURATION_MS**

`animationSystem.ts`: `BUBBLE_DURATION_MS = 3000` → `1000`

- [ ] **Step 2: Reduce XState timeouts**

`agentMachine.ts`:
- arrival boss_speaks safety: `5000` → `1500`
- arrival agent_responds: `800` → `400`
- departure agent_speaks safety: `5000` → `1500`
- departure boss_responds safety: `5000` → `1500`

- [ ] **Step 3: Commit**

---

### Task 3: Handle SPAWN_WALK_TO_DESK in agentMachineService

**Files:**
- Modify: `frontend/src/machines/agentMachineService.ts`

- [ ] **Step 1: Add spawnWalkToDesk method**

```typescript
private spawnWalkToDesk(
  actor: ActorRefFrom<AgentMachine>,
  agentId: string,
  name: string | null,
  desk: number,
  initialPosition: Position,
): void {
  actor.send({
    type: "SPAWN_WALK_TO_DESK",
    agentId,
    name,
    desk,
    position: initialPosition,
  });
}
```

- [ ] **Step 2: Update spawnAgent to use it when boss is busy**

In `spawnAgent`, add a new branch:
```typescript
} else if (options?.walkToDeskDirect && desk) {
  this.spawnWalkToDesk(actor, agentId, name, desk, initialPosition);
} else if (options?.skipArrival && desk) {
```

- [ ] **Step 3: Commit**

---

### Task 4: useWebSocketEvents — route to correct spawn mode

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

- [ ] **Step 1: Determine spawn mode based on boss state**

When a new agent arrives with a desk:
- If boss is free (inUseBy === null) → normal SPAWN (full arrival with boss)
- If boss is busy → SPAWN_WALK_TO_DESK (skip queue, walk to desk)

```typescript
if (backendAgent.state === "arriving") {
  spawnPosition = getNextSpawnPosition();
  const bossIsBusy = store.boss.inUseBy !== null;
  if (backendAgent.desk && bossIsBusy) {
    walkToDeskDirect = true;
  }
} else if (backendAgent.desk) {
  // Non-arriving with desk — walk to desk from elevator
  spawnPosition = getNextSpawnPosition();
  walkToDeskDirect = true;
}
```

- [ ] **Step 2: Pass walkToDeskDirect to spawnAgent options**
- [ ] **Step 3: Commit**

---

### Task 5: Pending departure instead of forceRemove

**Files:**
- Modify: `frontend/src/stores/gameStore.ts`
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

- [ ] **Step 1: Add pendingDepartures to gameStore**

```typescript
// State
pendingDepartures: Set<string>;
// Action
addPendingDeparture: (agentId: string) => void;
removePendingDeparture: (agentId: string) => void;
```

- [ ] **Step 2: In useWebSocketEvents, mark pending instead of forceRemove**

When agent is removed from backend but phase is not idle AND phase is an arrival phase (arriving, in_arrival_queue, walking_to_ready, conversing, walking_to_boss, at_boss, walking_to_desk):
```typescript
store.addPendingDeparture(agentId);
// Don't forceRemove — let arrival complete
```

For other non-idle phases (departing, etc.) — keep forceRemove.

- [ ] **Step 3: Check pendingDepartures when agent reaches idle**

In the phase change handler (or in updateAgentPhase), when phase becomes "idle":
```typescript
if (store.pendingDepartures.has(agentId)) {
  store.removePendingDeparture(agentId);
  // Wait minimum 2 seconds before departure
  setTimeout(() => {
    agentMachineService.triggerDeparture(agentId);
  }, 2000);
}
```

- [ ] **Step 4: Commit**

---

### Task 6: Test end-to-end

- [ ] **Step 1: TypeScript compilation passes**
- [ ] **Step 2: Spawn 3 agents — first walks through full arrival, others walk directly to desk**
- [ ] **Step 3: All agents sit at desk, complete task, then departure animation plays**
- [ ] **Step 4: No agents stuck in queue**
- [ ] **Step 5: Tag v0.25.0**
