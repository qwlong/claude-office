# Queue Stuck Fix — Spec

## Problem

When multiple subagents spawn simultaneously, only the first one completes the arrival flow. The rest get stuck in the arrival queue forever.

## Root Cause (2 bugs)

### Bug 1: joinQueue skipped because context.queueType is null

When an agent spawns with `state === "arriving"`, `useWebSocketEvents` calls `spawnAgent` with `queueType: undefined`. The XState machine context gets `queueType: null`. When the machine enters `in_queue` state, the `joinQueue` action checks `if (context.queueType)` — it's null, so the action does nothing. The agent is never added to `store.arrivalQueue`.

Consequence: agent appears in the queue visually (XState phase is `in_arrival_queue`) but is invisible to the queue management system.

**Fix:** In `joinQueue` action, default `queueType` to `"arrival"` when null. Or set `context.queueType = "arrival"` in the `arriving` entry action.

### Bug 2: removeAgent doesn't update remaining agents' queueIndex

`gameStore.removeAgent()` filters the agent from `arrivalQueue`/`departureQueue` arrays but does NOT update the remaining agents' `queueIndex` values in `store.agents`. Compare with `dequeueArrival()` which correctly re-indexes.

Consequence: after an agent is removed, the next agent in queue has `queueIndex: 1` (not 0). `checkQueueAdvancement` requires `queueIndex === 0`, so no agent ever advances.

**Fix:** After filtering the queue, re-index remaining agents like `dequeueArrival` does.

## Files to Change

1. `frontend/src/machines/agentMachineCommon.ts` — `joinQueue` action: default queueType to "arrival"
2. `frontend/src/stores/gameStore.ts` — `removeAgent`: re-index remaining queue agents
