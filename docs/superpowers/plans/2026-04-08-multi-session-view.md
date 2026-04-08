# Multi-Session Office View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show agents from ALL active sessions simultaneously in one unified office, like pixel-agents-standalone does.

**Architecture:** Add a special `__all__` session mode. Backend gets a new `/ws/all` WebSocket endpoint that merges state from all active `StateMachine` instances. Frontend adds an "All Sessions" entry in the sidebar that connects to `/ws/all` and renders all agents together — each session's boss becomes a regular agent, and agent IDs are namespaced by session to avoid collisions.

**Tech Stack:** FastAPI (Python backend), Next.js/React/Zustand (frontend), WebSocket

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/app/main.py` | Add `/ws/all` WebSocket endpoint |
| Modify | `backend/app/api/websocket.py` | Add `broadcast_to_all_subscribers()` method |
| Modify | `backend/app/core/broadcast_service.py` | After each session broadcast, also push to `/ws/all` subscribers |
| Modify | `backend/app/core/event_processor.py` | Add `get_merged_state()` method |
| Modify | `backend/app/models/sessions.py` | Add `MultiSessionGameState` model |
| Modify | `frontend/src/hooks/useSessions.ts` | Inject "All Sessions" virtual entry |
| Modify | `frontend/src/hooks/useWebSocketEvents.ts` | Handle `__all__` sessionId → connect to `/ws/all` |
| Modify | `frontend/src/components/layout/SessionSidebar.tsx` | Render "All Sessions" entry with distinct styling |

---

### Task 1: Backend — MultiSessionGameState Model

**Files:**
- Modify: `backend/app/models/sessions.py`

- [ ] **Step 1: Add MultiSessionGameState class**

In `backend/app/models/sessions.py`, add after the `GameState` class:

```python
class MultiSessionGameState(BaseModel):
    """Merged state from all active sessions for the unified office view."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    session_id: str = "__all__"
    # In multi-session mode, the "boss" is synthetic (idle placeholder)
    boss: Boss
    # Agents from ALL sessions — boss from each session becomes a regular agent,
    # and all agent IDs are prefixed with "{session_id}:" to avoid collisions
    agents: list[Agent]
    office: OfficeState
    last_updated: datetime
    history: list[HistoryEntry] = Field(default_factory=lambda: cast(list[HistoryEntry], []))
    todos: list[TodoItem] = Field(default_factory=lambda: cast(list[TodoItem], []))
    arrival_queue: list[str] = Field(default_factory=lambda: cast(list[str], []))
    departure_queue: list[str] = Field(default_factory=lambda: cast(list[str], []))
    whiteboard_data: WhiteboardData = Field(default_factory=WhiteboardData)
    conversation: list[ConversationEntry] = Field(
        default_factory=lambda: cast(list[ConversationEntry], [])
    )
    # Extra: which sessions are represented
    active_session_ids: list[str] = Field(default_factory=lambda: cast(list[str], []))
```

Also add to `__all__` list: `"MultiSessionGameState"`.

- [ ] **Step 2: Commit**

```bash
git add backend/app/models/sessions.py
git commit -m "feat: add MultiSessionGameState model for unified office view"
```

---

### Task 2: Backend — EventProcessor.get_merged_state()

**Files:**
- Modify: `backend/app/core/event_processor.py`

- [ ] **Step 1: Add get_merged_state method to EventProcessor**

Add this method to the `EventProcessor` class (after `get_current_state`):

```python
async def get_merged_state(self) -> GameState | None:
    """Build a merged GameState from all active sessions.

    Each session's boss becomes a regular agent (prefixed with session ID).
    All agent IDs are namespaced as "{session_short}:{agent_id}" to avoid collisions.
    The merged state uses a synthetic idle boss.
    """
    if not self.sessions:
        return None

    all_agents: list[Agent] = []
    all_arrival_queue: list[str] = []
    all_departure_queue: list[str] = []
    total_desk_count = 0
    latest_updated = datetime.min.replace(tzinfo=UTC)
    all_todos: list[TodoItem] = []
    all_conversation: list[ConversationEntry] = []
    active_session_ids: list[str] = []

    for session_id, sm in self.sessions.items():
        state = sm.to_game_state(session_id)
        short_id = session_id[:8]
        active_session_ids.append(session_id)

        # Convert this session's boss into a regular agent
        boss_as_agent = Agent(
            id=f"{short_id}:boss",
            name=state.boss.current_task or short_id,
            state=AgentState(state.boss.state.value if hasattr(state.boss.state, 'value') else str(state.boss.state)),
            desk=total_desk_count + 1,
            current_task=state.boss.current_task,
            bubble=state.boss.bubble,
        )
        all_agents.append(boss_as_agent)

        # Namespace all agents from this session
        for agent in state.agents:
            namespaced = agent.model_copy(update={
                "id": f"{short_id}:{agent.id}",
                "desk": (agent.desk or 0) + total_desk_count + 1,
            })
            all_agents.append(namespaced)

        # Namespace queues
        for aid in state.arrival_queue:
            all_arrival_queue.append(f"{short_id}:{aid}")
        for aid in state.departure_queue:
            all_departure_queue.append(f"{short_id}:{aid}")

        total_desk_count += state.office.desk_count or 8

        if state.last_updated > latest_updated:
            latest_updated = state.last_updated

        all_todos.extend(state.todos)
        all_conversation.extend(state.conversation)

    # Synthetic boss for the merged view
    merged_boss = Boss(
        state=BossState.IDLE,
        current_task=f"{len(active_session_ids)} active sessions",
        bubble=None,
    )

    merged_office = OfficeState(
        desk_count=max(8, total_desk_count),
        elevator_state=ElevatorState.IDLE,
        phone_state=PhoneState.IDLE,
        context_utilization=0.0,
        tool_uses_since_compaction=0,
        print_report=False,
    )

    return GameState(
        session_id="__all__",
        boss=merged_boss,
        agents=all_agents,
        office=merged_office,
        last_updated=latest_updated,
        todos=all_todos,
        arrival_queue=all_arrival_queue,
        departure_queue=all_departure_queue,
        conversation=all_conversation,
    )
```

You'll need these imports at the top of event_processor.py (some may already exist):

```python
from app.models.agents import AgentState, BossState, ElevatorState, PhoneState, Agent, Boss, OfficeState
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/core/event_processor.py
git commit -m "feat: add get_merged_state() for multi-session aggregation"
```

---

### Task 3: Backend — /ws/all WebSocket Endpoint

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/websocket.py`
- Modify: `backend/app/core/broadcast_service.py`

- [ ] **Step 1: Add all-session subscriber tracking to ConnectionManager**

In `backend/app/api/websocket.py`, add a separate list for "all" subscribers:

```python
class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.all_session_connections: list[WebSocket] = []  # NEW
        self._lock = asyncio.Lock()

    async def connect_all(self, websocket: WebSocket) -> None:
        """Register a WebSocket that wants merged state from all sessions."""
        await websocket.accept()
        async with self._lock:
            self.all_session_connections.append(websocket)

    async def disconnect_all(self, websocket: WebSocket) -> None:
        """Remove an all-sessions WebSocket."""
        async with self._lock:
            if websocket in self.all_session_connections:
                self.all_session_connections.remove(websocket)

    async def broadcast_to_all_subscribers(self, message: dict[str, Any]) -> None:
        """Send a message to all /ws/all subscribers."""
        async with self._lock:
            connections = self.all_session_connections.copy()

        if not connections:
            return

        failed: list[WebSocket] = []
        for conn in connections:
            try:
                if conn.client_state == WebSocketState.CONNECTED:
                    await conn.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to all-subscriber: {e}")
                failed.append(conn)

        if failed:
            async with self._lock:
                for conn in failed:
                    if conn in self.all_session_connections:
                        self.all_session_connections.remove(conn)
```

- [ ] **Step 2: Add /ws/all endpoint to main.py**

In `backend/app/main.py`, add before the existing `/ws/{session_id}` endpoint:

```python
@app.websocket("/ws/all")
async def websocket_all_endpoint(websocket: WebSocket) -> None:
    """WebSocket that sends merged state from all active sessions."""
    await manager.connect_all(websocket)

    # Send initial merged state
    merged_state = await event_processor.get_merged_state()
    if merged_state:
        await manager.send_personal_message(
            {
                "type": "state_update",
                "timestamp": merged_state.last_updated.isoformat(),
                "state": merged_state.model_dump(mode="json", by_alias=True),
            },
            websocket,
        )

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect_all(websocket)
```

**IMPORTANT:** This endpoint MUST be defined before `/ws/{session_id}` because FastAPI matches routes in order, and `{session_id}` would match "all" as a literal string otherwise.

- [ ] **Step 3: Update broadcast_service to also push to all-subscribers**

In `backend/app/core/broadcast_service.py`, modify `broadcast_state()`:

```python
async def broadcast_state(session_id: str, sm: StateMachine) -> None:
    game_state: GameState = sm.to_game_state(session_id)
    await manager.broadcast(
        {
            "type": "state_update",
            "timestamp": game_state.last_updated.isoformat(),
            "state": game_state.model_dump(mode="json", by_alias=True),
        },
        session_id,
    )

    # Also notify all-session subscribers with merged state
    if manager.all_session_connections:
        from app.core.event_processor import event_processor

        merged = await event_processor.get_merged_state()
        if merged:
            await manager.broadcast_to_all_subscribers(
                {
                    "type": "state_update",
                    "timestamp": merged.last_updated.isoformat(),
                    "state": merged.model_dump(mode="json", by_alias=True),
                },
            )
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/app/api/websocket.py backend/app/core/broadcast_service.py
git commit -m "feat: add /ws/all endpoint for multi-session WebSocket"
```

---

### Task 4: Frontend — WebSocket Hook Multi-Session Support

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

- [ ] **Step 1: Update connect() to use /ws/all when sessionId is __all__**

In `useWebSocketEvents.ts`, change the `connect` callback's URL construction (around line 424):

```typescript
// Replace this line:
const wsUrl = `ws://localhost:8000/ws/${sessionId}`;

// With:
const wsUrl = sessionId === "__all__"
  ? "ws://localhost:8000/ws/all"
  : `ws://localhost:8000/ws/${sessionId}`;
```

- [ ] **Step 2: Relax session ID validation for __all__ mode**

In `handleStateUpdate` (around line 73), change the session mismatch guard:

```typescript
// Replace:
if (state.sessionId !== currentSessionIdRef.current) {
  return;
}

// With:
if (
  currentSessionIdRef.current !== "__all__" &&
  state.sessionId !== currentSessionIdRef.current
) {
  return;
}
```

And in `handleMessage` (around line 290-296), apply the same relaxation:

```typescript
// Replace:
if (
  message.type !== "session_deleted" &&
  message.type !== "reload" &&
  message.state?.sessionId &&
  message.state.sessionId !== currentSessionIdRef.current
) {
  return;
}

// With:
if (
  message.type !== "session_deleted" &&
  message.type !== "reload" &&
  currentSessionIdRef.current !== "__all__" &&
  message.state?.sessionId &&
  message.state.sessionId !== currentSessionIdRef.current
) {
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useWebSocketEvents.ts
git commit -m "feat: support __all__ session mode in WebSocket hook"
```

---

### Task 5: Frontend — Session List "All Sessions" Entry

**Files:**
- Modify: `frontend/src/hooks/useSessions.ts`
- Modify: `frontend/src/components/layout/SessionSidebar.tsx`

- [ ] **Step 1: Inject "All Sessions" virtual entry in useSessions**

In `frontend/src/hooks/useSessions.ts`, after fetching sessions in `fetchSessions`, inject a virtual entry. Modify the `fetchSessions` callback:

```typescript
const fetchSessions = useCallback(async (): Promise<Session[] | null> => {
  setSessionsLoading(true);
  try {
    const res = await fetch("http://localhost:8000/api/v1/sessions");
    if (res.ok) {
      const data = (await res.json()) as Session[];
      // Inject "All Sessions" virtual entry at the top
      const allEntry: Session = {
        id: "__all__",
        label: "All Sessions",
        projectName: "All Sessions",
        projectRoot: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "active",
        eventCount: data.reduce((sum, s) => sum + s.eventCount, 0),
      };
      const withAll = [allEntry, ...data];
      setSessions(withAll);
      return withAll;
    }
  } catch {
    // Silently fail
  } finally {
    setSessionsLoading(false);
  }
  return null;
}, []);
```

- [ ] **Step 2: Skip auto-follow for __all__ mode**

In the auto-follow effect (around line 157), add a guard:

```typescript
// At the top of the auto-follow useEffect:
if (!autoFollowNewSessions || sessions.length === 0) return;
if (sessionId === "__all__") return; // Don't auto-follow away from all-sessions view
```

- [ ] **Step 3: Style the "All Sessions" entry distinctly in sidebar**

In `frontend/src/components/layout/SessionSidebar.tsx`, in the session map (around line 149), add special rendering for `__all__`:

```typescript
{sessions.map((session) => {
  const isActive = session.id === sessionId;
  const isAllSessions = session.id === "__all__";
  const isLive = session.status === "active";
  return (
    <div
      role="button"
      tabIndex={0}
      key={session.id}
      className={`group relative w-full px-3 py-2.5 text-left transition-colors cursor-pointer rounded-md ${
        isAllSessions
          ? isActive
            ? "bg-amber-500/20 border-l-2 border-amber-500"
            : "bg-slate-800/30 hover:bg-amber-500/10 border-l-2 border-amber-500/30"
          : isActive
            ? "bg-purple-500/20 border-l-2 border-purple-500"
            : "hover:bg-slate-800/50"
      }`}
      onClick={() => onSessionSelect(session.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSessionSelect(session.id);
        }
      }}
    >
      {/* ... existing content, but hide delete button for __all__ */}
```

For the delete button, add: `{!isAllSessions && (<button ...>)}`.

For the icon, use a special one for all-sessions:

```typescript
import { Users } from "lucide-react";

// In the icon section:
{isAllSessions ? (
  <Users size={10} className="text-amber-400 flex-shrink-0" />
) : isLive ? (
  <Radio ... />
) : (
  <PlayCircle ... />
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useSessions.ts frontend/src/components/layout/SessionSidebar.tsx
git commit -m "feat: add 'All Sessions' entry in sidebar for multi-session view"
```

---

### Task 6: Frontend — Session Switch Handler for __all__

**Files:**
- Modify: `frontend/src/hooks/useSessionSwitch.ts`

- [ ] **Step 1: Read useSessionSwitch.ts**

Read the file to understand the current `handleSessionSelect` logic.

- [ ] **Step 2: Ensure session switch works for __all__**

The `handleSessionSelect` function in `useSessionSwitch.ts` calls `agentMachineService.reset()` and `resetForSessionSwitch()`. This should work as-is for `__all__`, but verify that `setSessionId("__all__")` correctly triggers the WebSocket reconnection in `useWebSocketEvents`.

No code changes expected here — just verify the flow:
1. User clicks "All Sessions" → `handleSessionSelect("__all__")`
2. Store resets, sessionId becomes `"__all__"`
3. `useWebSocketEvents` detects sessionId change → reconnects to `ws://localhost:8000/ws/all`
4. Backend sends merged state → frontend renders all agents

- [ ] **Step 3: Commit (only if changes were needed)**

---

### Task 7: Integration Test

**Files:** None (manual testing)

- [ ] **Step 1: Start the backend**

```bash
cd /Users/apple/Projects/others/random/claude-office && make dev-tmux
```

- [ ] **Step 2: Open browser at localhost:3000**

Verify:
1. "All Sessions" appears at the top of the sessions list with amber/gold styling
2. Clicking it shows agents from all active sessions in one office
3. Each session's boss appears as a regular agent at a desk
4. Clicking a specific session still works (single-session view)
5. Switching back to "All Sessions" shows the merged view again

- [ ] **Step 3: Run linting/type checks**

```bash
cd /Users/apple/Projects/others/random/claude-office && make checkall
```

- [ ] **Step 4: Fix any issues found, commit**

```bash
git add -A
git commit -m "fix: address integration issues for multi-session view"
```

---

### Task 8: Push and Create PR

- [ ] **Step 1: Push feature branch to fork**

```bash
git push myfork feat/multi-session-view
```

- [ ] **Step 2: Create PR against upstream**

```bash
gh pr create --repo paulrobello/claude-office \
  --head qwlong:feat/multi-session-view \
  --title "feat: unified multi-session office view" \
  --body "$(cat <<'EOF'
## Summary
- Add "All Sessions" mode that shows agents from ALL active sessions in one office
- Each session's boss becomes a regular agent; agent IDs namespaced to avoid collisions
- New `/ws/all` WebSocket endpoint aggregates state from all StateMachine instances
- Amber-styled "All Sessions" entry at top of sidebar

## Motivation
In multi-agent parallel development, users want to see all their agents working
simultaneously in one office view, similar to how pixel-agents-standalone works.

## Test plan
- [ ] Click "All Sessions" in sidebar — all agents from all sessions appear
- [ ] Click a specific session — shows only that session's agents
- [ ] Start a new Claude Code session — agent appears in "All Sessions" view
- [ ] `make checkall` passes
EOF
)"
```
