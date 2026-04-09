# Multi-Boss Whole Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single synthetic boss in Whole Office view with real bosses from each active session, displayed in a row at the bottom of the office.

**Architecture:** 
- Backend: `Boss` model gains identity fields. `GameState` gains `bosses: list[Boss]`. `get_merged_state()` keeps boss-as-agent in `agents` (with `agentType="main"`) AND populates `bosses` list with real `Boss` objects for BossSprite animation.
- Frontend: `gameStore` gets `bosses: Map<sessionId, BossAnimationState>` with per-boss bubble/typing/inUseBy. `OfficeRoom` renders multiple `BossSprite` at the bottom, desk grid only renders subagents. `useFilteredData` returns filtered bosses. Choreography routes agents to their session's boss via `sessionId` matching.

**Tech Stack:** Python/Pydantic (backend), TypeScript/React/PixiJS/Zustand (frontend)

**Spec:** `docs/superpowers/specs/2026-04-09-multi-boss-whole-office-design.md`

**Implementation note:** Search for class/function names rather than relying on line numbers — they may drift as earlier tasks add lines.

---

### Task 1: Backend — Add identity fields to Boss model

**Files:**
- Modify: `backend/app/models/agents.py` (Boss class)
- Test: `backend/tests/test_boss_identity.py` (create)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_boss_identity.py
"""Tests for Boss identity fields used in multi-boss merged view."""

from app.models.agents import Boss, BossState


def test_boss_has_identity_fields():
    boss = Boss(
        state=BossState.WORKING,
        session_id="abc123",
        project_key="my-project",
        project_color="#3B82F6",
    )
    assert boss.session_id == "abc123"
    assert boss.project_key == "my-project"
    assert boss.project_color == "#3B82F6"


def test_boss_identity_fields_default_none():
    boss = Boss(state=BossState.IDLE)
    assert boss.session_id is None
    assert boss.project_key is None
    assert boss.project_color is None


def test_boss_serializes_identity_fields():
    boss = Boss(
        state=BossState.IDLE,
        session_id="sess1",
        project_key="proj",
        project_color="#FF0000",
    )
    data = boss.model_dump(by_alias=True)
    assert data["sessionId"] == "sess1"
    assert data["projectKey"] == "proj"
    assert data["projectColor"] == "#FF0000"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd claude-office && uv run pytest backend/tests/test_boss_identity.py -v`
Expected: FAIL — `Boss.__init__() got an unexpected keyword argument 'session_id'`

- [ ] **Step 3: Add identity fields to Boss model**

In `backend/app/models/agents.py`, add to `Boss` class after `position`:

```python
    session_id: str | None = None
    project_key: str | None = None
    project_color: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd claude-office && uv run pytest backend/tests/test_boss_identity.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/agents.py backend/tests/test_boss_identity.py
git commit -m "feat: add session_id, project_key, project_color to Boss model"
```

---

### Task 2: Backend — Add `bosses` list to GameState

**Files:**
- Modify: `backend/app/models/sessions.py` (GameState class)
- Test: `backend/tests/test_boss_identity.py` (append)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_boss_identity.py`:

```python
from app.models.sessions import GameState
from app.models.agents import OfficeState
from datetime import datetime


def test_gamestate_has_bosses_list():
    boss = Boss(state=BossState.IDLE)
    gs = GameState(
        session_id="test",
        boss=boss,
        agents=[],
        office=OfficeState(),
        last_updated=datetime.now(),
    )
    assert gs.bosses == []


def test_gamestate_bosses_populated():
    b1 = Boss(state=BossState.WORKING, session_id="s1", project_key="p1")
    b2 = Boss(state=BossState.IDLE, session_id="s2", project_key="p2")
    gs = GameState(
        session_id="__all__",
        boss=b1,
        bosses=[b1, b2],
        agents=[],
        office=OfficeState(),
        last_updated=datetime.now(),
    )
    assert len(gs.bosses) == 2
    assert gs.bosses[0].session_id == "s1"


def test_gamestate_bosses_serialized():
    b1 = Boss(state=BossState.IDLE, session_id="s1")
    gs = GameState(
        session_id="__all__",
        boss=b1,
        bosses=[b1],
        agents=[],
        office=OfficeState(),
        last_updated=datetime.now(),
    )
    data = gs.model_dump(by_alias=True)
    assert "bosses" in data
    assert data["bosses"][0]["sessionId"] == "s1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd claude-office && uv run pytest backend/tests/test_boss_identity.py::test_gamestate_has_bosses_list -v`

- [ ] **Step 3: Add bosses field to GameState**

In `backend/app/models/sessions.py`, add after `boss: Boss`:

```python
    bosses: list[Boss] = Field(default_factory=lambda: cast(list[Boss], []))
```

- [ ] **Step 4: Run tests**

Run: `cd claude-office && uv run pytest backend/tests/test_boss_identity.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/sessions.py backend/tests/test_boss_identity.py
git commit -m "feat: add bosses list to GameState model"
```

---

### Task 3: Backend — Rewrite `get_merged_state()` to collect real bosses

**Files:**
- Modify: `backend/app/core/event_processor.py` (`get_merged_state` method)
- Test: `backend/tests/test_multi_boss_merged.py` (create)

Key design: **Keep** boss-as-agent in `agents` list (with `agentType="main"`), AND populate `bosses` list with real `Boss` objects. The `bosses` list drives `BossSprite` animation; the boss-as-agent in `agents` is the unified data model.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_multi_boss_merged.py
"""Tests for multi-boss merged state in Whole Office view."""

import pytest
from datetime import datetime

from app.core.event_processor import EventProcessor
from app.models.agents import BossState


@pytest.fixture
def processor():
    return EventProcessor()


@pytest.mark.asyncio
async def test_merged_state_has_bosses_from_each_session(processor):
    """Each active session should contribute one boss to the bosses list."""
    await processor.process_event({
        "event_type": "session_start",
        "session_id": "session-aaa",
        "timestamp": datetime.now().isoformat(),
        "data": {"project_name": "Project Alpha", "project_dir": "/tmp/alpha"},
    })
    await processor.process_event({
        "event_type": "session_start",
        "session_id": "session-bbb",
        "timestamp": datetime.now().isoformat(),
        "data": {"project_name": "Project Beta", "project_dir": "/tmp/beta"},
    })

    state = await processor.get_merged_state()
    assert state is not None
    assert len(state.bosses) == 2
    # Sorted by session_id
    assert state.bosses[0].session_id == "session-aaa"
    assert state.bosses[1].session_id == "session-bbb"
    # boss field is first in sorted order
    assert state.boss.session_id == "session-aaa"


@pytest.mark.asyncio
async def test_merged_state_boss_also_in_agents(processor):
    """Boss should appear both in bosses list AND as agent with agentType=main."""
    await processor.process_event({
        "event_type": "session_start",
        "session_id": "sess1",
        "timestamp": datetime.now().isoformat(),
        "data": {"project_name": "Proj", "project_dir": "/tmp/proj"},
    })

    state = await processor.get_merged_state()
    assert state is not None
    # Boss in bosses list
    assert len(state.bosses) == 1
    assert state.bosses[0].session_id == "sess1"
    # Boss also in agents as agentType="main"
    main_agents = [a for a in state.agents if a.agent_type == "main"]
    assert len(main_agents) == 1


@pytest.mark.asyncio
async def test_merged_state_bosses_have_project_info(processor):
    """Each boss should carry project_key and project_color."""
    await processor.process_event({
        "event_type": "session_start",
        "session_id": "sess1",
        "timestamp": datetime.now().isoformat(),
        "data": {"project_name": "My Project", "project_dir": "/tmp/proj"},
    })

    state = await processor.get_merged_state()
    assert state is not None
    boss = state.bosses[0]
    assert boss.session_id == "sess1"
    assert boss.project_key is not None
    assert boss.project_color is not None


@pytest.mark.asyncio
async def test_merged_state_bosses_sorted_by_session_id(processor):
    """Bosses should be sorted by session_id for stable ordering."""
    for sid in ["zzz", "aaa", "mmm"]:
        await processor.process_event({
            "event_type": "session_start",
            "session_id": sid,
            "timestamp": datetime.now().isoformat(),
            "data": {"project_name": f"Proj-{sid}", "project_dir": f"/tmp/{sid}"},
        })

    state = await processor.get_merged_state()
    assert state is not None
    session_ids = [b.session_id for b in state.bosses]
    assert session_ids == ["aaa", "mmm", "zzz"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd claude-office && uv run pytest backend/tests/test_multi_boss_merged.py -v`

- [ ] **Step 3: Rewrite `get_merged_state()`**

In `backend/app/core/event_processor.py`, modify the `get_merged_state()` method. **Keep** the existing boss-as-agent logic (lines ~296-316), but **add** real boss collection and replace the synthetic merged boss:

```python
    async def get_merged_state(self) -> GameState | None:
        """Build a merged GameState from all active sessions.

        Each session's boss appears BOTH as:
        1. A real Boss in the bosses list (for BossSprite animation)
        2. An Agent with agentType="main" in the agents list (unified data model)
        Bosses are sorted by session_id for stable ordering.
        """
        if not self.sessions:
            return None

        all_agents: list[Agent] = []
        all_bosses: list[Boss] = []
        all_arrival_queue: list[str] = []
        all_departure_queue: list[str] = []
        next_desk = 1
        latest_updated: datetime | None = None
        all_todos: list[TodoItem] = []
        all_conversation: list[ConversationEntry] = []
        active_session_ids: list[str] = []

        colors = [
            "#3B82F6", "#22C55E", "#A855F7", "#F97316",
            "#EC4899", "#06B6D4", "#EAB308", "#EF4444",
        ]

        for idx, (session_id, sm) in enumerate(self.sessions.items()):
            state = sm.to_game_state(session_id)
            short_id = session_id[:8]
            active_session_ids.append(session_id)

            # Get project info for this session
            # NOTE: get_project_for_session is synchronous — do NOT await
            project = self.project_registry.get_project_for_session(session_id)
            proj_color = project.color if project else colors[idx % len(colors)]

            # Collect real boss with identity info (for BossSprite)
            boss = state.boss.model_copy(update={
                "session_id": session_id,
                "project_key": project.key if project else None,
                "project_color": proj_color,
            })
            all_bosses.append(boss)

            # ALSO keep boss-as-agent in agents list (unified model)
            boss_agent_state = AgentState.WORKING
            if state.boss.state in (BossState.IDLE,):
                boss_agent_state = AgentState.WAITING
            elif state.boss.state in (BossState.WAITING_PERMISSION,):
                boss_agent_state = AgentState.WAITING_PERMISSION

            boss_as_agent = Agent(
                id=f"{short_id}:boss",
                agent_type="main",
                name=state.boss.current_task or short_id,
                color=proj_color,
                number=next_desk,
                state=boss_agent_state,
                desk=next_desk,
                current_task=state.boss.current_task,
                bubble=state.boss.bubble,
                session_id=session_id,
            )
            all_agents.append(boss_as_agent)
            next_desk += 1

            # Namespace all subagents from this session
            for agent in state.agents:
                namespaced = agent.model_copy(
                    update={
                        "id": f"{short_id}:{agent.id}",
                        "desk": next_desk,
                        "number": next_desk,
                        "session_id": session_id,
                    }
                )
                all_agents.append(namespaced)
                next_desk += 1

            # Only carry over agents that are actually arriving/departing
            arriving_agents = {a.id for a in state.agents if a.state == AgentState.ARRIVING}
            departing_agents = {a.id for a in state.agents if a.state == AgentState.COMPLETED}
            for aid in state.arrival_queue:
                if aid in arriving_agents:
                    all_arrival_queue.append(f"{short_id}:{aid}")
            for aid in state.departure_queue:
                if aid in departing_agents:
                    all_departure_queue.append(f"{short_id}:{aid}")

            if latest_updated is None or state.last_updated > latest_updated:
                latest_updated = state.last_updated

            all_todos.extend(state.todos)
            all_conversation.extend(state.conversation)

        # Sort bosses by session_id for stable ordering
        all_bosses.sort(key=lambda b: b.session_id or "")

        merged_office = OfficeState(
            desk_count=max(8, ((next_desk - 1 + 3) // 4) * 4),
            elevator_state=ElevatorState.CLOSED,
            phone_state=PhoneState.IDLE,
            context_utilization=0.0,
            tool_uses_since_compaction=0,
            print_report=False,
        )

        return GameState(
            session_id="__all__",
            boss=all_bosses[0] if all_bosses else Boss(state=BossState.IDLE),
            bosses=all_bosses,
            agents=all_agents,
            office=merged_office,
            last_updated=latest_updated or datetime.now(UTC),
            todos=all_todos,
            arrival_queue=all_arrival_queue,
            departure_queue=all_departure_queue,
            conversation=all_conversation,
        )
```

- [ ] **Step 4: Run tests**

Run: `cd claude-office && uv run pytest backend/tests/test_multi_boss_merged.py -v`
Expected: 4 passed

- [ ] **Step 5: Run existing tests**

Run: `cd claude-office && uv run pytest backend/tests/ -v --tb=short`
Fix any failures.

- [ ] **Step 6: Commit**

```bash
git add backend/app/core/event_processor.py backend/tests/test_multi_boss_merged.py
git commit -m "feat: collect real bosses in get_merged_state(), keep boss-as-agent"
```

---

### Task 4: Backend — Regenerate frontend types

**Files:**
- Regenerate: `frontend/src/types/generated.ts`

- [ ] **Step 1: Regenerate types**

Run: `cd claude-office && make gen-types`

If target doesn't exist, check `Makefile` and `frontend/package.json` for the type generation command.

- [ ] **Step 2: Verify generated types**

Check `generated.ts` has: `Boss` with `sessionId`, `projectKey`, `projectColor`; `GameState` with `bosses`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/generated.ts
git commit -m "chore: regenerate frontend types with Boss identity fields and GameState.bosses"
```

---

### Task 5: Frontend — Add boss positioning helpers

**Files:**
- Modify: `frontend/src/constants/positions.ts`

- [ ] **Step 1: Add getBossPositions**

```typescript
import type { Position } from "@/types";

// ============================================================================
// MULTI-BOSS POSITIONING
// ============================================================================

export const BOSS_ROW_Y = 900;
export const BOSS_RUG_OFFSET_Y = 40;
export const BOSS_SPACING = 280;
export const BOSS_HALF_WIDTH = 70;

export function getBossPositions(count: number, canvasWidth: number): Position[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: canvasWidth / 2, y: BOSS_ROW_Y }];

  const usableWidth = canvasWidth - BOSS_HALF_WIDTH * 2;
  const spacing = Math.min(BOSS_SPACING, usableWidth / (count - 1));
  const totalWidth = (count - 1) * spacing;
  const startX = (canvasWidth - totalWidth) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * spacing,
    y: BOSS_ROW_Y,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/constants/positions.ts
git commit -m "feat: add getBossPositions() for multi-boss layout"
```

---

### Task 6: Frontend — Add `label` prop to BossSprite

**Files:**
- Modify: `frontend/src/components/game/BossSprite.tsx`

- [ ] **Step 1: Add label to BossSpriteProps**

Add `label?: string;` to the `BossSpriteProps` interface.

- [ ] **Step 2: Update label rendering**

Find the hardcoded `"Claude"` text in the boss label section. Replace with `label ?? "Claude"`. Destructure `label` from props.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/BossSprite.tsx
git commit -m "feat: add label prop to BossSprite (defaults to 'Claude')"
```

---

### Task 7: Frontend — Add bosses state to gameStore

**Files:**
- Modify: `frontend/src/stores/gameStore.ts`

- [ ] **Step 1: Extend BossAnimationState with identity fields**

Find `interface BossAnimationState` and add:

```typescript
export interface BossAnimationState {
  backendState: BossState;
  position: Position;
  bubble: BubbleState;
  inUseBy: "arrival" | "departure" | null;
  currentTask: string | null;
  isTyping: boolean;
  // Identity fields for multi-boss
  sessionId?: string;
  projectKey?: string;
  projectColor?: string;
}
```

- [ ] **Step 2: Add bosses Map to store**

Add to `GameStore` interface:
```typescript
bosses: Map<string, BossAnimationState>;
```

Add to `initialState`:
```typescript
bosses: new Map<string, BossAnimationState>(),
```

- [ ] **Step 3: Add selector**

```typescript
export const selectBosses = (state: GameStore) => state.bosses;
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/stores/gameStore.ts
git commit -m "feat: add bosses Map to gameStore for multi-boss support"
```

---

### Task 8: Frontend — Update useWebSocketEvents to handle bosses

**Files:**
- Modify: `frontend/src/hooks/useWebSocketEvents.ts`

Boss state sync happens here, NOT in the store. Find the section that updates boss state (search for `updateBossBackendState`).

- [ ] **Step 1: Add multi-boss state sync**

After the existing single-boss update block, add:

```typescript
// Update multi-boss state (merged view)
const backendBosses = (state as any).bosses as Array<{
  state: BossState;
  currentTask?: string | null;
  bubble?: BubbleContent | null;
  sessionId?: string;
  projectKey?: string;
  projectColor?: string;
}> | undefined;

if (backendBosses && backendBosses.length > 0) {
  const currentBosses = store.bosses;
  const newBosses = new Map<string, BossAnimationState>();
  for (const bb of backendBosses) {
    const sid = bb.sessionId ?? "unknown";
    const existing = currentBosses.get(sid);
    newBosses.set(sid, {
      backendState: bb.state,
      position: existing?.position ?? { x: 640, y: 900 },
      bubble: existing?.bubble ?? { content: null, displayStartTime: null, queue: [] },
      inUseBy: existing?.inUseBy ?? null,
      currentTask: bb.currentTask ?? null,
      isTyping: existing?.isTyping ?? false,
      sessionId: sid,
      projectKey: bb.projectKey ?? undefined,
      projectColor: bb.projectColor ?? undefined,
    });
  }
  useGameStore.setState({ bosses: newBosses });
}
```

- [ ] **Step 2: Add per-boss bubble handling**

```typescript
if (backendBosses) {
  for (const bb of backendBosses) {
    if (bb.bubble) {
      const sid = bb.sessionId ?? "boss";
      const bubbleText = bb.bubble.text;
      const lastSeen = lastSeenBubbleTextRef.current.get(sid);
      if (bubbleText !== lastSeen) {
        lastSeenBubbleTextRef.current.set(sid, bubbleText);
        enqueueBubble(sid, bb.bubble);
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useWebSocketEvents.ts
git commit -m "feat: handle bosses array in WebSocket state updates"
```

---

### Task 9: Frontend — Update useFilteredData to return filtered bosses

**Files:**
- Modify: `frontend/src/hooks/useFilteredData.ts`

- [ ] **Step 1: Import selectBosses and add filtered bosses**

```typescript
import {
  useGameStore,
  selectAgents,
  selectEventLog,
  selectConversation,
  selectBoss,
  selectBosses,  // new
} from "@/stores/gameStore";
import type { AgentAnimationState, BossAnimationState } from "@/stores/gameStore";
```

Add to the hook body:

```typescript
const gameBosses = useGameStore(selectBosses);

const bosses = useMemo((): BossAnimationState[] => {
  const all = Array.from(gameBosses.values());
  if (!sessionIds) return all;
  return all.filter((b) => b.sessionId && sessionIds.has(b.sessionId));
}, [gameBosses, sessionIds]);
```

- [ ] **Step 2: Update return value**

```typescript
return { agents, boss, bosses, events, conversation, sessionIds };
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useFilteredData.ts
git commit -m "feat: add filtered bosses to useFilteredData hook"
```

---

### Task 10: Frontend — Render multiple bosses in OfficeRoom

**Files:**
- Modify: `frontend/src/components/game/OfficeRoom.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { getBossPositions, BOSS_RUG_OFFSET_Y } from "@/constants/positions";
import { CANVAS_WIDTH } from "@/constants/canvas";
import { selectBosses } from "@/stores/gameStore";
```

- [ ] **Step 2: Add bosses data source and position computation**

```typescript
const storeBosses = useGameStore(selectBosses);
const sessionId = useGameStore((s) => s.sessionId);
const isMergedView = sessionId === "__all__";

const bossPositions = useMemo(() => {
  if (!isMergedView || !storeBosses.size) return [];
  return getBossPositions(storeBosses.size, CANVAS_WIDTH);
}, [isMergedView, storeBosses.size]);

const sortedBosses = useMemo(() => {
  if (!isMergedView) return [];
  return Array.from(storeBosses.entries()).sort(([a], [b]) => a.localeCompare(b));
}, [isMergedView, storeBosses]);
```

- [ ] **Step 3: Filter out main agents from desk rendering**

The desk grid should only render subagents. In the existing `roomSubagents` / `storeAgents` logic, filter by `agentType !== "main"` in merged view:

```typescript
// In merged view, filter out main agents from desk rendering (they get BossSprite)
const deskAgents = useMemo(() => {
  if (!isMergedView) return storeAgents;
  const filtered = new Map<string, AgentAnimationState>();
  for (const [id, agent] of storeAgents) {
    if (agent.agentType !== "main") filtered.set(id, agent);
  }
  return filtered;
}, [isMergedView, storeAgents]);
```

Use `deskAgents` instead of `storeAgents` for desk count calculation and desk rendering.

- [ ] **Step 4: Replace single boss with multi-boss rendering**

Find the boss rendering section (BossSprite + bossRug). Wrap in condition:

```tsx
{isMergedView && sortedBosses.length > 0 ? (
  // Multi-boss
  <>
    {sortedBosses.map(([sid, boss], i) => (
      <Fragment key={sid}>
        {textures.bossRug && (
          <pixiSprite
            texture={textures.bossRug}
            anchor={0.5}
            x={bossPositions[i].x}
            y={bossPositions[i].y + BOSS_RUG_OFFSET_Y}
            scale={0.3}
          />
        )}
        <BossSprite
          position={bossPositions[i]}
          state={boss.backendState}
          bubble={boss.bubble.content}
          inUseBy={boss.inUseBy}
          currentTask={boss.currentTask}
          chairTexture={textures.chair}
          deskTexture={textures.desk}
          keyboardTexture={textures.keyboard}
          monitorTexture={textures.monitor}
          phoneTexture={textures.phone}
          headsetTexture={textures.headset}
          sunglassesTexture={textures.sunglasses}
          isTyping={boss.isTyping}
          label={boss.projectKey ?? sid.slice(0, 8)}
        />
      </Fragment>
    ))}
  </>
) : (
  // Single boss (existing code unchanged)
  <>
    {textures.bossRug && (
      <pixiSprite
        texture={textures.bossRug}
        anchor={0.5}
        x={BOSS_RUG_POSITION.x}
        y={BOSS_RUG_POSITION.y}
        scale={0.3}
      />
    )}
    <BossSprite
      position={bossPosition}
      state={bossState}
      bubble={bossBubble}
      inUseBy={storeBoss.inUseBy}
      currentTask={bossCurrentTask}
      chairTexture={textures.chair}
      deskTexture={textures.desk}
      keyboardTexture={textures.keyboard}
      monitorTexture={textures.monitor}
      phoneTexture={textures.phone}
      headsetTexture={textures.headset}
      sunglassesTexture={textures.sunglasses}
      isTyping={storeBoss.isTyping}
    />
  </>
)}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/game/OfficeRoom.tsx
git commit -m "feat: render multiple bosses in Whole Office merged view"
```

---

### Task 11: Frontend — Refactor queue positions for per-boss routing

**Files:**
- Modify: `frontend/src/systems/queuePositions.ts`
- Modify: `frontend/src/machines/agentMachineService.ts`
- Modify: `frontend/src/machines/positionHelpers.ts`

Agent choreography currently routes all agents to a single hardcoded boss position. In merged view, agents should walk to **their session's boss**.

- [ ] **Step 1: Add dynamic boss slot functions to queuePositions.ts**

Keep existing constants (single-session still uses them). Add new functions:

```typescript
/**
 * Get boss slot position relative to a specific boss's position.
 * Used in merged view where multiple bosses exist.
 */
export function getBossSlotForPosition(
  bossPos: Position,
  type: QueueType,
): Position {
  const offsetX = type === "arrival" ? -120 : 120;
  return { x: bossPos.x + offsetX, y: bossPos.y - 32 };
}

/**
 * Get ready position (queue head) relative to a boss position.
 */
export function getReadyPositionForBoss(
  bossPos: Position,
  type: QueueType,
): Position {
  const offsetX = type === "arrival" ? -160 : 160;
  return { x: bossPos.x + offsetX, y: bossPos.y + 30 };
}
```

The offsets are derived from the current constants:
- `BOSS_SLOT_LEFT` = `{x: 520, y: 868}` = boss(640,900) + (-120, -32)
- `BOSS_SLOT_RIGHT` = `{x: 760, y: 868}` = boss(640,900) + (+120, -32)
- `ARRIVAL_QUEUE_POSITIONS[0]` = `{x: 480, y: 930}` = boss(640,900) + (-160, +30)
- `DEPARTURE_QUEUE_POSITIONS[0]` = `{x: 800, y: 930}` = boss(640,900) + (+160, +30)

- [ ] **Step 2: Update agentMachineService.ts to look up boss position**

In `agentMachineService.ts`, when agents need to walk to boss, look up the agent's `sessionId`, find the matching boss in `useGameStore.getState().bosses`, and use `getBossSlotForPosition()` with that boss's position instead of the hardcoded `BOSS_SLOT_LEFT`/`BOSS_SLOT_RIGHT`.

Find calls to `getQueuePosition()` and `getBossSlot()`. For merged view (`sessionId === "__all__"`), use dynamic lookup:

```typescript
function getAgentBossPosition(agentId: string): Position {
  const store = useGameStore.getState();
  if (store.sessionId !== "__all__") return BOSS_POSITION;
  
  const agent = store.agents.get(agentId);
  if (!agent?.sessionId) return BOSS_POSITION;
  
  const boss = store.bosses.get(agent.sessionId);
  return boss?.position ?? BOSS_POSITION;
}
```

- [ ] **Step 3: Update positionHelpers.ts**

`getReadyPosition()` currently returns fixed positions. Add a variant that accepts boss position:

```typescript
export function getReadyPositionForBoss(
  bossPos: Position,
  queueType: QueueType,
): Position {
  return queuePositions.getReadyPositionForBoss(bossPos, queueType);
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/systems/queuePositions.ts frontend/src/machines/agentMachineService.ts frontend/src/machines/positionHelpers.ts
git commit -m "feat: per-boss agent routing via sessionId in choreography"
```

---

### Task 12: Frontend — Per-boss compaction animation

**Files:**
- Modify: `frontend/src/systems/compactionAnimation.ts`

- [ ] **Step 1: Update compaction to use per-boss position**

Currently `useCompactionAnimation()` uses `selectBoss` (singular) and animates one boss. In merged view, compaction happens per-session, so each boss should animate independently.

Find where `boss.position` is used for the trash can walk. In merged view, look up the compacting boss by checking which session triggered compaction (from the event data or `toolUsesSinceCompaction` reset), and use that boss's position.

Simplest approach: if `sessionId === "__all__"`, skip compaction animation entirely (it's a per-session detail). Or animate only the primary boss (`boss` from store).

- [ ] **Step 2: Commit**

```bash
git add frontend/src/systems/compactionAnimation.ts
git commit -m "feat: handle compaction animation in merged view"
```

---

### Task 13: Integration test — Visual verification

- [ ] **Step 1: Start dev server**

Run: `cd claude-office && make dev-tmux`

- [ ] **Step 2: Test Whole Office with multiple sessions**

Open `http://localhost:3000`, click "Whole Office". Use SIMULATE button or `make simulate`.

Verify:
- Multiple bosses appear at bottom in a row, each with rug
- Each boss shows project name as label
- Subagents in desk rows above (no boss-as-agent on desks)
- Single session view still shows one boss (unchanged)
- Agent arrival/departure walks to correct boss (if per-boss routing done)
- Bubbles appear on the correct boss

- [ ] **Step 3: Fix issues and commit**

---

### Task 14: Run full test suite

- [ ] **Step 1: Backend tests**

Run: `cd claude-office && cd backend && uv run pytest tests/ -v --tb=short`

- [ ] **Step 2: Frontend checks**

Run: `cd claude-office && cd frontend && bun run typecheck && bun run lint`

- [ ] **Step 3: Fix and commit**

```bash
git add -A
git commit -m "fix: resolve test/lint issues from multi-boss changes"
```
