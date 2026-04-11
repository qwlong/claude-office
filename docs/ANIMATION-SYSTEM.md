# Claude Office — Animation System Deep Dive

Developer reference for the agent animation lifecycle, queue system, and known issues.

## 1. Architecture Overview

```
Backend events (hooks)
  → useWebSocketEvents (WebSocket handler)
    → gameStore (state: agents, queues, boss)
    → agentMachineService (XState actors per agent)
      → animationSystem (60fps tick loop)
        → PixiJS rendering (OfficeRoom)
```

Three systems coordinate agent animation:
- **gameStore** (Zustand) — holds agent positions, phases, queue membership, boss state
- **agentMachineService** (XState) — per-agent state machines managing the arrival/departure choreography
- **animationSystem** — 60fps tick loop that interpolates positions, times bubbles, and triggers queue advancement

## 2. Agent Lifecycle

### 2.1 Arrival Flow

```
Backend: subagent_start event
  → useWebSocketEvents detects new agent ID not in gameStore
  → Determines spawn position (elevator interior)
  → gameStore.addAgent(agent, elevatorPosition, sessionId)
  → agentMachineService.spawnAgent(id, name, desk, position, options)
    → XState machine created, starts in arrival flow
```

**XState arrival states:**

```
arriving
  → Walk from elevator to arrival queue (back of line)
  → Entry: openElevator, startWalkingToQueue

in_arrival_queue
  → Wait for BOSS_AVAILABLE event
  → Guard: isAtFrontOfQueue (queueIndex === 0)
  → Actions on transition: claimBoss, leaveQueue

walking_to_ready
  → Walk to ready position A0 (x:480, y:930)

conversing
  → boss_speaks: Show boss welcome bubble → wait BUBBLE_DISPLAYED
  → agent_responds: Show agent response → 800ms delay
  → done: onDone → walking_to_boss

walking_to_boss
  → Walk to boss desk position

at_boss
  → Pause 100ms (BOSS_PAUSE)
  → → walking_to_desk

walking_to_desk
  → Entry: releaseBoss ← Boss freed here!
  → Walk to assigned desk position
  → ARRIVED_AT_DESK → idle
```

### 2.2 Idle (Working)

```
idle
  → Agent sits at desk
  → Typing animation toggles via setAgentTyping
  → Bubbles show tool calls
  → Waits for REMOVE event (backend removes agent)
```

### 2.3 Departure Flow

```
Backend: agent removed from state_update
  → useWebSocketEvents detects agentId not in backendAgentIds
  → If agent.phase === "idle": triggerDeparture(agentId)
  → If agent.phase !== "idle": forceRemove(agentId)
```

**XState departure states:**

```
departing
  → Walk to departure queue (back of line)

in_departure_queue
  → Wait for BOSS_AVAILABLE
  → Guard: isAtFrontOfQueue
  → Actions: claimBoss, leaveQueue

walking_to_ready
  → Walk to ready position D0 (x:800, y:930)

conversing
  → agent_speaks: Show completion bubble → wait BUBBLE_DISPLAYED
  → boss_responds: Show acknowledgment → wait BUBBLE_DISPLAYED
  → done: onDone → walking_to_boss

walking_to_boss
  → Walk to boss desk (right side)

at_boss
  → Pause 100ms
  → → walking_to_elevator

walking_to_elevator
  → Entry: releaseBoss ← Boss freed here!
  → Walk to elevator
  → Open elevator doors

in_elevator
  → Pause 500ms inside elevator

waiting_for_door_close
  → Close elevator doors

elevator_closing
  → Wait 520ms for door animation

removed (FINAL)
  → gameStore.removeAgent(agentId)
  → agentMachineService cleanup
```

## 3. Boss Occupancy System

**The boss can only serve one agent at a time.**

```
gameStore.boss.inUseBy: "arrival" | "departure" | null
```

### Claim/Release cycle:

```
1. Agent at front of queue (queueIndex === 0)
2. animationSystem.checkQueueAdvancement() fires
3. Checks: boss.inUseBy === null?
   → No: skip, wait for next tick
   → Yes: agentMachineService.notifyBossAvailable()
4. XState receives BOSS_AVAILABLE event
5. Guard: isAtFrontOfQueue? 
   → Yes: transition to walking_to_ready
   → Actions: claimBoss (setBossInUse("arrival")), leaveQueue
6. Agent goes through conversing → walking_to_boss → at_boss → walking_to_desk
7. Entry of walking_to_desk: releaseBoss (setBossInUse(null))
8. Next tick: checkQueueAdvancement sees boss is free, triggers next agent
```

### Priority: **Arrival queue > Departure queue**

animationSystem checks arrival queue first (line 388). Only checks departure if arrival is empty.

## 4. Animation System — Tick Loop

**`animationSystem.ts` runs at 60fps via requestAnimationFrame**

Each tick does three things:

### 4.1 updateAgentPositions (position interpolation)
- Speed: **200 pixels/second**
- Follows waypoints calculated by pathfinding
- Linear interpolation along path segments
- On arrival at final waypoint: triggers `handleArrival()` → sends event to XState machine (ARRIVED_AT_QUEUE, ARRIVED_AT_DESK, etc.)

### 4.2 updateBubbleTimers (bubble lifecycle)
- Display duration: **3000ms** per bubble
- Checks elapsed time, advances to next queued bubble
- Persistent bubbles stay until next bubble arrives
- Notifies XState via `notifyBubbleComplete()` (for BUBBLE_DISPLAYED transitions)

### 4.3 checkQueueAdvancement (queue state machine triggers)
- If `boss.inUseBy !== null`: skip (boss busy)
- Check arrival queue front agent: phase=in_arrival_queue, queueIndex=0, path=null → notify
- Check departure queue front agent: same conditions → notify

## 5. Queue Positions

### Arrival Queue (left side)
```
A0 (ready):  x:480, y:930   ← Right of plant, left of boss
A1:          x:330, y:930
A2:          x:190, y:930
A3:          x:70,  y:820   ← Turn upward
A4-A7:       x:70,  y:710-380 (110px vertical spacing)
```

### Departure Queue (right side)
```
D0 (ready):  x:800, y:930   ← Right of boss
D1:          x:950, y:930
D2:          x:1090, y:930
D3:          x:1210, y:930  ← Turn upward
D4-D7:       x:1210, y:820-490 (110px vertical spacing)
```

### Elevator Spawn Positions (2x3 grid inside elevator)
```
(56,190)  (116,190)   ← Top
(56,240)  (116,240)   ← Middle
(56,290)  (116,290)   ← Bottom
```

## 6. Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| Movement speed | 200 px/s | animationSystem.ts:26 |
| Bubble duration | 3000 ms | animationSystem.ts:27 |
| Boss pause | 100 ms | agentMachine.ts delays |
| Elevator pause | 500 ms | agentMachine.ts delays |
| Door close delay | 520 ms | agentMachine.ts delays |
| Min typing duration | 500 ms | useWebSocketEvents.ts:55 |
| Conversation step delay | 800 ms | agentMachine.ts arrival conversing |
| Queue overflow spacing | 110 px vertical | queuePositions.ts |

## 7. Known Issues

### 7.1 Boss Occupancy Deadlock (CRITICAL)

**Symptom:** Agents stuck in arrival/departure queue, never advance to boss.

**Root cause:** Boss `inUseBy` is set but never cleared. This happens when:

1. Agent claims boss (`claimBoss` → `setBossInUse("arrival")`)
2. Agent's XState machine gets stuck in `conversing` state waiting for `BUBBLE_DISPLAYED`
3. `BUBBLE_DISPLAYED` is sent by animationSystem when bubble timer expires (3000ms)
4. But if bubble is never displayed (e.g., component not mounted, agent not rendered), event never fires
5. Boss stays claimed forever → all other agents blocked

**Specific scenarios:**
- Agent claims boss but gets `forceRemoved` before reaching `walking_to_desk`/`walking_to_elevator` where `releaseBoss` is called
- Rapid agent arrival/departure where one agent's departure conversation overlaps another's arrival
- Page visibility hidden → `requestAnimationFrame` pauses → bubble timers don't fire → `BUBBLE_DISPLAYED` never sent

**Fix ideas:**
- Add timeout to conversing state (force-advance after 5s even without bubble event)
- Release boss on forceRemove
- Add safety watchdog in animationSystem that clears `inUseBy` if stuck for >10s

### 7.2 Agent Not Walking to Desk After Spawn

**Symptom:** Agent appears near elevator but stays there, doesn't walk to desk.

**Root cause:** Agent's XState machine is in `arriving` state, waiting for path completion, but pathfinding returns no valid path or path completion event is missed.

**Scenarios:**
- Desk position is outside navigable area
- Agent spawns at a position where pathfinding can't find a route to queue
- `handleArrival()` fires but XState actor has already been stopped

### 7.3 Ghost Agents After Reconnection

**Symptom:** After page refresh or WebSocket reconnect, old agents remain visible alongside newly spawned agents.

**Root cause:** `processedAgentsRef` is cleared on reconnect (line 530 useWebSocketEvents), but gameStore agents from the previous connection may still be in the Map if `resetForSessionSwitch` is not called (we removed it in the unified data source refactor).

**Fix idea:** On reconnect, diff existing gameStore agents against the first state_update received. Remove any agents not present in the backend state.

### 7.4 Departure Not Triggered for Completed Agents

**Symptom:** Agent finishes task but stays at desk instead of walking to elevator.

**Root cause:** In useWebSocketEvents line 207-222, departure is only triggered when `backendAgentIds` no longer contains the agent. But backend may keep the agent in `departed_agents` for 60 seconds (DEPARTED_TTL in state_machine.py). During this window, the agent appears in both `state.agents` and frontend, so departure is never triggered.

**Fix idea:** Check agent state from backend — if `agent.state === "completed"` or `"leaving"`, trigger departure even if agent is still in the list.

### 7.5 Multiple Agents Stuck in Queue

**Symptom:** 3+ agents all in arrival queue, only first one advances (or none).

**Root cause:** Combination of 7.1 (boss deadlock) and queue advancement logic. `checkQueueAdvancement` only triggers one agent per tick (returns after first match). If the front agent's conditions aren't met (wrong phase, still has path), no other agent can advance.

**Fix idea:** If front agent is stuck (not in expected phase for >5s), skip it and advance the next eligible agent.

## 8. File Map

| File | Purpose | Lines |
|------|---------|-------|
| `machines/agentMachine.ts` | XState machine definition (arrival + departure states) | ~450 |
| `machines/agentMachineService.ts` | Singleton managing all agent actors | ~600 |
| `machines/agentMachineCommon.ts` | Shared actions and guards | ~400 |
| `machines/agentArrivalMachine.ts` | Arrival-specific machine (alternative impl) | ~200 |
| `machines/agentDepartureMachine.ts` | Departure-specific machine (alternative impl) | ~200 |
| `machines/queueManager.ts` | Queue slot reservation and ready position tracking | ~220 |
| `systems/animationSystem.ts` | 60fps tick loop (positions, bubbles, queues) | ~450 |
| `systems/queuePositions.ts` | Queue/desk/elevator position constants | ~270 |
| `systems/compactionAnimation.ts` | Boss compaction (trash can) animation | ~150 |
| `hooks/useWebSocketEvents.ts` | Agent spawn/remove from backend events | ~620 |
| `stores/gameStore.ts` | Central state (agents, queues, boss, office) | ~1300 |
