# Multi-Boss Whole Office View

## Problem

In the current Whole Office view (`session_id="__all__"`), all sessions are merged into a single `GameState` with **one synthetic boss**. This boss is always idle and shows `"{N} active sessions"` as its task. The real boss states from each session are lost.

In reality, each active session has its own Claude main process (boss) that may be working, delegating, reviewing, etc. Users want to see all these bosses in the office.

## Design

### Concept

The Whole Office becomes a single large room where:

- **Bottom row** is reserved for **bosses** (one per active session), each with their own rug area
- **Upper rows** hold all **subagents** from all sessions, mixed together
- **Color coding** distinguishes which project each boss/agent belongs to
- Each boss retains its **red carpet area and boss-style desk/chair**, visually distinct from agent desks
- No "grand boss" concept — all session bosses are equal peers

### Visual Layout

```
┌─────────────────────────────────────────────────────┐
│  [wall decorations: EotM, window, clock, whiteboard]│
│                                                      │
│  [desk 1]  [desk 2]  [desk 3]  [desk 4]  ← Row 1   │
│  [desk 5]  [desk 6]  [desk 7]  [desk 8]  ← Row 2   │
│  ...                                      (agents)  │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│  │ Boss A  │  │ Boss B  │  │ Boss C  │  ← Bottom   │
│  │(carpet) │  │(carpet) │  │(carpet) │    (bosses)  │
│  └─────────┘  └─────────┘  └─────────┘             │
│                                                      │
│  [printer] [plant]                                   │
└─────────────────────────────────────────────────────┘
```

- Bosses stay at the bottom (same Y region as current single boss at `y=900`)
- Boss sprites use the existing `BossSprite` component (headset, sunglasses, larger desk)
- Agent desks in upper rows, same as today
- Each boss has a rug offset 40px below their position (preserving current rug-to-boss offset)

### Data Model Changes

#### Backend: `GameState`

Change `boss: Boss` to `bosses: list[Boss]`, where each Boss gains identity fields:

```python
class Boss(BaseModel):
    state: BossState
    current_task: str | None = None
    bubble: BubbleContent | None = None
    position: dict[str, int] = {"x": 640, "y": 830}  # Backend default, only used in single-session view
    # New fields:
    session_id: str | None = None      # Which session this boss belongs to
    project_key: str | None = None     # Which project (for color coding)
    project_color: str | None = None   # Project color hex
```

**Position source of truth:** In merged view, the frontend ignores `boss.position` from the backend and uses `getBossPositions()` to calculate layout positions dynamically based on boss count and canvas width. The backend `position` field is only meaningful in single-session view (where the frontend also overrides it to `y=900` as it does today).

The `GameState` model changes:

```python
class GameState(BaseModel):
    session_id: str
    boss: Boss                  # Keep for backward compat (single session view)
    bosses: list[Boss] = []     # New: populated in merged view
    agents: list[Agent]
    office: OfficeState
    # ... rest unchanged
```

- Single session view: `boss` is set as today, `bosses` is empty
- Merged view (`__all__`): `boss` is set to first boss sorted by `session_id` (deterministic), `bosses` has all session bosses sorted by `session_id` for stable ordering

#### Backend: `get_merged_state()`

Instead of creating a synthetic idle boss, collect real bosses from each session:

```python
all_bosses = []
for session_id, sm in self.sessions.items():
    state = sm.to_game_state(session_id)
    project = self.project_registry.get_project_for_session(session_id)
    boss = state.boss.model_copy(update={
        "session_id": session_id,
        "project_key": project.key if project else None,
        "project_color": project.color if project else None,
    })
    all_bosses.append(boss)

# Return merged state
return GameState(
    session_id="__all__",
    boss=all_bosses[0] if all_bosses else Boss(state=BossState.IDLE),
    bosses=all_bosses,
    agents=all_agents,
    ...
)
```

#### Frontend: `gameStore`

Add a `bosses` map alongside the existing `boss` state:

```typescript
interface GameStoreState {
  boss: BossLocalState;                          // Keep for single session
  bosses: Map<string, BossLocalState>;           // New: sessionId -> state, for merged view
  bossAnimations: Map<string, BossAnimState>;    // Per-boss animation state (typing, compaction, inUseBy)
  // ...
}
```

Each boss gets independent animation state (typing, compaction, `inUseBy` tracking). The existing single-boss `BossAnimationState` logic is reused per-key in the map.

#### Frontend: Layout Calculation

Boss row positioning in `constants/positions.ts` or `canvas.ts`:

```typescript
// Boss row: arranged horizontally, centered
// Frontend uses y=900 for boss position (not the backend default of y=830)
const BOSS_ROW_Y = 900;
const BOSS_RUG_OFFSET_Y = 40; // Rug renders 40px below boss position
const BOSS_SPACING = 280; // Horizontal spacing between boss areas
const BOSS_HALF_WIDTH = 70; // Half the boss desk width for edge padding

function getBossPositions(count: number, canvasWidth: number) {
  // Account for boss desk width at edges to prevent off-canvas rendering
  const usableWidth = canvasWidth - BOSS_HALF_WIDTH * 2;
  const spacing = count <= 1 ? 0 : Math.min(BOSS_SPACING, usableWidth / (count - 1));
  const totalWidth = (count - 1) * spacing;
  const startX = (canvasWidth - totalWidth) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * spacing,
    y: BOSS_ROW_Y,
  }));
}
```

Agent desk rows stay in upper area, bosses at the bottom (matching current layout).

#### Frontend: `OfficeRoom.tsx`

In merged mode, render multiple `BossSprite` instances:

```tsx
// Merged view: render all bosses
{bosses.map((boss, i) => (
  <Fragment key={boss.sessionId}>
    {/* Per-boss rug (offset 40px below boss position) */}
    <pixiSprite texture={textures.bossRug} x={bossPositions[i].x} y={bossPositions[i].y + 40} />
    {/* Boss sprite with project-specific label */}
    <BossSprite
      position={bossPositions[i]}
      state={boss.state}
      label={boss.projectKey ?? boss.sessionId.slice(0, 8)}
      ...
    />
  </Fragment>
))}
```

`BossSprite` needs a new optional `label` prop (defaults to `"Claude"` for backward compat). In merged mode, each boss shows its project name or short session ID.

### Canvas Sizing

The canvas height formula needs to account for:
- Wall decorations area (top ~250px)
- Agent desk rows (4 desks/row, 192px/row)
- Boss row area (~250px, same as current)

```typescript
function getCanvasHeight(deskCount: number, bossCount: number): number {
  const rows = Math.ceil(deskCount / 4);
  const needed = 432 + rows * 192 + 250; // boss area stays ~250px
  return Math.max(CANVAS_HEIGHT, needed);
}
```

If boss count > 4, the boss area may need to expand horizontally (scroll) or bosses can be made slightly smaller.

### Agent-to-Boss Choreography in Merged View

In single-session view, agents walk to the single boss for arrival/departure. In merged view with N bosses, each agent must report to **their own session's boss**:

- Each agent already has `session_id` — match it to the boss with the same `session_id`
- `queuePositions.ts`: `BOSS_POSITION`, `BOSS_SLOT_LEFT`, `BOSS_SLOT_RIGHT` become functions that take a boss position as input, rather than global constants
- `agentArrivalMachine.ts` / `agentDepartureMachine.ts`: look up the agent's boss position from the `bosses` map by `session_id`, then walk to that boss's slot positions
- `compactionAnimation.ts`: in merged view, compaction triggers per-boss (each boss animates independently when their session compacts)

### Color Coding

Each project already has an assigned color (from `ProjectRegistry`). Apply this color to:
- Boss rug tint
- A small colored badge/flag on the boss desk
- Agent desk accessories (already partially supported via `project_key` on agents)

### Edge Cases

| Case | Behavior |
|------|----------|
| 0 sessions active | Show empty office, no bosses |
| 1 session active | Looks identical to current single-session view |
| 5+ bosses | Arrange in a row; if too wide, reduce spacing or allow horizontal scroll |
| Session ends | Boss removed from `bosses` list on next state update |
| Single session view | Uses `boss` field as today, `bosses` ignored |

### What Stays the Same

- Single session view — unchanged
- Projects view (multi-room) — unchanged
- Agent rendering, desk grid, elevator, wall decorations — unchanged
- BossSprite component — reused as-is, just instantiated multiple times
- WebSocket endpoints and subscription model — unchanged

## Files to Modify

| File | Change |
|------|--------|
| `backend/app/models/agents.py` | Add `session_id`, `project_key`, `project_color` to `Boss` |
| `backend/app/models/sessions.py` | Add `bosses: list[Boss]` to `GameState` |
| `backend/app/core/event_processor.py` | Rewrite `get_merged_state()` to collect real bosses, sorted by `session_id` |
| `frontend/src/stores/gameStore.ts` | Add `bosses` map, `bossAnimations` map, and selectors |
| `frontend/src/hooks/useWebSocketEvents.ts` | Handle `state.bosses` array in merged mode updates |
| `frontend/src/components/game/OfficeRoom.tsx` | Render multiple BossSprites in merged mode |
| `frontend/src/components/game/BossSprite.tsx` | Add optional `label` prop (default `"Claude"`) |
| `frontend/src/constants/positions.ts` | Add `getBossPositions()` helper, refactor constants |
| `frontend/src/constants/canvas.ts` | Update height calculation if needed |
| `frontend/src/systems/queuePositions.ts` | Refactor `BOSS_POSITION`/`BOSS_SLOT_*` from constants to functions taking boss position |
| `frontend/src/systems/compactionAnimation.ts` | Support per-boss compaction animation |
| `frontend/src/machines/agentArrivalMachine.ts` | Look up agent's boss position by `session_id` |
| `frontend/src/machines/agentDepartureMachine.ts` | Look up agent's boss position by `session_id` |

**Note:** `frontend/src/types/generated.ts` is auto-generated — update backend models then run `make gen-types` to regenerate.
