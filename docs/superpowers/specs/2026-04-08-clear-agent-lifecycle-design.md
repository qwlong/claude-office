# /clear Agent Lifecycle Design

## Problem

When the user runs `/clear` in Claude Code:

1. The conversation context is wiped, but **previously spawned agents may still be running** in the background
2. Claude Code loses references to those agents — it can no longer send `subagent_stop` events for them
3. Claude Office UI keeps showing these **orphaned agents** sitting at desks forever
4. The TODO whiteboard tasks also become stale (tied to the cleared session context)
5. There is no mechanism to merge two agents that are doing overlapping work

## Current Architecture

### Event Flow

```
Claude Code → Hooks (subagent_start/stop) → Backend API → StateMachine → WebSocket → Frontend
```

### Agent Lifecycle (Today)

| Event | Source | Effect |
|---|---|---|
| `subagent_start` | Claude Code hook | Agent created, assigned desk, ARRIVING state |
| `subagent_info` | Claude Code hook | Agent metadata updated (name, task) |
| `subagent_stop` | Claude Code hook | Agent moves to LEAVING → IN_ELEVATOR → removed |
| `/clear` | User command | **Nothing happens in Claude Office** |

### Key Files

- `backend/app/core/state_machine.py` — `StateMachine.agents` dict holds all agent state
- `backend/app/core/handlers/agent_handler.py` — handles `subagent_start` / `subagent_stop`
- `backend/app/core/handlers/conversation_handler.py` — handles `stop` event
- `backend/app/core/handlers/session_handler.py` — handles `session_start` / `session_end`
- `backend/app/core/event_processor.py` — routes events to handlers
- `backend/app/models/events.py` — `EventType` enum (no CLEAR event exists)
- `hooks/src/claude_office_hooks/main.py` — hook entry point
- `hooks/src/claude_office_hooks/event_mapper.py` — maps Claude events to internal events
- `backend/app/core/transcript_poller.py` — polls agent JSONL transcripts for updates
- `frontend/src/stores/gameStore.ts` — Zustand store with agent animation state

### Related: CONTEXT_COMPACTION

There is already a `CONTEXT_COMPACTION` event type. When triggered:
- Boss walks to trash can and jumps on it (animation)
- `context_utilization` resets to 0

This is **not the same as `/clear`** — context compaction happens automatically when the context window fills up. `/clear` is a user-initiated full reset.

## Proposed Solution

### Feature 1: Detect `/clear` and Clean Up Orphaned Agents

#### Option A: Hook-based detection (Recommended)

Claude Code fires a `session_start` hook when a new session begins after `/clear`. We can use this signal:

1. When `session_start` arrives for a session that already has agents in `StateMachine`:
   - Mark all existing agents as orphaned
   - Start a grace period (e.g., 10 seconds)
   - If no `subagent_info` or tool events arrive for an orphaned agent within the grace period, trigger `LEAVING` state for that agent
   - If events DO arrive (agent is still running), keep it

2. Add a new event type `CLEAR` or reuse `session_start` with a flag:
   ```python
   # In EventType enum
   CLEAR = "clear"
   ```

3. Backend handler:
   ```python
   async def handle_clear(sm: StateMachine, event: Event):
       orphaned = [a for a in sm.agents.values() if a.state == AgentState.WORKING]
       for agent in orphaned:
           # Check if agent's transcript is still being written to
           if not transcript_poller.is_active(agent.id):
               await trigger_agent_departure(sm, agent)
           else:
               agent.metadata["orphaned"] = True
               # Will be cleaned up by transcript poller timeout
   ```

#### Option B: Heartbeat-based detection

- Backend periodically checks if each agent's JSONL transcript is still being updated
- If no updates for N seconds, consider the agent dead
- Pro: Works even without explicit `/clear` event
- Con: Slower detection, false positives during long tool runs

#### Recommendation

**Use both A and B together:**
- Option A for immediate `/clear` detection (fast path)
- Option B as a fallback for agents that become orphaned for any reason (safety net)

### Feature 2: Agent Merge

Allow combining two agents doing overlapping work into one:

1. **Backend API endpoint:**
   ```
   POST /api/v1/agents/merge
   {
     "source_agent_id": "abc",
     "target_agent_id": "def",
     "merged_name": "Combined Research Agent"
   }
   ```

2. **State machine logic:**
   - Source agent enters LEAVING state (walks to elevator)
   - Target agent gets updated bubble: "Merged with {source_name}"
   - Source agent's task history appended to target
   - Source agent's whiteboard metrics (tool usage, file edits) merged into target

3. **Frontend animation:**
   - Source agent walks to target agent's desk
   - Brief "merge" animation (flash/glow)
   - Source agent walks to elevator and leaves
   - Target agent's bubble updates

4. **Trigger:** This would be invoked manually via the Claude Office UI (button/context menu) or via a backend API call.

### Feature 3: Manual Agent Cleanup (UI)

Add a "Clean up orphaned agents" button to the Claude Office UI:

- Shows in the header or right sidebar
- Clicking it sends all agents with no recent activity to LEAVING state
- Alternatively: right-click on an agent to dismiss it manually

## Implementation Plan

### Phase 1: `/clear` Detection & Orphan Cleanup

1. Add `CLEAR` event type to `backend/app/models/events.py`
2. Add `/clear` detection logic in `hooks/src/claude_office_hooks/main.py` or `event_mapper.py`
3. Add `handle_clear()` in a new or existing handler file
4. Add orphan detection grace period logic in `state_machine.py`
5. Add transcript activity check in `transcript_poller.py`

### Phase 2: Heartbeat Fallback

1. Add `last_activity_time` field to `Agent` model
2. Update `last_activity_time` on every agent-related event
3. Add periodic check (every 30s) in backend to detect stale agents
4. Auto-trigger departure for agents inactive > 60s with no active transcript

### Phase 3: Agent Merge

1. Add merge API endpoint
2. Add merge logic to `state_machine.py`
3. Add merge animation to frontend
4. Add UI trigger (context menu or button)

### Phase 4: Manual Cleanup UI

1. Add "Dismiss" option to agent context menu in frontend
2. Add "Clean up all" button to header/sidebar
3. Wire to backend API that triggers mass departure

## Open Questions

1. **Does Claude Code fire `session_start` after `/clear`?** Need to verify this experimentally.
2. **Should merged agents keep both desk positions or free one up?** Recommend freeing the source desk.
3. **Should orphan cleanup be automatic or require user confirmation?** Recommend automatic with a toast notification.
4. **What happens to tasks created by orphaned agents?** Recommend keeping them but marking as "orphaned" visually.
