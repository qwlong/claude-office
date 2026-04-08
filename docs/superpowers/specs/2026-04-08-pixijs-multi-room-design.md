# PixiJS Multi-Room Office Design Spec

> Date: 2026-04-08

## Goal

Replace the HTML-based ProjectRoomGrid with a PixiJS-rendered multi-room view. When the user clicks "Projects", the same PixiJS canvas shows multiple complete mini-offices (one per project), each with full furniture and agent animations at 50% scale, separated by walking corridors.

## User Requirements

1. Click "Projects" → see all project rooms in one PixiJS canvas
2. Each room is a **complete mini-office** — same as the All Merged view but smaller
3. Full furniture: clock, whiteboard, safety sign, city window, water cooler, coffee machine, printer, plant, elevator, employee of month, boss rug
4. Full agent animations: walking, typing, bubbles, arrival/departure queues
5. Each room has a project name label + color border
6. Rooms arranged in a 2-column grid with walking corridor gaps
7. "Office" button switches back to All Merged view (existing behavior unchanged)

## Architecture

### Rendering Strategy

Reuse ALL existing OfficeGame sub-components inside per-project `<pixiContainer>` wrappers with `scale` and position offsets. No new rendering components needed — just composition.

```
OfficeGame.tsx (modified)
├─ viewMode === "all-merged"
│   └─ existing rendering (unchanged)
│
└─ viewMode === "overview"
    └─ for each project in projectStore.projects:
        └─ <pixiContainer scale={ROOM_SCALE} x={col*ROOM_OFFSET_X} y={row*ROOM_OFFSET_Y}>
            ├─ <RoomLabel name={project.name} color={project.color} />
            ├─ <OfficeBackground />        ← existing component
            ├─ <WallClock />               ← existing component
            ├─ <Whiteboard todos={project.todos} />
            ├─ <SafetySign />
            ├─ <CityWindow />
            ├─ <EmployeeOfTheMonth />
            ├─ <Elevator />
            ├─ <DeskSurfacesBase />
            ├─ <DeskSurfacesTop />
            ├─ <BossSprite />              ← per-room boss state
            ├─ <AgentSprite /> × N         ← per-room agents
            └─ sprites (water cooler, coffee, plant, printer, boss rug)
        </pixiContainer>
```

### Data Flow

```
Backend (existing)                    Frontend
─────────────────                    ────────
/ws/projects                         projectStore
  → MultiProjectGameState             → projects: ProjectGroup[]
    → projects[]:                        each has: agents[], boss, todos
      { key, name, color,
        agents[], boss,              OfficeGame reads projectStore
        sessionCount, todos }         when viewMode === "overview"
```

Each room gets its data from `projectStore.projects[i]`, NOT from the global `gameStore`. The global `gameStore` continues to serve the All Merged view.

### Room Layout Constants

```typescript
const ROOM_SCALE = 0.5;           // Each room is 50% of full office
const ROOM_GAP_X = 32;            // Horizontal corridor between rooms
const ROOM_GAP_Y = 32;            // Vertical corridor between rooms
const ROOM_COLS = 2;              // 2-column grid
const FULL_ROOM_W = 1280;         // Full office canvas width
const FULL_ROOM_H = 1024;         // Full office canvas height (8 desks)

// Rendered room size = FULL_ROOM_W * ROOM_SCALE = 640px
// Rendered room height = FULL_ROOM_H * ROOM_SCALE = 512px
```

Canvas total size adjusts dynamically based on project count:
- 1-2 projects: 1 row
- 3-4 projects: 2 rows
- 5-6 projects: 3 rows

### Key Changes

#### 1. OfficeGame.tsx — Conditional Rendering

The main change. When `viewMode === "overview"`:
- Read `projects` from `projectStore` instead of `gameStore`
- For each project, render a complete office inside a scaled container
- Each room's sub-components receive that project's agents/boss/todos as props
- Canvas width/height adjusts to fit the grid

When `viewMode === "all-merged"`:
- Existing rendering completely unchanged

#### 2. Sub-Component Prop Drilling

Currently, components like `AgentSprite`, `BossSprite`, `Whiteboard` read from `gameStore` directly via selectors. For multi-room rendering, they need to accept **optional props** that override the store data.

Pattern:
```typescript
// Before (reads global store):
function Whiteboard() {
  const todos = useGameStore(selectTodos);
  ...
}

// After (props override store):
function Whiteboard({ todos: propTodos }: { todos?: TodoItem[] }) {
  const storeTodos = useGameStore(selectTodos);
  const todos = propTodos ?? storeTodos;
  ...
}
```

This preserves backward compatibility — All Merged view passes no props (uses store), Overview passes per-room data.

**Approach: RoomContext provider** — Instead of prop-drilling 10+ overrides into each sub-component, wrap each room in a `RoomContext.Provider` that supplies the project's data. Sub-components call `useRoomContext()` which returns the per-room override, falling back to `gameStore` when no context is present (All Merged mode).

```typescript
interface RoomContextValue {
  agents: Map<string, AgentAnimationState>;
  boss: BossAnimationState;
  todos: TodoItem[];
  whiteboardData: WhiteboardData;
  deskCount: number;
  occupiedDesks: Set<number>;
  textures: OfficeTextures;  // Forward loaded textures
}

const RoomContext = createContext<RoomContextValue | null>(null);

function useRoomData<T>(selector: (store: GameStore) => T, roomField: keyof RoomContextValue): T {
  const room = useContext(RoomContext);
  const storeValue = useGameStore(selector);
  return room ? (room[roomField] as T) : storeValue;
}
```

Components that need `useRoomData()`:
- `Whiteboard` — todos, whiteboardData, whiteboardMode (mode is global/shared across rooms)
- `BossSprite` / `BossBubble` — boss state
- `SafetySign` — tool count
- `DeskGrid` — deskCount, occupiedDesks, deskTasks
- `Elevator` — agent list
- `AgentSprite` — already receives agent data as props (no change)
- All furniture sprites — receive textures from context

#### 3. Room Label Component

New small PixiJS component rendered above each room:

```typescript
function RoomLabel({ name, color, width }: { name: string; color: string; width: number }) {
  // Colored bar at top of room + project name text
  // Width matches the scaled room width
}
```

#### 4. Delete HTML Components

Remove the HTML-based components that are no longer needed:
- `frontend/src/components/game/MiniOffice.tsx` → delete
- `frontend/src/components/game/ProjectRoomGrid.tsx` → replace with PixiJS rendering in OfficeGame

#### 5. Animation System

The global `useAnimationSystem()` is a singleton tied to `gameStore`. For overview mode:

- **Skip `useAnimationSystem()`** when `viewMode === "overview"` — agents in rooms don't need walk choreography
- Agents render in **static poses** at their desks with the correct state-based sprite frame (working → typing frame, idle → idle frame, waiting_permission → red frame)
- Bubbles display from the per-room agent/boss data
- Each room's agents operate independently — they show their own project's activity

**Each room has independent activity:** The backend already tracks agents per-project. When agent A in proj-X is typing and agent B in proj-Y is idle, each room shows its own state independently. No cross-room interference.

#### 6. Canvas Resize on Mode Switch

The `<Application>` component receives `width` and `height` as props. When switching between modes, the canvas needs different dimensions:
- All Merged: `CANVAS_WIDTH × canvasHeight` (current)
- Overview: `gridWidth × gridHeight` (based on project count)

**Approach:** Use a `key` prop on `<Application>` that includes the `viewMode`, forcing a remount only on mode switch. This avoids imperative `app.renderer.resize()` calls.

```typescript
<Application
  key={`pixi-app-${hmrVersion}-${viewMode}`}
  width={viewMode === "overview" ? gridWidth : CANVAS_WIDTH}
  height={viewMode === "overview" ? gridHeight : canvasHeight}
  ...
/>
```

#### 7. Texture Forwarding

`useOfficeTextures()` loads ~15 textures (desk, chair, monitor, elevator, headset, etc.). In overview mode, the same textures object is passed via `RoomContext` to all rooms. Textures are loaded once and shared — no duplication.

### Page.tsx Changes

- Remove the dynamic import of `ProjectRoomGrid` (HTML version)
- The view mode toggle ("Office" / "Projects") stays — it just switches `viewMode` in `projectStore`
- OfficeGame handles the rendering internally based on `viewMode`

## Non-Goals

- Room-detail zoom view (`room-detail` mode in projectStore exists but is unused; sidebar session switching already covers single-project focus)
- Full walk animation per-room (v1 uses static poses; agents show correct state frames)
- Room furniture customization
- Agent migration between rooms
- Room-specific whiteboard modes (mode is global, shared across all rooms)
- Per-room compaction animation (compaction visual only shows in All Merged mode)
