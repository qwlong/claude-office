# Phase 2: Task Orchestration Integration Design Spec

> Date: 2026-04-08
> Prerequisite: Phase 1 (Multi-Project Rooms) completed

## Goal

Integrate external task orchestration systems (starting with Agent Orchestrator) into Claude Office, enabling users to spawn tasks, track their lifecycle (PR, CI, review), and visualize task status on agents — all from within the office UI.

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| AO availability | Optional, graceful degradation | Claude Office works standalone; AO enhances it |
| Configuration | Environment variable `AO_URL` | Simple, consistent with existing config pattern |
| Interaction scope | Read + spawn (Phase 2); kill/send message (Phase 3) | Most value with least complexity |
| Data sync strategy | Hooks for agent lifecycle, AO API for metadata only | Single data flow, no duplication |
| Session matching | worktree_path matching | Hooks' `working_directory` contains enough info |
| Task model | Independent of Agent lifecycle | Tasks persist after agents depart |
| External system abstraction | Adapter pattern | Classic GoF pattern, extensible to future systems |
| Task panel UI | Bottom drawer (VSCode-style) | Independent panel, draggable height, non-intrusive |
| Naming | `Task` (first-class citizen) + `TaskAdapter` (external interface) | No naming collision, clear separation |
| AO events | HTTP polling (not SSE) | PR/CI status doesn't need sub-second latency; polling is simpler and more resilient to disconnects; AO SSE has fixed 5s interval anyway |
| Relation to Phase 1 AO section | Phase 2 supersedes the `AOBridge` design in Phase 1 spec | Phase 1 spec's Section 2 (AO Bridge with SSE) is replaced entirely by this design |

## Data Flow

```
User clicks Spawn
  -> Frontend POST /api/v1/tasks/spawn { projectId, issue }
  -> Backend TaskService -> AOAdapter.spawn() -> AO POST /api/spawn
  -> AO starts Claude Code session (in git worktree)
  -> Claude Code hooks report session_start
  -> EventProcessor creates Agent (Phase 1 existing flow)
  -> Agent appears in corresponding project room

Background polling (every 10s)
  -> AOAdapter.poll() -> AO GET /api/sessions
  -> TaskService updates Task list (PR/CI/review status)
  -> Match Task <-> Office Session via worktree_path
  -> broadcast_service pushes "tasks_update" to frontend
  -> TaskDrawer updates display
```

```
                    ┌──────────────┐
                    │   AO Server  │
                    │  :3000       │
                    └──┬───────┬───┘
                       │       │
            POST /api/spawn  GET /api/sessions (poll 10s)
                       │       │
                    ┌──▼───────▼───┐
                    │  AOAdapter   │
                    │  (adapter)   │
                    └──────┬───────┘
                           │ ExternalSession
                    ┌──────▼───────┐
                    │ TaskService  │
                    │ - tasks{}    │
                    │ - matching   │
                    │ - broadcast  │
                    └──┬───────┬───┘
                       │       │
              tasks_update   worktree_path match
              (WebSocket)      │
                       │    ┌──▼──────────────┐
                       │    │ EventProcessor  │
                       │    │ (Phase 1 hooks) │
                       │    └─────────────────┘
                       │
                    ┌──▼───────────┐
                    │   Frontend   │
                    │ - TaskDrawer │
                    │ - taskStore  │
                    └──────────────┘
```

## Backend Architecture

### File Structure

```
backend/app/
  config.py                       # +AO_URL, +AO_POLL_INTERVAL
  main.py                         # +task_service lifecycle
  models/
    tasks.py                      # NEW: Task model, TaskStatus enum
  services/
    task_service.py               # NEW: TaskService (lifecycle, matching, polling)
    adapters/
      __init__.py                 # NEW: TaskAdapter Protocol, ExternalSession
      ao.py                       # NEW: AOAdapter implementation
  api/routes/
    tasks.py                      # NEW: /api/v1/tasks/* endpoints
```

### Task Model (`models/tasks.py`)

```python
class TaskStatus(str, Enum):
    spawning = "spawning"
    working = "working"
    pr_open = "pr_open"
    ci_failed = "ci_failed"
    review_pending = "review_pending"
    changes_requested = "changes_requested"
    approved = "approved"
    merged = "merged"
    done = "done"
    error = "error"

class Task(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str                         # Internal UUID
    external_session_id: str        # External system's session ID
    adapter_type: str               # "ao" (extensible)
    project_key: str                # Maps to Claude Office project
    issue: str | None               # Issue number or description
    status: TaskStatus
    pr_url: str | None
    pr_number: int | None
    ci_status: str | None           # "passing" | "failing" | "pending"
    review_status: str | None       # "pending" | "changes_requested" | "approved"
    worktree_path: str | None       # For matching to office session
    office_session_id: str | None   # Matched Claude Office session
    created_at: datetime
    updated_at: datetime
```

### Adapter Protocol (`services/adapters/__init__.py`)

```python
class ExternalSession(BaseModel):
    """Normalized session info from any external orchestration system."""
    session_id: str
    project_id: str
    worktree_path: str | None
    issue: str | None
    status: str
    pr_url: str | None
    pr_number: int | None
    ci_status: str | None
    review_status: str | None

class TaskAdapter(Protocol):
    """Interface for external orchestration system adapters."""
    adapter_type: str
    connected: bool

    async def connect(self) -> bool
        """Probe if the external system is reachable."""

    async def spawn(self, project_id: str, issue: str) -> ExternalSession
        """Dispatch a new task to the external system."""

    async def poll(self) -> list[ExternalSession]
        """Fetch current session states from the external system."""

    async def get_projects(self) -> list[dict]
        """Get configured projects from the external system."""
```

### AO Adapter (`services/adapters/ao.py`)

```python
class AOAdapter:
    """Agent Orchestrator (@composio/ao) adapter."""

    adapter_type = "ao"

    def __init__(self, ao_url: str):
        self.ao_url = ao_url.rstrip("/")
        self.connected = False

    async def connect(self) -> bool:
        """GET {ao_url}/api/sessions to probe connectivity."""
        # Sets self.connected, returns success/failure
        # Logs warning on failure, does not raise

    async def spawn(self, project_id: str, issue: str) -> ExternalSession:
        """POST {ao_url}/api/spawn { project: project_id, issue: issue }."""

    async def poll(self) -> list[ExternalSession]:
        """GET {ao_url}/api/sessions -> convert to ExternalSession list."""
        # Maps AO session fields to ExternalSession:
        #   AO.id -> session_id
        #   AO.project -> project_id
        #   AO.worktreePath -> worktree_path
        #   AO.status -> status
        #   AO.pr.url -> pr_url
        #   AO.pr.number -> pr_number
        #   AO.pr.ciStatus -> ci_status
        #   AO.pr.reviewStatus -> review_status

    async def get_projects(self) -> list[dict]:
        """GET {ao_url}/api/projects."""
```

### TaskService (`services/task_service.py`)

```python
class TaskService:
    """Manages task lifecycle, session matching, and state broadcasting."""

    def __init__(self):
        self.adapter: TaskAdapter | None = None
        self.tasks: dict[str, Task] = {}       # task_id -> Task
        self._poll_task: asyncio.Task | None = None

    async def start(self):
        """Initialize adapter from config. Skip if AO_URL is empty."""
        settings = get_settings()
        if not settings.AO_URL:
            logger.info("AO_URL not set, task orchestration disabled")
            return
        self.adapter = AOAdapter(settings.AO_URL)
        await self.adapter.connect()
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self):
        """Cancel polling loop."""
        if self._poll_task:
            self._poll_task.cancel()

    @property
    def connected(self) -> bool:
        return self.adapter.connected if self.adapter else False

    async def spawn(self, project_id: str, issue: str) -> Task:
        """Dispatch new task via adapter, create internal Task."""
        if not self.adapter or not self.adapter.connected:
            raise HTTPException(503, "No orchestration system connected")
        external = await self.adapter.spawn(project_id, issue)
        task = Task(
            id=str(uuid4()),
            external_session_id=external.session_id,
            adapter_type=self.adapter.adapter_type,
            project_key=normalize_project_key(project_id),  # from project_registry.py
            issue=external.issue,
            status=TaskStatus(external.status),
            worktree_path=external.worktree_path,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            ...
        )
        self.tasks[task.id] = task
        await self._broadcast()
        return task

    async def _poll_loop(self):
        """Poll adapter every N seconds, update tasks, match sessions, broadcast."""
        while True:
            await asyncio.sleep(get_settings().AO_POLL_INTERVAL)
            try:
                sessions = await self.adapter.poll()
                changed = self._update_tasks(sessions)
                if changed:
                    self._match_all_sessions()
                    await self._broadcast()
                self.adapter.connected = True  # Restore on success
            except Exception:
                self.adapter.connected = False
                # Retry on next cycle

    def _update_tasks(self, sessions: list[ExternalSession]) -> bool:
        """Sync external sessions into internal tasks. Returns True if anything changed."""
        # For each ExternalSession:
        #   - Find existing task by external_session_id, or create new
        #   - Update status, pr_url, ci_status, review_status
        #   - Track whether any field actually changed

    def _match_all_sessions(self):
        """Match tasks to office sessions via worktree_path.
        
        Uses event_processor singleton: for each session's StateMachine,
        checks sm.working_directory (set from hook session_start payload).
        If task.worktree_path matches or is a parent of working_directory,
        sets task.office_session_id.
        """
        # For each task with worktree_path:
        #   - Search event_processor.sessions for matching working_directory
        #   - Set task.office_session_id if found

    async def _broadcast(self):
        """Push tasks_update message to all /ws/projects clients."""
        await broadcast_tasks_update(
            tasks=list(self.tasks.values()),
            connected=self.connected,
            adapter_type=self.adapter.adapter_type if self.adapter else None,
        )

    def get_tasks(self, project_key: str | None = None) -> list[Task]:
        """Get all tasks, optionally filtered by project."""
        tasks = list(self.tasks.values())
        if project_key:
            tasks = [t for t in tasks if t.project_key == project_key]
        return sorted(tasks, key=lambda t: t.created_at, reverse=True)
```

### API Endpoints (`api/routes/tasks.py`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/tasks` | GET | List all tasks, `?project_key=xxx` filter |
| `/api/v1/tasks/spawn` | POST | Spawn new task `{ project_id, issue }` |
| `/api/v1/tasks/status` | GET | Connection status `{ connected, adapter_type, task_count }` |
| `/api/v1/tasks/projects` | GET | External system's configured projects |

### WebSocket Message

Added to existing `/ws/projects` channel:

```json
{
  "type": "tasks_update",
  "data": {
    "connected": true,
    "adapterType": "ao",
    "tasks": [
      {
        "id": "uuid",
        "externalSessionId": "ao-abc-123",
        "adapterType": "ao",
        "projectKey": "startups-mono",
        "issue": "#123 Fix login bug",
        "status": "pr_open",
        "prUrl": "https://github.com/org/repo/pull/45",
        "prNumber": 45,
        "ciStatus": "passing",
        "reviewStatus": "approved",
        "officeSessionId": "session-xyz",
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

### Configuration (`config.py`)

```python
# Add to Settings class:
AO_URL: str = ""                  # Empty = disabled
AO_POLL_INTERVAL: int = 10       # Seconds
```

### Lifecycle (`main.py`)

```python
# In lifespan():
task_service = get_task_service()
await task_service.start()

yield

await task_service.stop()
```

---

## Frontend Architecture

### File Structure

```
frontend/src/
  types/
    tasks.ts                      # NEW: Task type, TaskStatus, TasksUpdate
  stores/
    taskStore.ts                  # NEW: Zustand store
  components/
    tasks/
      TaskDrawer.tsx              # NEW: Bottom drawer main component
      TaskList.tsx                # NEW: Project-grouped task list
      TaskCard.tsx                # NEW: Single task card
      SpawnModal.tsx              # NEW: Spawn task modal
      TaskStatusBadge.tsx         # NEW: Status badge component
```

### Types (`types/tasks.ts`)

```typescript
type TaskStatus =
  | "spawning" | "working" | "pr_open" | "ci_failed"
  | "review_pending" | "changes_requested" | "approved"
  | "merged" | "done" | "error";

interface Task {
  id: string;
  externalSessionId: string;
  adapterType: string;
  projectKey: string;
  issue: string | null;
  status: TaskStatus;
  prUrl: string | null;
  prNumber: number | null;
  ciStatus: string | null;
  reviewStatus: string | null;
  officeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TasksUpdate {
  connected: boolean;
  adapterType: string | null;
  tasks: Task[];
}
```

### taskStore (`stores/taskStore.ts`)

```typescript
interface TaskStoreState {
  // State
  connected: boolean;
  adapterType: string | null;
  tasks: Task[];
  drawerOpen: boolean;
  drawerHeight: number;          // Pixels, draggable

  // Actions
  updateFromServer: (data: TasksUpdate) => void;
  toggleDrawer: () => void;
  setDrawerHeight: (h: number) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}
```

WebSocket handler in existing `useWebSocketEvents.ts` handles `"tasks_update"` messages and calls `taskStore.updateFromServer()`.

### TaskDrawer (Bottom Drawer)

```
┌────────────────────────────────────────────────────────┐
│ ═══════════════════════════════════                     │  <- Drag handle
│ Tasks (3 active)                    [+ Spawn]  [▼]     │  <- Title bar
├────────────────────────────────────────────────────────┤
│ startups-mono                                          │
│  🟢 #123 Fix login bug        PR #45  CI ✅  Review ✅ │
│  🟡 #124 Add dark mode        PR #46  CI 🔄           │
│  ⚪ #125 Refactor auth         spawning...              │
│                                                        │
│ workstream                                             │
│  🟢 #45 Update API docs       working...               │
└────────────────────────────────────────────────────────┘
```

**Behavior:**
- Collapsed: title bar only, shows active task count badge
- Expanded: draggable height (min 150px, max 50% viewport)
- Drag handle on top edge for resizing
- AO disconnected: gray "No orchestration system connected", Spawn button hidden
- Remembers open/closed state and height in localStorage

### SpawnModal

```
┌──────────────────────────────────┐
│ Spawn New Task                   │
│                                  │
│ Project:  [startups-mono     ▾]  │  <- Dropdown from /api/v1/tasks/projects
│ Issue:    [#123 Fix login bug ]  │  <- Text input
│                                  │
│         [Cancel]  [Spawn]        │
└──────────────────────────────────┘
```

---

## Task Status -> Office Visualization

Task status maps to visual effects on the matched agent (via `office_session_id`):

| Task Status | Agent Visualization |
|-------------|---------------------|
| spawning | Agent walks from elevator to desk |
| working | Agent typing at desk (default) |
| pr_open | PR icon appears on desk |
| ci_failed | Desk flashes red, agent shows error bubble |
| review_pending | Review icon above agent head |
| changes_requested | Agent shows bubble with review comments |
| approved | Green checkmark above agent |
| merged | Agent does celebration animation, then departs |

**Implementation:** When TaskService matches `office_session_id`, it injects `task_status` into the Agent model. Frontend reads `agent.taskStatus` and overlays the corresponding visual effect on top of Phase 1's existing agent rendering.

---

## Status Field Semantics

- `Task.status` (TaskStatus enum): the **overall task lifecycle stage** — what phase the task is in (spawning → working → pr_open → merged → done)
- `Task.ci_status`: the **CI pipeline result** for the PR — a snapshot of the latest CI run ("passing" / "failing" / "pending")
- `Task.review_status`: the **code review state** — snapshot of review ("pending" / "changes_requested" / "approved")

`TaskStatus.ci_failed` means the agent is **actively working on fixing CI** (AO may auto-dispatch the fix). It's a lifecycle stage, not just a CI result. A task can have `status=pr_open` with `ci_status="failing"` if the agent hasn't started fixing yet.

## Room Creation on Spawn

When a task is spawned via AO, the room for that project may not yet exist in Claude Office (no active sessions). The room is **not pre-created**. Instead:
1. AO spawns Claude Code session in a worktree
2. Claude Code fires `session_start` hook
3. EventProcessor creates the session → ProjectRegistry creates the project room
4. Agent appears in the newly created room

This means there's a brief delay (~1-2s) between spawn and the room appearing. The TaskDrawer shows the task immediately with `status=spawning`; the room appears once hooks fire.

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| `AO_URL` not set | TaskService doesn't start, no drawer shown |
| AO unreachable at startup | `connected = false`, drawer shows "Not connected" |
| AO goes down mid-session | Next poll fails, `connected = false`, existing tasks freeze |
| AO comes back | Next poll succeeds, `connected = true`, tasks resume updating |
| Task's agent disappears (session ends) | Task remains in list with last known status |

---

## Implementation Tasks (7)

1. Backend: `models/tasks.py` + `services/adapters/__init__.py` (Task model + TaskAdapter Protocol + ExternalSession)
2. Backend: `services/adapters/ao.py` (AOAdapter implementation)
3. Backend: `services/task_service.py` (TaskService: lifecycle, polling, session matching, broadcast)
4. Backend: `api/routes/tasks.py` + config.py additions + main.py lifespan integration
5. Frontend: `types/tasks.ts` + `stores/taskStore.ts` + WebSocket handler integration
6. Frontend: `TaskDrawer` + `TaskList` + `TaskCard` + `SpawnModal` + `TaskStatusBadge` components
7. Frontend: Agent visualization overlay (task_status -> visual effects mapping)

## Phase 3 (Future)

- Kill session from Claude Office UI
- Send message to running agent
- Task history persistence (SQLite)
- Multiple adapter support (run AO + another system simultaneously)
- Custom notifier plugin for AO that pushes events to Claude Office directly (replacing polling)

## Non-Goals (Phase 2)

- Persisting tasks to database (in-memory only, resets on restart)
- Managing AO configuration from Claude Office UI
- Multiple simultaneous adapters
- Task dependency graphs
- Billing/cost tracking per task
