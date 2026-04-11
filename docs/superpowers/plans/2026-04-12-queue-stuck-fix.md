# Queue Stuck Fix — Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix arrival queue so multiple simultaneous agents flow through without getting stuck.

---

### Task 1: Fix joinQueue — default queueType to "arrival"

**Files:**
- Modify: `frontend/src/machines/agentMachineCommon.ts`

- [ ] **Step 1: Find joinQueue action**

Around line 286:
```typescript
joinQueue: ({ context }) => {
  if (context.queueType) {
    actions.onQueueJoined(context.agentId, context.queueType, context.queueIndex);
  }
}
```

- [ ] **Step 2: Default queueType to "arrival"**

```typescript
joinQueue: ({ context }) => {
  const queueType = context.queueType ?? "arrival";
  actions.onQueueJoined(context.agentId, queueType, context.queueIndex);
}
```

- [ ] **Step 3: Also set context.queueType in arriving entry**

In `agentMachine.ts`, the `arriving` state entry should set queueType:

```typescript
arriving: {
  entry: [
    { type: "notifyPhaseChange", params: { phase: "arriving" } },
    "setQueueTypeArrival",  // ← Already exists! Verify it sets context.queueType
    "openElevator",
    "startWalkingToQueue",
  ],
```

Check that `setQueueTypeArrival` actually sets `context.queueType = "arrival"`.

- [ ] **Step 4: Commit**

### Task 2: Fix removeAgent — re-index remaining queue agents

**Files:**
- Modify: `frontend/src/stores/gameStore.ts`

- [ ] **Step 1: Read current removeAgent (line 464-482)**

```typescript
removeAgent: (agentId) =>
  set((state) => {
    const newAgents = new Map(state.agents);
    newAgents.delete(agentId);
    const newArrivalQueue = state.arrivalQueue.filter((id) => id !== agentId);
    const newDepartureQueue = state.departureQueue.filter((id) => id !== agentId);
    return { agents: newAgents, arrivalQueue: newArrivalQueue, departureQueue: newDepartureQueue };
  }),
```

- [ ] **Step 2: Add queue index re-indexing (copy pattern from dequeueArrival)**

```typescript
removeAgent: (agentId) =>
  set((state) => {
    const newAgents = new Map(state.agents);
    newAgents.delete(agentId);

    const newArrivalQueue = state.arrivalQueue.filter((id) => id !== agentId);
    const newDepartureQueue = state.departureQueue.filter((id) => id !== agentId);

    // Re-index remaining agents in queues (like dequeueArrival does)
    newArrivalQueue.forEach((id, idx) => {
      const agent = newAgents.get(id);
      if (agent) newAgents.set(id, { ...agent, queueIndex: idx });
    });
    newDepartureQueue.forEach((id, idx) => {
      const agent = newAgents.get(id);
      if (agent) newAgents.set(id, { ...agent, queueIndex: idx });
    });

    return { agents: newAgents, arrivalQueue: newArrivalQueue, departureQueue: newDepartureQueue };
  }),
```

- [ ] **Step 3: Commit**

### Task 3: Verify

- [ ] **Step 1: TypeScript compilation**
- [ ] **Step 2: Spawn 5 subagents, verify all flow through queue**
- [ ] **Step 3: Commit + tag**
