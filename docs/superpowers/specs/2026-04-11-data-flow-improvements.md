# Data Flow Improvements Spec

## Context

After unifying the data source to `/ws/all` (v0.20.0), an audit identified 7 remaining issues in the data flow architecture. This spec covers all of them in priority order.

## 1. Project Key-Based Filtering (HIGH)

### Problem
`getFilteredSessionIds()` in `agentFilter.ts:42` matches sessions to projects using `project.name === session.projectName` (string comparison). If the project name derivation logic changes or paths are inconsistent, filtering silently breaks.

### Solution
Use `project.key` (slugified, unique) for matching instead of `project.name`.

**Backend change:** Add `projectKey` to session REST response and WebSocket session data. The backend already computes this in `project_registry.py`.

**Frontend change:**
- `SessionInfo` type gets `projectKey: string | null`
- `useSessions` populates `projectKey` from REST response
- `page.tsx` passes `projectKey` to `projectStore.setSessions()`
- `getFilteredSessionIds()` matches `session.projectKey === activeRoomKey` instead of `session.projectName === project.name`
- `OfficeGame.tsx` enrichedProjects/sessionRooms use `projectKey` for grouping

### Files
- Modify: `backend/app/api/routes/sessions.py` — add `projectKey` to `SessionSummary`
- Modify: `backend/app/core/event_processor.py` — lookup project key for session
- Modify: `frontend/src/hooks/useSessions.ts` — add `projectKey` to `Session` type
- Modify: `frontend/src/stores/projectStore.ts` — add `projectKey` to `SessionInfo`
- Modify: `frontend/src/utils/agentFilter.ts` — use key-based matching
- Modify: `frontend/src/components/game/OfficeGame.tsx` — use key-based grouping

## 2. Eliminate Redundant /ws/projects Agent Data (MEDIUM)

### Problem
`/ws/projects` sends `MultiProjectGameState` including full agent lists per project. But the frontend already rebuilds this from gameStore (`enrichedProjects` in `OfficeGame.tsx`). Agent data is sent twice over two WebSocket connections.

### Solution
Strip agent data from `/ws/projects` — only send project metadata (key, name, color, root, sessionCount). Frontend derives agent grouping from gameStore.

**Backend change:** Create a lightweight `ProjectMetadata` model without agents/boss. `get_project_grouped_state()` returns metadata-only.

**Frontend change:** `projectStore.projects` type changes to metadata-only. Remove `agents`, `boss`, `todos` from `ProjectGroup`. `enrichedProjects` in `OfficeGame.tsx` becomes the sole source for room agent data.

### Files
- Modify: `backend/app/models/projects.py` — new `ProjectMetadata` model
- Modify: `backend/app/core/event_processor.py` — `get_project_grouped_state()` returns metadata
- Modify: `frontend/src/types/projects.ts` — `ProjectGroup` becomes metadata-only
- Modify: `frontend/src/components/game/OfficeGame.tsx` — enrichedProjects builds full room data
- Modify: `frontend/src/contexts/RoomContext.tsx` — adapt to new type

## 3. Replace Session REST Polling with WebSocket Push (MEDIUM)

### Problem
`useSessions` polls `GET /api/v1/sessions` every 5 seconds. With multiple browser tabs, this creates unnecessary load.

### Solution
Push session list updates via `/ws/projects` WebSocket when sessions change (new session, session end, session deleted).

**Backend change:** In `broadcast_service.py`, after broadcasting state, also broadcast updated session list if sessions changed. Add a `sessions_update` message type.

**Frontend change:** `useProjectWebSocket` handles `sessions_update` messages. `useSessions` only does initial fetch on mount, no polling interval.

### Files
- Modify: `backend/app/core/broadcast_service.py` — broadcast session list
- Modify: `backend/app/api/routes/sessions.py` — extract session list builder
- Modify: `frontend/src/hooks/useProjectWebSocket.ts` — handle sessions_update
- Modify: `frontend/src/hooks/useSessions.ts` — remove polling interval

## 4. Filter Todos by Project/Session (MEDIUM)

### Problem
In project view, `OfficeRoom.tsx:205` shows `storeTodos` (all todos from all sessions) instead of filtering by the selected project's sessions.

### Solution
Apply sessionIds filtering to todos in project/session view.

### Files
- Modify: `frontend/src/components/game/OfficeRoom.tsx` — filter todos by sessionIds
- Modify: `frontend/src/hooks/useFilteredData.ts` — add `todos` to filtered output

## 5. Filter Git Status by Project/Session (MEDIUM)

### Problem
`SessionSidebar.tsx:92` shows `gitStatus` from gameStore which only reflects the last session's git state, not the selected project's.

### Solution
Store git status per sessionId in gameStore. Filter to show relevant session's git status in project/session view.

### Files
- Modify: `frontend/src/stores/gameStore.ts` — `gitStatus` becomes `Map<string, GitStatus>`
- Modify: `frontend/src/hooks/useWebSocketEvents.ts` — store git status per session
- Modify: `frontend/src/components/layout/SessionSidebar.tsx` — filter by sessionIds
- Modify: `frontend/src/hooks/useFilteredData.ts` — add `gitStatus` to filtered output

## 6. DRY Agent Type Conversion (LOW)

### Problem
`OfficeGame.tsx` has two identical `AgentAnimationState → Agent` conversion blocks (lines 91-102 and 178-189).

### Solution
Extract to `utils/agentConvert.ts`:
```typescript
export function animationStateToAgent(agent: AgentAnimationState): Agent
```

### Files
- Create: `frontend/src/utils/agentConvert.ts`
- Modify: `frontend/src/components/game/OfficeGame.tsx` — use utility

## 7. Expose Replay UI (LOW)

### Problem
gameStore has full replay infrastructure (`isReplaying`, `replaySpeed`, `replayEvents`, `setReplaying()`) but no UI to trigger it. The `GET /api/v1/sessions/{id}/replay` endpoint exists.

### Solution
Add a replay button to session cards in the sidebar. When clicked, fetch replay data and play back events with controllable speed.

### Files
- Create: `frontend/src/components/overlay/ReplayControls.tsx`
- Modify: `frontend/src/components/layout/SessionSidebar.tsx` — add replay button
- Modify: `frontend/src/app/page.tsx` — wire replay state

## Priority & Dependencies

```
1. Project key filtering     (no deps, fixes correctness)
2. Strip /ws/projects agents  (no deps, reduces complexity)
3. WebSocket session push     (after #2, shares /ws/projects channel)
4. Filter todos              (no deps, small change)
5. Filter git status         (no deps, moderate change)
6. DRY agent conversion      (after #2, cleanup)
7. Replay UI                 (independent, feature work)
```

Items 1-5 are bug fixes / correctness. Items 6-7 are cleanup / features.
