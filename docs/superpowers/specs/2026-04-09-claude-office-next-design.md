# Claude Office Next — Design Spec

**Date:** 2026-04-09
**Status:** Draft (reviewed, issues fixed)
**Priority:** A → B → C

## Problem Statement

Claude Office currently visualizes agents but lacks meaningful interaction. Three pain points:

1. **No game-like interaction** — users watch agents but can't operate them from the UI
2. **No visual proof that PRs work** — agents submit PRs but there's no screenshot evidence the UI isn't broken
3. **No integration safety net** — multiple agents submit PRs to the same repo with no conflict detection

## Scope

Three independent sub-projects, each with its own implementation cycle:

| Phase | Feature | Priority | Depends On |
|-------|---------|----------|------------|
| A | Game-like Agent Management | Highest | Nothing |
| B | PR Visual Verification | High | Phase A (task card) |
| C | Multi-Agent Integration Verification | Medium | Phase B (PR tracking) |

---

## Phase A: Game-like Agent Management

### A.1 Interaction Model

All click/drag detection happens in PixiJS via `eventMode: 'static'` on sprite containers. Clicking an agent sprite sets `store.selectedAgentId` in the Zustand `gameStore`, which triggers React to render an `<AgentDetailPanel>` as a slide-out overlay anchored to the right edge. Clicking empty floor space within a room (detected via a transparent hit-area rectangle behind all sprites in each `OfficeRoom`) opens the **existing** `<SpawnModal>` (`frontend/src/components/tasks/SpawnModal.tsx`) — the parent component sets `isOpen=true` and passes the clicked `projectKey` as context. No new store field needed; the existing prop-driven pattern is preserved.

Right-clicking an agent (or long-press on mobile) sets `store.contextMenuAgent` in the store. React renders an `<AgentContextMenu>` positioned at the click coordinates with quick actions: Send Message, Pause, Kill, Copy Session ID. **Note:** PixiJS pointer coordinates must be transformed to CSS viewport coordinates using the canvas element's `getBoundingClientRect()` offset before storing.

**Drag-and-drop is deferred to when AO supports cross-project migration.** V1 does not implement drag — it would be pure visual polish with zero functionality, creating user confusion.

### A.2 Agent Detail Panel

`<AgentDetailPanel>` is a React overlay (`position: fixed; right: 0; width: 380px`) that reads from `useGameStore(s => s.agents.get(s.selectedAgentId))` (agents is a `Map`, must use `.get()` not bracket notation). It displays:

- **Header:** Agent name, color swatch, project badge, desk number
- **Status:** Maps `backendState` to label with colored dot — `working` (green), `idle` (gray), `waiting_permission` (amber pulse), `thinking` (blue), error (red)
- **Current Tool:** Tool name from most recent `tool_use` event (Read, Edit, Bash, etc.) with icon from existing `ICON_MAP`
- **Context Usage:** Horizontal progress bar from `contextUtilization` percentage
- **Recent Activity:** Last 5 events from the backend `GET /status` endpoint (not from `conversationHistory`, which is session-level and not per-agent). The panel fetches on mount and relies on WebSocket updates for real-time state; no polling needed since agent state already arrives via WebSocket.
- **Actions:** Send Message (inline text input → POST), Pause (POST `/pause`) / Resume (POST `/resume`) as **separate endpoints** (not a toggle — avoids state drift), Kill (opens inline confirmation with "Are you sure?" + confirm button, using existing UI patterns), View PR link if exists

### A.3 Visual Feedback and Animations

Agent state drives sprite animation via existing `AgentPhase` and `isTyping` fields:

| State | Visual |
|-------|--------|
| Working | Typing animation (arms oscillating, already implemented) |
| Idle | Sitting still at desk |
| Waiting permission | Arm raised upward (new pose), amber bubble with key icon |
| Error | Red flash — tint cycles between `0xFF4444` and base color every 500ms |
| Spawning | Arrival choreography: elevator → arrival queue → boss desk → assigned desk |
| Killed | Reverse: stand up → departure queue → wave gesture (3-frame animation) → elevator |
| Dragging | Source desk shows dashed outline placeholder |

Speech bubbles (existing `drawBubble`) show current tool icon + truncated task summary (max 24 chars).

### A.4 PixiJS ↔ React Bridge

The Zustand `gameStore` is the sole communication channel. New store fields:

```typescript
// Added to GameStoreState
selectedAgentId: string | null;
contextMenuAgent: {
  id: string;
  viewportX: number;  // CSS viewport coordinates (not PixiJS world coords)
  viewportY: number;
} | null;
// Note: spawnTarget and dragState removed — SpawnModal uses existing prop pattern,
// drag deferred to when AO supports cross-project migration
```

React overlays subscribe via `useShallow` selectors per project conventions. Clicking empty space or pressing Escape clears selection and dismisses panels. No custom event emitters needed.

### A.5 Backend API Changes

Four new endpoints added to the existing `backend/app/api/routes/agents.py`. These proxy through the existing `AOAdapter` (`backend/app/services/adapters/ao.py`) to Agent Orchestrator:

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/v1/agents/{session_id}/message` | POST | `{ "text": string }` | Forward message to agent via `AOAdapter.send_message()` |
| `/api/v1/agents/{session_id}/pause` | POST | — | Pause agent (SIGTSTP) |
| `/api/v1/agents/{session_id}/resume` | POST | — | Resume agent (SIGCONT) |
| `/api/v1/agents/{session_id}/kill` | POST | — | Terminate session (SIGTERM + worktree cleanup) |
| `/api/v1/agents/{session_id}/status` | GET | — | Detailed status |

**Note:** Separate `/pause` and `/resume` endpoints instead of a toggle to avoid state drift between frontend and backend.

Response shape for status:

```python
class AgentDetailStatus(BaseModel):
    session_id: str
    state: AgentState
    current_tool: str | None
    context_usage_percent: float  # 0.0 - 100.0
    recent_events: list[EventDetail]  # Last 5
    pr_url: str | None
    started_at: datetime
    project_key: str
```

### A.6 Data Flow

1. **Selection:** Click sprite → PixiJS sets `selectedAgentId` → React mounts panel → reads agent state from store (already populated via WebSocket). Initial `GET /status` fetches `recent_events` not available in the store. No polling — subsequent updates arrive via WebSocket.
2. **Message:** Type + Send → `POST /message` → backend → AOAdapter.send_message() → agent processes → hook events → WebSocket → PixiJS + React update
3. **Real-time sync:** Agent state changes → hook events → EventProcessor → WebSocket broadcast → `gameStore` updates → PixiJS reads on `useTick`, React re-renders from same store

---

## Phase B: PR Visual Verification

### B.1 Screenshot Capture Flow

When an agent finishes work and is about to create a PR, the screenshot capture process is triggered — either through the `finish-branch` skill (which calls the screenshot service before `gh pr create`) or via an AO lifecycle hook (`pre_pr_create`). The backend's `ScreenshotService` spins up a Playwright headless Chromium instance, starts the target project's dev server in the agent's worktree on a **dynamically allocated port** (to avoid conflicts with other agents' dev servers — find a free port via `get_free_port()` and override `base_url`), and navigates to each route defined in the project's config. Screenshots are saved to `~/.claude-office/screenshots/{sanitized_branch}/{route}-{viewport}.png` (branch names sanitized: `/` → `_`). Once complete, the service attaches them to the PR description or posts as a PR comment via the GitHub API. **Cleanup:** the dev server process is killed in a `finally` block to prevent orphaned processes holding ports. Capture is serialized (one agent at a time) via an asyncio lock to keep resource usage predictable. The entire flow adds roughly 30-60 seconds to PR creation.

### B.2 Screenshot Config Format

Each project defines visual check targets in `.claude/visual-checks.yaml`:

```yaml
version: 1
base_url: "http://localhost:3000"
startup_command: "npm run dev"
startup_timeout: 15  # seconds
targets:
  - route: /
    viewports: [{ width: 1280, height: 720 }, { width: 375, height: 812 }]
    wait_for: "canvas"
  - route: /api/docs
    viewports: [{ width: 1280, height: 720 }]
    wait_for: ".swagger-ui"
  - route: /?state=agents-working
    viewports: [{ width: 1280, height: 720 }]
    wait_for: "canvas"
    delay: 2000  # ms after selector found (for animations)
```

If the file is absent, the screenshot step is skipped. `wait_for` accepts CSS selectors; `delay` adds a pause for canvas/animation rendering.

### B.3 Comparison Mode (V2 — future)

V2 adds before/after comparison: capture screenshots on both `main` and the feature branch, then pixel-diff with `pixelmatch`. Configurable threshold for pass/fail. Full design deferred to V2 implementation cycle.

**Known limitation for canvas content:** `wait_for: "canvas"` only confirms the element exists, not that meaningful content has rendered. The `delay` field mitigates this but is inherently brittle. V1 accepts this limitation.

### B.4 Integration with claude-office UI

The task card gains a camera icon: gray (pending), green (passed), red (failed). Clicking opens a modal gallery with tabs per route/viewport. In comparison mode, a slider overlay lets users scrub between base and current. Failed screenshots sort to top with diff overlay. A WebSocket event (`screenshot_status`) keeps the UI current.

### B.5 Implementation

New `ScreenshotService` at `backend/app/services/screenshot_service.py`:
- `capture_screenshots(worktree_path, config)` — capture all targets
- `compare_screenshots(base_path, current_path, config)` — V2 diff

New endpoint: `POST /api/v1/screenshots/capture` accepting `{ branch, project }`. Uses `playwright.async_api` with headless Chromium. Screenshots uploaded to GitHub as PR comment attachments.

### B.6 Scope

| Version | Capability |
|---------|-----------|
| V1 | Capture screenshots, attach to PR as evidence |
| V2 | Before/after comparison with pixelmatch, diff images, pass/fail |
| V3 | CI integration — screenshots on every push |

V1 is static page loads only. Canvas content supported but nondeterministic (animation noise handled by threshold).

---

## Phase C: Multi-Agent Integration Verification

### C.1 Conflict Detection

When any agent opens or updates a PR, the `IntegrationVerifier` runs pairwise conflict checks against all other open PRs targeting the same base branch. For each pair, it tests **both orderings** (merge A then B, and merge B then A) since merge conflicts are not commutative. Conflicting files are extracted from `git diff --name-only --diff-filter=U`. Results stored as a conflict matrix: `Record<[prA, prB], { conflicting: boolean; files: string[]; direction: 'both' | 'a_then_b' | 'b_then_a' }>`.

### C.2 Integration Test Flow

Beyond pairwise checks, the verifier tests whether all open PRs can coexist:

1. Create temp worktree from `origin/main`
2. Sequentially merge each PR branch
3. On merge failure: record, `git merge --abort`, skip, continue
4. Run project test suite on merged result
5. Report: which PRs merged, which skipped, tests pass/fail
6. Clean up temp worktree

### C.3 Merge Order Optimization

Merge conflicts are order-dependent. Instead of brute-force permutations (720 for 6 PRs, each taking seconds = hours of compute), the verifier uses a **greedy algorithm guided by the conflict matrix**: start with the PR that has fewest conflicts, merge it, then pick the next least-conflicting PR, and so on. This runs in O(n^2) merge attempts instead of O(n!). If the greedy order has failures, try reversing the order of the conflicting pair. First fully clean ordering is returned as recommended. If none exists, returns the ordering that merges the most PRs and identifies irreducible conflicts.

### C.4 Integration with claude-office UI

Task panel gains an "Integration Status" card:

| Status | Meaning |
|--------|---------|
| Green | All open PRs merge cleanly, tests pass |
| Yellow | Merge conflicts between specific pairs (shows conflict matrix) |
| Red | Tests fail after merge (shows failing test names) |

Recommended merge order displayed as numbered list with a "Merge All in Order" action.

### C.5 Implementation

New `IntegrationVerifier` service with endpoints:
- `POST /api/v1/integration/check` — trigger on-demand
- `GET /api/v1/integration/status/{project_id}` — poll results

Uses **ephemeral worktrees** (`git worktree add /tmp/iv-{run_id}`, removed after each run) to avoid corruption from concurrent triggers. A mutex lock prevents overlapping runs for the same project. Triggered on-demand via API or by AO task completion events (not GitHub webhooks — webhook ingestion is a significant new capability that would be a prerequisite; defer to V2). Status updates broadcast over existing WebSocket.

### C.6 Scope

| Version | Capability |
|---------|-----------|
| V1 | Git conflict detection only (pairwise + full-set). Fast (seconds). |
| V2 | Test suite execution after successful merge |
| V3 | Auto-resolution suggestions for non-overlapping hunks |

---

## New Files Summary

| File | Purpose |
|------|---------|
| `frontend/src/components/overlay/AgentDetailPanel.tsx` | Slide-out agent detail + actions |
| `frontend/src/components/overlay/AgentContextMenu.tsx` | Right-click quick actions |
| `backend/app/api/routes/agents.py` | Extend existing file with AO-proxied message/pause/resume/kill/status endpoints |
| `backend/app/services/screenshot_service.py` | Playwright screenshot capture |
| `backend/app/services/integration_verifier.py` | Git conflict detection + test runner |
| `.claude/visual-checks.yaml` | Screenshot config per project |

## Non-Goals

- Mobile app or native desktop app
- Real-time collaboration between multiple human users
- Agent-to-agent direct communication
- Billing or cost tracking in UI
