# Filter Todos & Git Status by Project — Implementation Plan v2

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos show which project they belong to. Git status shows the correct branch when viewing a specific project.

**Architecture:**
- Backend: Add `session_id` field to TodoItem. In `get_merged_state`, stamp each todo with its session_id.
- Frontend: gameStore stores todos with sessionId. `useFilteredData` filters todos by sessionIds. OfficeRoom uses filtered todos.
- Git status: Store per-session in gameStore. `useFilteredData` returns the relevant session's git status.

---

### Task 1: Backend — add session_id to TodoItem

**Files:**
- Modify: `backend/app/models/common.py` — add `session_id` to TodoItem
- Modify: `backend/app/core/event_processor.py` — stamp session_id on todos in get_merged_state

### Task 2: Frontend — store and filter todos by sessionId

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts` — todos already come with sessionId from backend
- Modify: `frontend/src/hooks/useFilteredData.ts` — add filtered todos
- Modify: `frontend/src/components/game/OfficeRoom.tsx` — use filtered todos in project view

### Task 3: Frontend — store git status per session, filter by project

**Files:**
- Modify: `frontend/src/stores/gameStore.ts` — gitStatusMap: Map<string, GitStatus>
- Modify: `frontend/src/hooks/useWebSocketEvents.ts` — store git per session
- Modify: `frontend/src/hooks/useFilteredData.ts` — add filtered gitStatus
- Modify: `frontend/src/components/game/GitStatusPanel.tsx` — use filtered
- Modify: `backend/app/core/broadcast_service.py` — broadcast git_status to __all__ subscribers too
