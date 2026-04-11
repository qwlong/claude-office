# Claude Office Visualizer — Data Flow & Filtering Reference

Developer reference for debugging agent display, filtering, and data source issues.

## 1. Event Source: Claude Code Hooks

Claude Code hooks fire lifecycle events during operation. These are configured in `hooks/` and POST JSON to the backend.

```
Claude Code session
  ├── session_start      → POST /api/v1/events
  ├── pre_tool_use       → POST /api/v1/events
  ├── post_tool_use      → POST /api/v1/events
  ├── subagent_spawn     → POST /api/v1/events
  ├── subagent_complete   → POST /api/v1/events
  ├── context_compaction → POST /api/v1/events
  └── session_end        → POST /api/v1/events
```

Each event includes:
- `session_id` — unique per Claude Code session
- `event_type` — one of the types above
- `data` — event-specific payload (tool name, agent id, etc.)

## 2. Backend: Event Processing

### Entry point

`backend/app/api/routes/events.py` → `event_processor.process_event(event)`

### State Machine (per session)

Each session gets a `StateMachine` instance (`backend/app/core/state_machine.py`):
- `self.agents: dict[str, Agent]` — active subagents
- `self.boss: Boss` — main Claude agent state
- `self.office: OfficeState` — desk count, elevator, context utilization
- `to_game_state(session_id) → GameState` — snapshot of current state

### Project Registry

`backend/app/core/project_registry.py` manages the session → project mapping:
- `session_id` → `project_name` (derived from `project_root` path or explicitly set)
- `project_name` → `ProjectInfo(key, name, color, root, session_ids)`
- Registration happens on `session_start` event

### Session → Project linkage

```
session_start event
  → data.project_root = "/Users/foo/Projects/myapp"
  → derive_project_name_from_path() → "Projects-foo-myapp"
  → project_registry.register_session(session_id, project_name, project_root)
  → project.key = slugify(project_name) = "projects-foo-myapp"
```

## 3. WebSocket Endpoints

### `/ws/{session_id}` — Single session

- Sends `GameState` for one session
- `state.sessionId` = the session's actual ID
- `state.agents` = only that session's subagents
- `state.boss` = that session's boss
- Not used in unified data source mode

### `/ws/all` — All sessions merged (PRIMARY)

- Sends merged `GameState` from all active sessions
- `state.sessionId` = `"__all__"`
- `state.agents` includes ALL agents from ALL sessions, each with:
  - `agent.id` namespaced as `"{session_short}:{agent_id}"`
  - `agent.sessionId` = the original session ID
  - `agent.agentType` = `"main"` for boss-as-agent, `"subagent"` for subagents
- `state.bosses` = top 3 most active bosses (with `sessionId`, `projectKey`, `projectColor`)
- Built by `event_processor.get_merged_state()`

### `/ws/projects` — Project metadata

- Sends `MultiProjectGameState` grouped by project
- Each `ProjectGroup` has: `key`, `name`, `color`, `agents[]`, `boss`, `sessionCount`
- Used for project sidebar metadata (names, colors, session counts)
- Agent data here may be stale — prefer gameStore data from `/ws/all`
- Built by `event_processor.get_project_grouped_state()`

### Broadcast flow

When any session state changes:
```
event_processor.process_event()
  → broadcast_state(session_id, sm)
    → /ws/{session_id}  — that session's clients
    → /ws/all           — merged state to all-session subscribers
    → /ws/projects      — project-grouped state to project subscribers
```

## 4. Frontend: Data Stores

### gameStore (Zustand) — Agent animation state

**Source:** `/ws/all` via `useWebSocketEvents({ sessionId: "__all__" })`

```typescript
interface GameStore {
  agents: Map<string, AgentAnimationState>  // ALL agents from ALL sessions
  boss: BossAnimationState                   // First boss from merged state
  bosses: Map<string, BossAnimationState>    // All bosses keyed by sessionId
  sessionId: string                          // "__all__"
  eventLog: EventLogEntry[]                  // All events
  conversation: ConversationEntry[]          // All conversation history
  // ... office state, todos, etc.
}
```

Key: each `AgentAnimationState` has `sessionId: string | null` set to the original session ID.

### projectStore (Zustand) — Project metadata

**Source:** `/ws/projects` via `useProjectWebSocket()`

```typescript
interface ProjectStore {
  viewMode: ViewMode              // "office" | "projects" | "project" | "sessions" | "session"
  activeRoomKey: string | null    // Selected project key or session ID
  projects: ProjectGroup[]        // From /ws/projects
  sessions: SessionInfo[]         // From useSessions() REST polling
}
```

### Data source per store

| Store | WebSocket | Data |
|-------|-----------|------|
| gameStore | `/ws/all` | All agents, bosses, events, conversation (with sessionId) |
| projectStore | `/ws/projects` | Project grouping metadata (names, colors, counts) |
| projectStore.sessions | REST `/api/v1/sessions` (polled 5s) | Session list with event counts |

## 5. View Modes & Filtering

### Filter pipeline

```
viewMode + activeRoomKey
  → getFilteredSessionIds() → Set<string> | null
  → filter gameStore.agents by sessionIds
  → filter gameStore.bosses by sessionIds
  → filter gameStore.eventLog by sessionIds
  → filter gameStore.conversation by sessionIds
```

### `getFilteredSessionIds()` (agentFilter.ts)

| viewMode | activeRoomKey | Returns | Meaning |
|----------|---------------|---------|---------|
| `"office"` | — | `null` | No filter, show all |
| `"projects"` | — | `null` | No filter, show all |
| `"sessions"` | — | `null` | No filter, show all |
| `"project"` | project key | `Set<sessionId>` | All sessions in that project |
| `"session"` | session ID | `Set<sessionId>` | Just that one session |

**Project → sessions lookup:** Matches `project.name === session.projectName` from the sessions list.

### Per-view rendering

#### `"office"` — Whole Office

```
Rendering:  Single OfficeRoom (full animation)
Agents:     gameStore.agents (all, unfiltered)
Boss:       gameStore.boss + gameStore.bosses (multi-boss display)
Animation:  ✅ Enabled
Canvas:     Full size, dynamic desk count
```

#### `"projects"` — All Projects Grid

```
Rendering:  MultiRoomCanvas → multiple mini OfficeRoom
Agents:     enrichedProjects (gameStore agents grouped by project)
Boss:       Per-room from project data
Animation:  ❌ Disabled (static poses)
Canvas:     Grid layout, ROOM_SCALE=0.35
```

#### `"project"` — Single Project Zoom

```
Rendering:  Single OfficeRoom (full animation)
Agents:     gameStore.agents filtered by project's sessionIds
Boss:       filteredBoss from useFilteredData (scoped to project)
Animation:  ✅ Enabled
Canvas:     Full size
Panel:      AgentStatus/EventLog/Conversation filtered by sessionIds
```

#### `"sessions"` — All Sessions Grid

```
Rendering:  MultiRoomCanvas → one mini room per session
Agents:     sessionRooms (gameStore agents grouped by sessionId)
Boss:       Per-room from main agent in that session
Animation:  ❌ Disabled
Canvas:     Grid layout
```

#### `"session"` — Single Session

```
Rendering:  MultiRoomCanvas → one mini room
Agents:     sessionRooms filtered to one session
Boss:       From main agent
Animation:  ❌ Disabled
Canvas:     Grid layout (single room)
```

## 6. Key Code Paths

### Agent data flow (happy path)

```
1. Claude Code hook fires event
2. POST /api/v1/events → event_processor.process_event()
3. StateMachine.transition(event) updates agents/boss
4. broadcast_state() → /ws/all sends merged GameState
5. useWebSocketEvents receives state_update
6. handleStateUpdate() → gameStore.addAgent(agent, position, state.sessionId)
7. Agent stored in gameStore.agents with sessionId
8. useFilteredData() filters by getFilteredSessionIds()
9. AgentStatus/OfficeRoom render filtered data
```

### View switch flow

```
1. User clicks project in sidebar
2. projectStore.zoomToProject(key) → viewMode="project", activeRoomKey=key
3. OfficeGame: isMultiRoom=false → renders single OfficeRoom
4. useFilteredData: getFilteredSessionIds("project", key, ...) → Set<sessionId>
5. OfficeRoom: deskAgents = storeAgents.filter(sessionIds)
6. OfficeRoom: effectiveBoss = filteredBoss (from useFilteredData)
7. AgentStatus: agents from useFilteredData (same filter)
```

### Session → Project resolution

```
Session "abc123" with projectName "Projects-foo-myapp"
  ↓
projectStore.projects has ProjectGroup { key: "projects-foo-myapp", name: "Projects-foo-myapp" }
  ↓
getFilteredSessionIds("project", "projects-foo-myapp", projects, sessions)
  → finds project where p.key === activeRoomKey
  → iterates sessions where s.projectName === project.name
  → returns Set(["abc123", ...other sessions of same project])
  ↓
gameStore.agents.filter(a => sessionIds.has(a.sessionId))
```

## 7. Common Debugging Scenarios

### Agent shows in wrong project

Check: `agent.sessionId` → is the session registered to the correct project?
```bash
curl http://localhost:8000/api/v1/projects/{key}
# Look at session_ids list
```

### Agent count mismatch (panel vs canvas)

Check: Both AgentStatus and OfficeRoom should use `useFilteredData()` with the same sessionIds.
- AgentStatus: `agentArray` from `useFilteredData().agents`
- OfficeRoom: `deskAgents` filtered by `useFilteredData().sessionIds`
- Count includes `agentType === "main"` in `__all__` mode

### Project shows 0 agents but office shows many

Check: Does the project have active sessions with agents?
```bash
# List active sessions for a project
curl http://localhost:8000/api/v1/projects/{key}
# Check if those session IDs have agents in gameStore
```

In-memory StateMachine only exists for active sessions. Completed sessions have no agents.

### "Unknown" project appears

A session in `event_processor.sessions` has no registered project. Check:
- Did `session_start` event include `project_root`?
- Was `derive_project_name_from_path()` able to extract a name?

### Events/conversation not filtering

`filterEvents()` and `filterConversation()` in `utils/filterHelpers.ts` filter by `sessionId` field on each entry. If entries lack `sessionId`, they won't be filtered (shown in all views).
