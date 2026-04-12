# Parallel Boss Assignment — Spec

## Problem

Boss only processes one agent at a time (serial queue). With multiple agents arriving simultaneously, they queue up and wait. Since Claude Code subagent tasks complete in 3-5 seconds, agents get stuck in queue before reaching their desk.

## Current Architecture

```
Agent1 → queue → [wait boss free] → claim boss → conversing → walk to desk → release boss
Agent2 → queue → [BLOCKED waiting for Agent1 to release boss]
Agent3 → queue → [BLOCKED waiting for Agent2]
```

Three bottleneck points enforce serialization:
1. `checkQueueAdvancement`: returns early if `boss.inUseBy !== null`
2. `notifyBossAvailable`: only notifies `arrivalQueue[0]` (first agent)
3. `BOSS_AVAILABLE` guard: `isAtFrontOfQueue` requires `queueIndex === 0`

## Proposed Change: Parallel Boss

Boss can assign tasks to multiple agents simultaneously:

```
Agent1 → queue → boss available → conversing → walk to desk
Agent2 → queue → boss available → conversing → walk to desk  (parallel)
Agent3 → queue → boss available → conversing → walk to desk  (parallel)
```

### Changes needed:

1. **`checkQueueAdvancement`** (animationSystem.ts)
   - Remove `boss.inUseBy !== null` early return
   - Check ALL agents in queue (not just front), notify if any are waiting

2. **`notifyBossAvailable`** (agentMachineService.ts)
   - Remove `getReadyOccupant` check (blocks if ready position occupied)
   - Send `BOSS_AVAILABLE` to ALL agents in `in_arrival_queue`/`in_departure_queue` phase

3. **XState `BOSS_AVAILABLE` transition** (agentMachine.ts)
   - Remove `guard: "isAtFrontOfQueue"` — all agents can advance
   - Remove `actions: ["claimBoss"]` — no exclusive claiming needed
   - Keep `actions: ["leaveQueue"]`

4. **`claimBoss`/`releaseBoss`** — can be removed or made no-op since boss is no longer exclusive

### Visual concern: agents overlapping at boss position

All agents walk to the same "ready" position and then to boss. With parallel flow, they'll overlap. Two options:
- **Accept overlap** — agents briefly stack on boss area, then spread to desks
- **Skip ready/boss positions** — agents go directly from queue to desk (like SPAWN_WALK_TO_DESK)

### Risk analysis

- **Low risk**: Departure flow uses the same queue mechanism. Making it parallel means departing agents also don't wait for each other — which is fine.
- **Medium risk**: `claimBoss`/`releaseBoss` are used in the conversing state machine for bubble timing. Need to verify removing them doesn't break bubble display.
- **Low risk**: Queue indices become less meaningful since all agents advance simultaneously. `leaveQueue` still removes agent from arrivalQueue which is needed for cleanup.
