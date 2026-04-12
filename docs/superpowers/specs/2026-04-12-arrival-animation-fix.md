# Arrival Animation Fix — Spec

## Problem

Subagent tasks complete in 3-5 seconds, but the arrival animation takes 10-15 seconds. Agents get stuck in the arrival queue because they're removed by the backend before finishing the animation.

## Solution

### 1. First agent: accelerated full arrival (4s)

First agent to arrive goes through the full flow but faster:
- Bubble duration: 3000ms → 1000ms
- boss_speaks timeout: 5000ms → 1500ms
- agent_responds delay: 800ms → 400ms

### 2. Subsequent agents: skip queue, walk directly to desk (2s)

When boss is already occupied (inUseBy !== null), new agents skip the queue and walk directly from elevator to their desk. This is implemented via a new XState event `SPAWN_WALK_TO_DESK` that goes: elevator → walk to desk → idle.

### 3. Pending departure with minimum stay

When backend removes an agent still in arrival flow:
- Don't forceRemove — mark as `pendingDeparture`
- When agent reaches idle, wait minimum 2 seconds before triggering departure
- This ensures agents visually "sit at desk" briefly before leaving

### 4. Departure unchanged

Existing departure flow (queue → boss → elevator) stays the same.

## Files

1. `agentMachine.ts` — add `walking_to_desk_direct` state, accelerate timeouts
2. `agentMachineService.ts` — handle new spawn type
3. `animationSystem.ts` — reduce BUBBLE_DURATION_MS
4. `useWebSocketEvents.ts` — use SPAWN_WALK_TO_DESK when boss busy, pendingDeparture logic
5. `gameStore.ts` — add pendingDepartures Set, min stay tracking
