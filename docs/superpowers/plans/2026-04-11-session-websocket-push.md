# Replace Session REST Polling with WebSocket Push — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 5-second REST polling of `/api/v1/sessions` with WebSocket push via `/ws/projects`, reducing unnecessary network calls.

**Architecture:** Backend broadcasts session list changes via `/ws/projects` as `sessions_update` messages when sessions change (new, end, delete). Frontend `useSessions` does one initial fetch on mount, then receives updates via `useProjectWebSocket`.

**Tech Stack:** FastAPI, WebSocket, TypeScript/React, Zustand

---

### Task 1: Backend — broadcast session list on changes

**Files:**
- Modify: `backend/app/core/broadcast_service.py` — add `broadcast_sessions_update()`
- Modify: `backend/app/api/routes/sessions.py` — extract session list builder to reusable function

- [ ] **Step 1: Extract session list builder from list_sessions endpoint**

Create `async def build_session_list(db) -> list[SessionSummary]` that can be called from both the REST endpoint and the broadcast function.

- [ ] **Step 2: Add broadcast_sessions_update to broadcast_service**

```python
async def broadcast_sessions_update() -> None:
    if not manager.project_connections:
        return
    async with AsyncSessionLocal() as db:
        sessions = await build_session_list(db)
    await manager.broadcast_to_project_subscribers({
        "type": "sessions_update",
        "data": sessions,
    })
```

- [ ] **Step 3: Call broadcast_sessions_update after session changes**

In `event_processor.process_event()`, after `session_start` and `session_end` events, call `broadcast_sessions_update()`.

In `sessions.py` `delete_session` endpoint, call it after deletion.

- [ ] **Step 4: Commit**

---

### Task 2: Frontend — receive session updates via WebSocket

**Files:**
- Modify: `frontend/src/hooks/useProjectWebSocket.ts` — handle `sessions_update` message
- Modify: `frontend/src/hooks/useSessions.ts` — remove polling interval, add update callback

- [ ] **Step 1: Add sessions update handler to useProjectWebSocket**

```typescript
// In ws.onmessage handler:
if (msg.type === "sessions_update" && msg.data) {
  updateSessions(msg.data as Session[]);
}
```

- [ ] **Step 2: Remove polling interval from useSessions**

Remove `setInterval(fetchSessions, 5000)` from the effect. Keep the initial `fetchSessions()` call on mount.

- [ ] **Step 3: Expose updateSessions callback for WebSocket handler**

Wire the sessions update from `useProjectWebSocket` into `useSessions` state.

- [ ] **Step 4: Verify — sessions list updates when new session starts**
- [ ] **Step 5: Commit**
