# DRY Agent Conversion + Replay UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated AgentAnimationState→Agent conversion to a utility, and expose the existing replay infrastructure via UI controls.

**Tech Stack:** TypeScript/React, PixiJS, Zustand

---

### Task 1: DRY agent type conversion

**Files:**
- Create: `frontend/src/utils/agentConvert.ts`
- Modify: `frontend/src/components/game/OfficeGame.tsx` — use utility in sessionRooms and enrichedProjects

- [ ] **Step 1: Write failing test**

```typescript
// tests/agentConvert.test.ts
import { animationStateToAgent } from "../src/utils/agentConvert";

test("converts AgentAnimationState to Agent", () => {
  const anim = {
    id: "abc", agentType: "subagent", name: "Test",
    color: "#ff0000", number: 1, desk: 2,
    backendState: "working", currentTask: "Fix bug",
    sessionId: "sess-1", bubble: { content: null, displayStartTime: null, queue: [] },
    // ... other fields
  };
  const agent = animationStateToAgent(anim as any);
  expect(agent.id).toBe("abc");
  expect(agent.state).toBe("working");
  expect(agent.sessionId).toBe("sess-1");
});
```

- [ ] **Step 2: Implement utility**

```typescript
// src/utils/agentConvert.ts
import type { AgentAnimationState } from "@/stores/gameStore";
import type { Agent } from "@/types/generated";

export function animationStateToAgent(agent: AgentAnimationState): Agent {
  return {
    id: agent.id,
    agentType: agent.agentType,
    name: agent.name ?? undefined,
    color: agent.color,
    number: agent.number,
    state: agent.backendState,
    desk: agent.desk ?? undefined,
    currentTask: agent.currentTask ?? undefined,
    sessionId: agent.sessionId ?? undefined,
    bubble: agent.bubble?.content ?? undefined,
  };
}
```

- [ ] **Step 3: Replace duplicate code in OfficeGame.tsx**

Both `sessionRooms` and `enrichedProjects` have identical conversion blocks. Replace with `animationStateToAgent(agent)`.

- [ ] **Step 4: Run tests, verify compilation**
- [ ] **Step 5: Commit**

---

### Task 2: Replay UI controls

**Files:**
- Create: `frontend/src/components/overlay/ReplayControls.tsx`
- Modify: `frontend/src/components/layout/SessionSidebar.tsx` — add replay button to session cards
- Modify: `frontend/src/app/page.tsx` — wire replay state

- [ ] **Step 1: Check existing replay infrastructure**

```bash
grep -n "replay\|Replay" frontend/src/stores/gameStore.ts | head -20
grep -n "replay" frontend/src/app/page.tsx | head -10
grep -n "/replay" frontend/src/hooks/useSessions.ts | head -5
```

- [ ] **Step 2: Create ReplayControls component**

A floating overlay with:
- Play/Pause button
- Speed selector (0.5x, 1x, 2x, 4x)
- Progress bar (current event / total events)
- Stop button (exit replay mode)

- [ ] **Step 3: Add replay button to session cards in SessionSidebar**

Next to the delete button, add a play icon button that:
1. Fetches `/api/v1/sessions/{id}/replay`
2. Loads events into gameStore via `setReplayEvents()`
3. Sets `isReplaying = true`

- [ ] **Step 4: Wire replay state in page.tsx**

Show `<ReplayControls />` overlay when `isReplaying === true`.

- [ ] **Step 5: Verify — click replay on a completed session, watch events play back**
- [ ] **Step 6: Commit**
