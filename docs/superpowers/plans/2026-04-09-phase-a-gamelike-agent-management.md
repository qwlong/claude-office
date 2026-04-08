# Phase A: Game-like Agent Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive agent management to the office visualization — click agents for details, send messages, pause/resume/kill, click rooms to spawn agents.

**Architecture:** PixiJS handles click detection on sprites and rooms, writes selected state to Zustand gameStore. React overlay components (AgentDetailPanel, AgentContextMenu) subscribe to store and render. Backend proxies control commands through existing AOAdapter to Agent Orchestrator.

**Tech Stack:** PixiJS 8, React 19, Zustand 5, FastAPI, AOAdapter (existing)

---

## File Structure

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/overlay/AgentDetailPanel.tsx` | Slide-out panel with agent info + action buttons |
| `frontend/src/components/overlay/AgentContextMenu.tsx` | Right-click context menu for quick actions |
| `frontend/src/hooks/useAgentActions.ts` | Hook wrapping fetch calls to backend agent control endpoints |
| `frontend/vitest.config.ts` | Vitest configuration (project has vitest dep but no config yet) |
| `frontend/src/__tests__/agentSelection.test.ts` | Tests for gameStore selection state |
| `frontend/src/__tests__/agentDetailPanel.test.tsx` | Tests for AgentDetailPanel component |
| `frontend/src/__tests__/agentContextMenu.test.tsx` | Tests for AgentContextMenu component |
| `backend/tests/test_agent_controls.py` | Tests for new agent control endpoints |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/stores/gameStore.ts` | Add `selectedAgentId`, `contextMenuAgent`, selectors, actions |
| `frontend/src/components/game/AgentSprite.tsx` | Add `eventMode="static"`, pointer handlers, `onSelect` prop |
| `frontend/src/components/game/OfficeRoom.tsx` | Wire `onSelect` to AgentSprite, add room click for spawn |
| `frontend/src/components/game/shared/drawArm.ts` | Add `drawRaisedArm()` for waiting_permission pose |
| `frontend/src/app/page.tsx` | Render `<AgentDetailPanel>` and `<AgentContextMenu>` overlays |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/app/api/routes/agents.py` | Add message/pause/resume/kill/status endpoints |
| `backend/app/services/adapters/ao.py` | Add `pause()`, `resume()`, `kill()`, `get_session_status()` |
| `backend/app/services/adapters/__init__.py` | Extend `TaskAdapter` protocol with control methods |

---

## Task 1: Add selectedAgentId and contextMenuAgent to gameStore

**Files:**
- Modify: `frontend/src/stores/gameStore.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/__tests__/agentSelection.test.ts`

### Step 1: Create vitest config

- [ ] **Create `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Verify:** `cd frontend && npx vitest run --passWithNoTests` exits 0.

### Step 2: Write failing tests for selection state

- [ ] **Create `frontend/src/__tests__/agentSelection.test.ts`:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@/stores/gameStore";

describe("Agent Selection State", () => {
  beforeEach(() => {
    // Reset store between tests
    useGameStore.setState({
      selectedAgentId: null,
      contextMenuAgent: null,
    });
  });

  it("initializes with no selection", () => {
    const state = useGameStore.getState();
    expect(state.selectedAgentId).toBeNull();
    expect(state.contextMenuAgent).toBeNull();
  });

  it("setSelectedAgent sets the selected agent ID", () => {
    useGameStore.getState().setSelectedAgent("agent-123");
    expect(useGameStore.getState().selectedAgentId).toBe("agent-123");
  });

  it("clearSelection clears selectedAgentId and contextMenuAgent", () => {
    useGameStore.getState().setSelectedAgent("agent-123");
    useGameStore.getState().setContextMenuAgent({
      agentId: "agent-123",
      viewportX: 100,
      viewportY: 200,
    });
    useGameStore.getState().clearSelection();
    expect(useGameStore.getState().selectedAgentId).toBeNull();
    expect(useGameStore.getState().contextMenuAgent).toBeNull();
  });

  it("setContextMenuAgent stores agent and viewport position", () => {
    useGameStore.getState().setContextMenuAgent({
      agentId: "agent-456",
      viewportX: 300,
      viewportY: 400,
    });
    const ctx = useGameStore.getState().contextMenuAgent;
    expect(ctx).not.toBeNull();
    expect(ctx!.agentId).toBe("agent-456");
    expect(ctx!.viewportX).toBe(300);
    expect(ctx!.viewportY).toBe(400);
  });

  it("setSelectedAgent clears contextMenuAgent", () => {
    useGameStore.getState().setContextMenuAgent({
      agentId: "agent-456",
      viewportX: 300,
      viewportY: 400,
    });
    useGameStore.getState().setSelectedAgent("agent-456");
    expect(useGameStore.getState().selectedAgentId).toBe("agent-456");
    expect(useGameStore.getState().contextMenuAgent).toBeNull();
  });
});
```

- [ ] **Verify tests fail:** `cd frontend && npx vitest run src/__tests__/agentSelection.test.ts` — should fail because `selectedAgentId`, `setSelectedAgent`, etc. don't exist yet.

### Step 3: Implement selection state in gameStore

- [ ] **Add types and interface to `frontend/src/stores/gameStore.ts`.**

After the `EventLogEntry` type (around line 122), add:

```typescript
/**
 * Context menu state for an agent — stores agent ID and viewport position.
 */
export interface ContextMenuAgent {
  agentId: string;
  viewportX: number;
  viewportY: number;
}
```

In the `GameStore` interface, inside the `// ========== UI State ==========` section (around line 236), add these fields after `currentReplayIndex`:

```typescript
  // Agent interaction
  selectedAgentId: string | null;
  contextMenuAgent: ContextMenuAgent | null;

  // Agent interaction actions
  setSelectedAgent: (agentId: string | null) => void;
  clearSelection: () => void;
  setContextMenuAgent: (ctx: ContextMenuAgent | null) => void;
```

In `initialState` (around line 346), add after `currentReplayIndex: -1`:

```typescript
  // Agent interaction
  selectedAgentId: null as string | null,
  contextMenuAgent: null as ContextMenuAgent | null,
```

In the store implementation, add after the debug toggle actions (before `// ========== Top-level Actions ==========`):

```typescript
    // ========================================================================
    // AGENT INTERACTION ACTIONS
    // ========================================================================

    setSelectedAgent: (agentId) =>
      set({ selectedAgentId: agentId, contextMenuAgent: null }),

    clearSelection: () =>
      set({ selectedAgentId: null, contextMenuAgent: null }),

    setContextMenuAgent: (ctx) =>
      set({ contextMenuAgent: ctx }),
```

In the `reset` and `resetForSessionSwitch` actions, add to the reset object:

```typescript
      selectedAgentId: null,
      contextMenuAgent: null,
```

### Step 4: Add selectors

- [ ] **Add selectors at the bottom of `frontend/src/stores/gameStore.ts`** after the existing selectors (around line 1209):

```typescript
export const selectSelectedAgentId = (state: GameStore) =>
  state.selectedAgentId;
export const selectContextMenuAgent = (state: GameStore) =>
  state.contextMenuAgent;
export const selectSelectedAgent = (state: GameStore): AgentAnimationState | null => {
  if (!state.selectedAgentId) return null;
  return state.agents.get(state.selectedAgentId) ?? null;
};
```

- [ ] **Verify tests pass:** `cd frontend && npx vitest run src/__tests__/agentSelection.test.ts`
- [ ] **Verify types:** `cd frontend && npx tsc --noEmit`
- [ ] **Commit:** `feat(gameStore): add selectedAgentId and contextMenuAgent state`

---

## Task 2: Make AgentSprite clickable

**Files:**
- Modify: `frontend/src/components/game/AgentSprite.tsx`
- Modify: `frontend/src/components/game/OfficeRoom.tsx`

No separate test file — PixiJS interaction testing requires a full canvas context and is impractical to unit test.

### Step 1: Add click callback prop to AgentSprite

- [ ] **Modify `frontend/src/components/game/AgentSprite.tsx`.**

Add to the `AgentSpriteProps` interface:

```typescript
  onSelect?: (agentId: string) => void;
  onContextMenu?: (agentId: string, globalX: number, globalY: number) => void;
```

In `AgentSpriteComponent`, destructure the new props:

```typescript
function AgentSpriteComponent({
  id,           // was: id: _id
  name,
  color,
  number: _number,
  position,
  phase: _phase,
  bubble,
  headsetTexture: _headsetTexture,
  sunglassesTexture,
  renderBubble = true,
  renderLabel = true,
  isTyping: _isTyping = false,
  onSelect,
  onContextMenu,
}: AgentSpriteProps): ReactNode {
```

Add click handlers (before the `return`):

```typescript
  // Click handler for selection
  const handlePointerDown = useCallback(
    (e: { button: number; global: { x: number; y: number } }) => {
      if (e.button === 2 && onContextMenu) {
        // Right-click — context menu
        onContextMenu(id, e.global.x, e.global.y);
      } else if (e.button === 0 && onSelect) {
        // Left-click — select
        onSelect(id);
      }
    },
    [id, onSelect, onContextMenu],
  );
```

Add the import for `useCallback` (already imported at top).

Change the outermost `<pixiContainer>` in the return to add interaction:

```tsx
    <pixiContainer
      x={position.x}
      y={position.y}
      eventMode="static"
      cursor="pointer"
      onPointerDown={handlePointerDown}
    >
```

### Step 2: Wire up in OfficeRoom

- [ ] **Modify `frontend/src/components/game/OfficeRoom.tsx`.**

Add imports at the top:

```typescript
import { useGameStore } from "@/stores/gameStore";
// Already imported, just add to the destructured imports:
// (no new import needed — useGameStore is already imported)
```

Inside the `OfficeRoom` component, add handler functions after the existing `useMemo` calls:

```typescript
  // Agent selection handlers
  const handleAgentSelect = useCallback((agentId: string) => {
    useGameStore.getState().setSelectedAgent(agentId);
  }, []);

  const handleAgentContextMenu = useCallback(
    (agentId: string, globalX: number, globalY: number) => {
      useGameStore.getState().setContextMenuAgent({
        agentId,
        viewportX: globalX,
        viewportY: globalY,
      });
    },
    [],
  );
```

Add `useCallback` to the import from React (already imported).

Pass the handlers to every `<AgentSprite>` in both overview-mode and all-merged-mode render blocks. For the all-merged mode agents (around line 307):

```tsx
                <AgentSprite
                  id={agent.id}
                  name={agent.name}
                  color={agent.color}
                  number={agent.number}
                  position={agent.currentPosition}
                  phase={agent.phase}
                  bubble={agent.bubble.content}
                  headsetTexture={textures.headset}
                  sunglassesTexture={textures.sunglasses}
                  renderBubble={false}
                  renderLabel={false}
                  isTyping={agent.isTyping}
                  onSelect={handleAgentSelect}
                  onContextMenu={handleAgentContextMenu}
                />
```

And similarly for the overview-mode agents (around line 277):

```tsx
                <AgentSprite
                  id={agent.id}
                  name={agent.name ?? null}
                  color={agent.color}
                  number={agent.number}
                  position={{ x: desk.x, y: desk.y }}
                  phase="idle"
                  bubble={agent.bubble ?? null}
                  headsetTexture={textures.headset}
                  sunglassesTexture={textures.sunglasses}
                  renderBubble={false}
                  renderLabel={false}
                  isTyping={agent.state === "working"}
                  onSelect={handleAgentSelect}
                  onContextMenu={handleAgentContextMenu}
                />
```

- [ ] **Verify types:** `cd frontend && npx tsc --noEmit`
- [ ] **Verify lint:** `cd frontend && npx eslint src/components/game/AgentSprite.tsx src/components/game/OfficeRoom.tsx`
- [ ] **Commit:** `feat(AgentSprite): make agents clickable with left-click select and right-click context menu`

---

## Task 3: Create AgentDetailPanel overlay component

**Files:**
- Create: `frontend/src/components/overlay/AgentDetailPanel.tsx`
- Create: `frontend/src/hooks/useAgentActions.ts`
- Create: `frontend/src/__tests__/agentDetailPanel.test.tsx`
- Modify: `frontend/src/app/page.tsx`

### Step 1: Create the useAgentActions hook

- [ ] **Create `frontend/src/hooks/useAgentActions.ts`:**

```typescript
"use client";

import { useCallback, useState } from "react";

const API_BASE = "http://localhost:8000/api/v1/agents";

export interface AgentActions {
  sendMessage: (sessionId: string, text: string) => Promise<boolean>;
  pause: (sessionId: string) => Promise<boolean>;
  resume: (sessionId: string) => Promise<boolean>;
  kill: (sessionId: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}

export function useAgentActions(): AgentActions {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callEndpoint = useCallback(
    async (sessionId: string, action: string, body?: object): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${API_BASE}/${sessionId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({ detail: "Request failed" }));
          setError(data.detail ?? `Error ${resp.status}`);
          return false;
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    (sessionId: string, text: string) =>
      callEndpoint(sessionId, "message", { text }),
    [callEndpoint],
  );

  const pause = useCallback(
    (sessionId: string) => callEndpoint(sessionId, "pause"),
    [callEndpoint],
  );

  const resume = useCallback(
    (sessionId: string) => callEndpoint(sessionId, "resume"),
    [callEndpoint],
  );

  const kill = useCallback(
    (sessionId: string) => callEndpoint(sessionId, "kill"),
    [callEndpoint],
  );

  return { sendMessage, pause, resume, kill, loading, error };
}
```

### Step 2: Write failing tests for AgentDetailPanel

- [ ] **Create `frontend/src/__tests__/agentDetailPanel.test.tsx`:**

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useGameStore } from "@/stores/gameStore";
import { AgentDetailPanel } from "@/components/overlay/AgentDetailPanel";
import type { AgentAnimationState, BubbleState } from "@/stores/gameStore";

// Mock useAgentActions
vi.mock("@/hooks/useAgentActions", () => ({
  useAgentActions: () => ({
    sendMessage: vi.fn().mockResolvedValue(true),
    pause: vi.fn().mockResolvedValue(true),
    resume: vi.fn().mockResolvedValue(true),
    kill: vi.fn().mockResolvedValue(true),
    loading: false,
    error: null,
  }),
}));

function createMockAgent(overrides: Partial<AgentAnimationState> = {}): AgentAnimationState {
  const bubble: BubbleState = {
    content: null,
    displayStartTime: null,
    queue: [],
  };
  return {
    id: "test-agent-1",
    name: "TestBot",
    color: "#FF6B6B",
    number: 1,
    desk: 1,
    backendState: "working",
    currentTask: "Fix login bug",
    phase: "idle",
    currentPosition: { x: 400, y: 500 },
    targetPosition: { x: 400, y: 500 },
    path: null,
    bubble,
    queueType: null,
    queueIndex: -1,
    isTyping: true,
    ...overrides,
  };
}

describe("AgentDetailPanel", () => {
  beforeEach(() => {
    const agents = new Map();
    agents.set("test-agent-1", createMockAgent());
    useGameStore.setState({
      agents,
      selectedAgentId: null,
      contextMenuAgent: null,
    });
  });

  it("renders nothing when no agent is selected", () => {
    const { container } = render(<AgentDetailPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("renders agent name when selected", () => {
    useGameStore.setState({ selectedAgentId: "test-agent-1" });
    render(<AgentDetailPanel />);
    expect(screen.getByText("TestBot")).toBeInTheDocument();
  });

  it("shows agent status", () => {
    useGameStore.setState({ selectedAgentId: "test-agent-1" });
    render(<AgentDetailPanel />);
    expect(screen.getByText(/working/i)).toBeInTheDocument();
  });

  it("shows current task", () => {
    useGameStore.setState({ selectedAgentId: "test-agent-1" });
    render(<AgentDetailPanel />);
    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", () => {
    useGameStore.setState({ selectedAgentId: "test-agent-1" });
    render(<AgentDetailPanel />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useGameStore.getState().selectedAgentId).toBeNull();
  });

  it("has Send Message, Pause, and Kill buttons", () => {
    useGameStore.setState({ selectedAgentId: "test-agent-1" });
    render(<AgentDetailPanel />);
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kill/i })).toBeInTheDocument();
  });
});
```

- [ ] **Verify tests fail:** `cd frontend && npx vitest run src/__tests__/agentDetailPanel.test.tsx`

### Step 3: Implement AgentDetailPanel

- [ ] **Create `frontend/src/components/overlay/AgentDetailPanel.tsx`:**

```tsx
"use client";

import { useEffect, useCallback, useState, type ReactNode } from "react";
import { X, Send, Pause, Play, Skull, Copy, Check } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  useGameStore,
  selectSelectedAgentId,
  selectSelectedAgent,
} from "@/stores/gameStore";
import { useAgentActions } from "@/hooks/useAgentActions";

// ============================================================================
// STATUS BADGE
// ============================================================================

function StatusBadge({ state }: { state: string }): ReactNode {
  const colorMap: Record<string, string> = {
    working: "bg-green-500",
    thinking: "bg-blue-500",
    waiting_permission: "bg-amber-500",
    arriving: "bg-sky-400",
    reporting: "bg-purple-500",
    completed: "bg-emerald-600",
    waiting: "bg-yellow-500",
    leaving: "bg-gray-400",
  };
  const color = colorMap[state] ?? "bg-gray-500";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold text-white ${color}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
      {state.replace(/_/g, " ")}
    </span>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AgentDetailPanel(): ReactNode {
  const selectedAgentId = useGameStore(selectSelectedAgentId);
  const agent = useGameStore(useShallow(selectSelectedAgent));
  const clearSelection = useGameStore((s) => s.clearSelection);
  const { sendMessage, pause, resume, kill, loading, error } = useAgentActions();

  const [messageText, setMessageText] = useState("");
  const [copied, setCopied] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    if (selectedAgentId) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => document.removeEventListener("keydown", handleEsc);
  }, [selectedAgentId, clearSelection]);

  if (!selectedAgentId || !agent) return null;

  const handleSend = async () => {
    if (!messageText.trim()) return;
    const ok = await sendMessage(agent.id, messageText.trim());
    if (ok) setMessageText("");
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(agent.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPaused = agent.backendState === "waiting";
  const isWaitingPermission = agent.backendState === "waiting_permission";

  return (
    <div className="fixed top-0 right-0 h-full w-[380px] z-40 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: agent.color }}
          />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {agent.name ?? `Agent #${agent.number}`}
            </h2>
            <StatusBadge state={agent.backendState} />
          </div>
        </div>
        <button
          onClick={clearSelection}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Info Section */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Session ID */}
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Session ID
          </label>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono truncate flex-1">
              {agent.id}
            </code>
            <button
              onClick={handleCopyId}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              aria-label="Copy Session ID"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Current Task */}
        {agent.currentTask && (
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Current Task
            </label>
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
              {agent.currentTask}
            </p>
          </div>
        )}

        {/* Desk */}
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Desk
          </label>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
            {agent.desk ? `#${agent.desk}` : "Not assigned"}
          </p>
        </div>

        {/* Phase */}
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Phase
          </label>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
            {agent.phase.replace(/_/g, " ")}
          </p>
        </div>

        {/* Warning for waiting permission */}
        {isWaitingPermission && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              This agent is waiting for permission to proceed.
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Send a message..."
            className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !messageText.trim()}
            className="p-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 text-white rounded-lg transition-colors"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
        {isPaused ? (
          <button
            onClick={() => resume(agent.id)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
            aria-label="Resume agent"
          >
            <Play size={14} />
            Resume
          </button>
        ) : (
          <button
            onClick={() => pause(agent.id)}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
            aria-label="Pause agent"
          >
            <Pause size={14} />
            Pause
          </button>
        )}
        <button
          onClick={() => {
            if (window.confirm(`Kill agent ${agent.name ?? agent.id}?`)) {
              kill(agent.id);
            }
          }}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 text-white text-sm font-bold rounded-lg transition-colors"
          aria-label="Kill agent"
        >
          <Skull size={14} />
          Kill
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Verify tests pass:** `cd frontend && npx vitest run src/__tests__/agentDetailPanel.test.tsx`

### Step 4: Wire AgentDetailPanel into page.tsx

- [ ] **Modify `frontend/src/app/page.tsx`.**

Add import near the top (after the existing overlay imports):

```typescript
import { AgentDetailPanel } from "@/components/overlay/AgentDetailPanel";
```

Add `<AgentDetailPanel />` inside the main layout JSX, after the `<OfficeGame>` component and before the closing tag of the main container. Place it as a sibling of other overlay elements:

```tsx
        <AgentDetailPanel />
```

- [ ] **Verify types:** `cd frontend && npx tsc --noEmit`
- [ ] **Commit:** `feat(AgentDetailPanel): add slide-out panel with agent info and action buttons`

---

## Task 4: Create AgentContextMenu component

**Files:**
- Create: `frontend/src/components/overlay/AgentContextMenu.tsx`
- Create: `frontend/src/__tests__/agentContextMenu.test.tsx`
- Modify: `frontend/src/app/page.tsx`

### Step 1: Write failing tests

- [ ] **Create `frontend/src/__tests__/agentContextMenu.test.tsx`:**

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useGameStore } from "@/stores/gameStore";
import { AgentContextMenu } from "@/components/overlay/AgentContextMenu";
import type { AgentAnimationState, BubbleState } from "@/stores/gameStore";

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

// Mock useAgentActions
vi.mock("@/hooks/useAgentActions", () => ({
  useAgentActions: () => ({
    sendMessage: vi.fn().mockResolvedValue(true),
    pause: vi.fn().mockResolvedValue(true),
    resume: vi.fn().mockResolvedValue(true),
    kill: vi.fn().mockResolvedValue(true),
    loading: false,
    error: null,
  }),
}));

function createMockAgent(): AgentAnimationState {
  const bubble: BubbleState = {
    content: null,
    displayStartTime: null,
    queue: [],
  };
  return {
    id: "ctx-agent-1",
    name: "CtxBot",
    color: "#4488FF",
    number: 2,
    desk: 2,
    backendState: "working",
    currentTask: null,
    phase: "idle",
    currentPosition: { x: 300, y: 400 },
    targetPosition: { x: 300, y: 400 },
    path: null,
    bubble,
    queueType: null,
    queueIndex: -1,
    isTyping: false,
  };
}

describe("AgentContextMenu", () => {
  beforeEach(() => {
    const agents = new Map();
    agents.set("ctx-agent-1", createMockAgent());
    useGameStore.setState({
      agents,
      selectedAgentId: null,
      contextMenuAgent: null,
    });
  });

  it("renders nothing when contextMenuAgent is null", () => {
    const { container } = render(<AgentContextMenu />);
    expect(container.innerHTML).toBe("");
  });

  it("renders menu at viewport position", () => {
    useGameStore.setState({
      contextMenuAgent: {
        agentId: "ctx-agent-1",
        viewportX: 200,
        viewportY: 300,
      },
    });
    render(<AgentContextMenu />);
    expect(screen.getByText("CtxBot")).toBeInTheDocument();
  });

  it("has Pause and Kill options", () => {
    useGameStore.setState({
      contextMenuAgent: {
        agentId: "ctx-agent-1",
        viewportX: 200,
        viewportY: 300,
      },
    });
    render(<AgentContextMenu />);
    expect(screen.getByText(/pause/i)).toBeInTheDocument();
    expect(screen.getByText(/kill/i)).toBeInTheDocument();
  });

  it("has Copy Session ID option", () => {
    useGameStore.setState({
      contextMenuAgent: {
        agentId: "ctx-agent-1",
        viewportX: 200,
        viewportY: 300,
      },
    });
    render(<AgentContextMenu />);
    expect(screen.getByText(/copy session id/i)).toBeInTheDocument();
  });

  it("opens detail panel when View Details is clicked", () => {
    useGameStore.setState({
      contextMenuAgent: {
        agentId: "ctx-agent-1",
        viewportX: 200,
        viewportY: 300,
      },
    });
    render(<AgentContextMenu />);
    fireEvent.click(screen.getByText(/view details/i));
    expect(useGameStore.getState().selectedAgentId).toBe("ctx-agent-1");
    expect(useGameStore.getState().contextMenuAgent).toBeNull();
  });

  it("closes on Escape", () => {
    useGameStore.setState({
      contextMenuAgent: {
        agentId: "ctx-agent-1",
        viewportX: 200,
        viewportY: 300,
      },
    });
    render(<AgentContextMenu />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useGameStore.getState().contextMenuAgent).toBeNull();
  });
});
```

- [ ] **Verify tests fail:** `cd frontend && npx vitest run src/__tests__/agentContextMenu.test.tsx`

### Step 2: Implement AgentContextMenu

- [ ] **Create `frontend/src/components/overlay/AgentContextMenu.tsx`:**

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Eye, Pause, Play, Skull, Copy, MessageSquare } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  useGameStore,
  selectContextMenuAgent,
} from "@/stores/gameStore";
import type { AgentAnimationState } from "@/stores/gameStore";
import { useAgentActions } from "@/hooks/useAgentActions";

// ============================================================================
// MENU ITEM
// ============================================================================

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onClick, danger }: MenuItemProps): ReactNode {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
        danger
          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AgentContextMenu(): ReactNode {
  const ctxMenu = useGameStore(useShallow(selectContextMenuAgent));
  const agents = useGameStore((s) => s.agents);
  const setSelectedAgent = useGameStore((s) => s.setSelectedAgent);
  const clearCtx = useGameStore((s) => s.setContextMenuAgent);
  const { pause, resume, kill } = useAgentActions();
  const menuRef = useRef<HTMLDivElement>(null);

  const agent: AgentAnimationState | undefined = ctxMenu
    ? agents.get(ctxMenu.agentId)
    : undefined;

  // Close on Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearCtx(null);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [ctxMenu, clearCtx]);

  // Close on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        clearCtx(null);
      }
    };
    // Delay to avoid closing on the same click that opened the menu
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [ctxMenu, clearCtx]);

  if (!ctxMenu || !agent) return null;

  const isPaused = agent.backendState === "waiting";

  const close = () => clearCtx(null);

  const handleViewDetails = () => {
    setSelectedAgent(ctxMenu.agentId);
    // setSelectedAgent already clears contextMenuAgent
  };

  const handleSendMessage = () => {
    // Open detail panel which has the message input
    setSelectedAgent(ctxMenu.agentId);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(agent.id);
    close();
  };

  const handlePause = () => {
    pause(agent.id);
    close();
  };

  const handleResume = () => {
    resume(agent.id);
    close();
  };

  const handleKill = () => {
    kill(agent.id);
    close();
  };

  // Position the menu, clamping to viewport
  const menuWidth = 200;
  const menuHeight = 250;
  const x = Math.min(ctxMenu.viewportX, window.innerWidth - menuWidth - 8);
  const y = Math.min(ctxMenu.viewportY, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-100"
      style={{ left: x, top: y, minWidth: menuWidth }}
    >
      {/* Agent name header */}
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: agent.color }}
        />
        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
          {agent.name ?? `Agent #${agent.number}`}
        </span>
      </div>

      {/* Actions */}
      <div className="py-1">
        <MenuItem
          icon={<Eye size={14} />}
          label="View Details"
          onClick={handleViewDetails}
        />
        <MenuItem
          icon={<MessageSquare size={14} />}
          label="Send Message"
          onClick={handleSendMessage}
        />
        <MenuItem
          icon={<Copy size={14} />}
          label="Copy Session ID"
          onClick={handleCopyId}
        />
        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
        {isPaused ? (
          <MenuItem
            icon={<Play size={14} />}
            label="Resume"
            onClick={handleResume}
          />
        ) : (
          <MenuItem
            icon={<Pause size={14} />}
            label="Pause"
            onClick={handlePause}
          />
        )}
        <MenuItem
          icon={<Skull size={14} />}
          label="Kill"
          onClick={handleKill}
          danger
        />
      </div>
    </div>
  );
}
```

- [ ] **Verify tests pass:** `cd frontend && npx vitest run src/__tests__/agentContextMenu.test.tsx`

### Step 3: Wire into page.tsx

- [ ] **Modify `frontend/src/app/page.tsx`.**

Add import:

```typescript
import { AgentContextMenu } from "@/components/overlay/AgentContextMenu";
```

Add alongside `<AgentDetailPanel />`:

```tsx
        <AgentContextMenu />
```

- [ ] **Verify types:** `cd frontend && npx tsc --noEmit`
- [ ] **Commit:** `feat(AgentContextMenu): add right-click context menu with quick actions`

---

## Task 5: Add room click to open spawn modal

**Files:**
- Modify: `frontend/src/components/game/OfficeRoom.tsx`
- Modify: `frontend/src/app/page.tsx` (if SpawnModal is not already wired for room clicks)

### Step 1: Add hit-area for empty space clicks in OfficeRoom

- [ ] **Modify `frontend/src/components/game/OfficeRoom.tsx`.**

The existing `OfficeRoom` does not have a click handler for empty floor space. We add an invisible hit-area that opens the spawn modal when the user clicks empty floor. Since `SpawnModal` is a React (HTML) overlay, not a PixiJS component, the OfficeRoom needs to communicate via a callback prop.

Add a new prop to `OfficeRoomProps`:

```typescript
interface OfficeRoomProps {
  textures: OfficeTextures;
  onEmptySpaceClick?: () => void;
}
```

Update the function signature:

```typescript
export function OfficeRoom({ textures, onEmptySpaceClick }: OfficeRoomProps): ReactNode {
```

Add a transparent hit-area as the first child inside the `<>` fragment (before `<OfficeBackground>`). Import `useCallback` if not already imported and `Graphics` from pixi.js:

```tsx
      {/* Clickable floor area — opens spawn modal */}
      {onEmptySpaceClick && (
        <pixiGraphics
          draw={(g: Graphics) => {
            g.clear();
            g.rect(0, 0, 1280, canvasHeight);
            g.fill({ color: 0x000000, alpha: 0.001 }); // Near-transparent
          }}
          eventMode="static"
          cursor="crosshair"
          onPointerDown={onEmptySpaceClick}
          zIndex={-1}
        />
      )}
```

**Important:** This sits *behind* all other elements. Agent clicks bubble up and are handled by the agent's own `eventMode="static"` container. The floor only receives clicks that don't hit any agent or furniture.

### Step 2: Wire spawn modal from OfficeRoom click

- [ ] **Modify the parent component that renders `<OfficeRoom>`.**

Find where `<OfficeRoom>` is rendered (likely in `OfficeGame.tsx` or `page.tsx`). Add state for the spawn modal:

```typescript
const [spawnModalOpen, setSpawnModalOpen] = useState(false);
```

Pass the callback:

```tsx
<OfficeRoom
  textures={textures}
  onEmptySpaceClick={() => setSpawnModalOpen(true)}
/>
```

Render the existing `SpawnModal`:

```tsx
<SpawnModal
  isOpen={spawnModalOpen}
  onClose={() => setSpawnModalOpen(false)}
  onSpawn={async (projectId, issue) => {
    await fetch("http://localhost:8000/api/v1/tasks/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, issue }),
    });
  }}
/>
```

Note: If `SpawnModal` is already wired elsewhere, just pass `setSpawnModalOpen(true)` as the `onEmptySpaceClick`. Check how `SpawnModal` is currently used and reuse the same `onSpawn` handler.

- [ ] **Verify types:** `cd frontend && npx tsc --noEmit`
- [ ] **Verify lint:** `cd frontend && npx eslint src/components/game/OfficeRoom.tsx`
- [ ] **Commit:** `feat(OfficeRoom): click empty floor space to open spawn modal`

---

## Task 6: Backend — agent control endpoints

**Files:**
- Modify: `backend/app/api/routes/agents.py`
- Modify: `backend/app/services/adapters/ao.py`
- Modify: `backend/app/services/adapters/__init__.py`
- Create: `backend/tests/test_agent_controls.py`

### Step 1: Extend AOAdapter with control methods

- [ ] **Modify `backend/app/services/adapters/__init__.py`.**

Add to the `TaskAdapter` protocol:

```python
    async def send_message(self, session_id: str, message: str) -> bool:
        """Send a message to a running session."""
        ...

    async def pause_session(self, session_id: str) -> bool:
        """Pause a running session."""
        ...

    async def resume_session(self, session_id: str) -> bool:
        """Resume a paused session."""
        ...

    async def kill_session(self, session_id: str) -> bool:
        """Kill/terminate a session."""
        ...
```

### Step 2: Implement control methods in AOAdapter

- [ ] **Modify `backend/app/services/adapters/ao.py`.**

The `send_message` method already exists. Add the remaining methods after it:

```python
    async def pause_session(self, session_id: str) -> bool:
        """Pause a session via ao CLI."""
        import asyncio
        proc = await asyncio.create_subprocess_exec(
            "ao", "pause", session_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning(f"ao pause failed: {stderr.decode()}")
            return False
        return True

    async def resume_session(self, session_id: str) -> bool:
        """Resume a paused session via ao CLI."""
        import asyncio
        proc = await asyncio.create_subprocess_exec(
            "ao", "resume", session_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning(f"ao resume failed: {stderr.decode()}")
            return False
        return True

    async def kill_session(self, session_id: str) -> bool:
        """Kill a session via ao CLI."""
        import asyncio
        proc = await asyncio.create_subprocess_exec(
            "ao", "kill", session_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning(f"ao kill failed: {stderr.decode()}")
            return False
        return True

    async def get_session_status(self, session_id: str) -> dict | None:
        """GET /api/sessions/:id for detailed status."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.ao_url}/api/sessions/{session_id}")
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Failed to get session status: {e}")
            return None
```

### Step 3: Write failing tests for agent control endpoints

- [ ] **Create `backend/tests/test_agent_controls.py`:**

```python
"""Tests for agent control endpoints (message, pause, resume, kill, status)."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
def mock_task_service():
    """Mock task_service with an AOAdapter."""
    adapter = MagicMock()
    adapter.send_message = AsyncMock(return_value=True)
    adapter.pause_session = AsyncMock(return_value=True)
    adapter.resume_session = AsyncMock(return_value=True)
    adapter.kill_session = AsyncMock(return_value=True)
    adapter.get_session_status = AsyncMock(return_value={
        "id": "sess-123",
        "status": "working",
        "projectId": "proj-1",
    })

    service = MagicMock()
    service.adapter = adapter
    return service


@pytest.mark.asyncio
async def test_send_message(mock_task_service):
    """POST /agents/{session_id}/message sends message via adapter."""
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/agents/sess-123/message",
                json={"text": "Hello agent"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "sent"
    mock_task_service.adapter.send_message.assert_awaited_once_with("sess-123", "Hello agent")


@pytest.mark.asyncio
async def test_pause_agent(mock_task_service):
    """POST /agents/{session_id}/pause pauses via adapter."""
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/agents/sess-123/pause")
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"
    mock_task_service.adapter.pause_session.assert_awaited_once_with("sess-123")


@pytest.mark.asyncio
async def test_resume_agent(mock_task_service):
    """POST /agents/{session_id}/resume resumes via adapter."""
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/agents/sess-123/resume")
    assert resp.status_code == 200
    assert resp.json()["status"] == "resumed"
    mock_task_service.adapter.resume_session.assert_awaited_once_with("sess-123")


@pytest.mark.asyncio
async def test_kill_agent(mock_task_service):
    """POST /agents/{session_id}/kill kills via adapter."""
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/api/v1/agents/sess-123/kill")
    assert resp.status_code == 200
    assert resp.json()["status"] == "killed"
    mock_task_service.adapter.kill_session.assert_awaited_once_with("sess-123")


@pytest.mark.asyncio
async def test_get_agent_status(mock_task_service):
    """GET /agents/{session_id}/status returns session details."""
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/agents/sess-123/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "sess-123"
    assert data["status"] == "working"


@pytest.mark.asyncio
async def test_send_message_no_adapter(mock_task_service):
    """Returns 503 when no adapter is available."""
    mock_task_service.adapter = None
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/agents/sess-123/message",
                json={"text": "Hello"},
            )
    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_send_message_empty_text(mock_task_service):
    """Returns 422 when text is empty."""
    with patch("app.api.routes.agents.get_task_service", return_value=mock_task_service):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/agents/sess-123/message",
                json={"text": ""},
            )
    assert resp.status_code == 422
```

- [ ] **Verify tests fail:** `cd backend && uv run pytest tests/test_agent_controls.py -x` — should fail because endpoints don't exist yet.

### Step 4: Implement the endpoints

- [ ] **Modify `backend/app/api/routes/agents.py`.**

Add imports at the top:

```python
from app.services.task_service import get_task_service
```

Add a helper to get the adapter:

```python
def _get_adapter():
    """Get the task service adapter, raising 503 if unavailable."""
    service = get_task_service()
    if service is None or service.adapter is None:
        raise HTTPException(status_code=503, detail="No orchestration adapter available")
    return service.adapter
```

Add request model:

```python
class MessageRequest(BaseModel):
    """Request body for sending a message to an agent."""
    text: str

    @property
    def is_valid(self) -> bool:
        return bool(self.text.strip())
```

Add the new endpoints after the existing `cleanup` endpoint:

```python
@router.post("/{session_id}/message")
async def send_message(session_id: str, request: MessageRequest) -> dict[str, str]:
    """Send a message to a running agent session."""
    if not request.text.strip():
        raise HTTPException(status_code=422, detail="Message text cannot be empty")
    adapter = _get_adapter()
    success = await adapter.send_message(session_id, request.text.strip())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send message")
    logger.info(f"Sent message to agent {session_id}")
    return {"status": "sent"}


@router.post("/{session_id}/pause")
async def pause_agent(session_id: str) -> dict[str, str]:
    """Pause a running agent session."""
    adapter = _get_adapter()
    success = await adapter.pause_session(session_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to pause agent")
    logger.info(f"Paused agent {session_id}")
    return {"status": "paused"}


@router.post("/{session_id}/resume")
async def resume_agent(session_id: str) -> dict[str, str]:
    """Resume a paused agent session."""
    adapter = _get_adapter()
    success = await adapter.resume_session(session_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to resume agent")
    logger.info(f"Resumed agent {session_id}")
    return {"status": "resumed"}


@router.post("/{session_id}/kill")
async def kill_agent(session_id: str) -> dict[str, str]:
    """Kill/terminate an agent session."""
    adapter = _get_adapter()
    success = await adapter.kill_session(session_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to kill agent")
    logger.info(f"Killed agent {session_id}")
    return {"status": "killed"}


@router.get("/{session_id}/status")
async def get_agent_status(session_id: str) -> dict:
    """Get detailed status of an agent session."""
    adapter = _get_adapter()
    status = await adapter.get_session_status(session_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return status
```

### Step 5: Wire get_task_service helper

- [ ] **Check if `get_task_service` is already importable from `backend/app/services/task_service.py`.**

The `task_service.py` likely has a module-level instance. If not, add a simple getter:

```python
# In task_service.py, at module level:
_task_service: TaskService | None = None

def get_task_service() -> TaskService | None:
    return _task_service
```

- [ ] **Verify tests pass:** `cd backend && uv run pytest tests/test_agent_controls.py -v`
- [ ] **Verify lint:** `cd backend && uv run ruff check app/api/routes/agents.py`
- [ ] **Commit:** `feat(agents): add message/pause/resume/kill/status control endpoints`

---

## Task 7: Add "waiting permission" visual state

**Files:**
- Modify: `frontend/src/components/game/shared/drawArm.ts`
- Modify: `frontend/src/components/game/AgentSprite.tsx`

### Step 1: Add raised arm pose to drawArm.ts

- [ ] **Modify `frontend/src/components/game/shared/drawArm.ts`.**

Add a new function after `drawLeftArm`:

```typescript
/**
 * Draws a right arm raised upward (signaling "needs attention").
 * Used when agent is in waiting_permission state.
 *
 * @param g - The PIXI Graphics instance to draw on
 * @param params - Arm drawing parameters (endY is ignored — arm goes up)
 */
export function drawRaisedRightArm(g: Graphics, params: ArmDrawParams): void {
  g.clear();

  const { bodyHalfWidth, startY, handColor, animOffset = 0 } = params;

  const startX = bodyHalfWidth;

  // Arm curves upward and slightly outward
  const cp1X = startX + 15;
  const cp1Y = startY - 20 + animOffset * 0.3;

  const cp2X = startX + 10;
  const cp2Y = startY - 45 + animOffset * 0.5;

  // End point: hand raised above head
  const endX = startX + 5;
  const endY = startY - 55 + animOffset;

  g.moveTo(startX, startY);
  g.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
  g.stroke({ width: ARM_WIDTH, color: 0xffffff, cap: "round" });

  // Hand
  const handRadius = HAND_WIDTH / 2;
  g.roundRect(
    endX - HAND_WIDTH / 2,
    endY - HAND_HEIGHT / 2,
    HAND_WIDTH,
    HAND_HEIGHT,
    handRadius,
  );
  g.fill(handColor);
  g.stroke({ width: 2, color: 0xffffff });
}
```

### Step 2: Add waiting_permission visual to AgentSprite

- [ ] **Modify `frontend/src/components/game/AgentSprite.tsx`.**

Import the new function:

```typescript
import { drawRightArm, drawLeftArm, drawRaisedRightArm } from "./shared/drawArm";
```

In `AgentArmsComponent`, update the arm drawing to check for `waiting_permission` state. Add a new prop:

Update `AgentArmsProps`:

```typescript
export interface AgentArmsProps {
  position: Position;
  isTyping: boolean;
  isWaitingPermission?: boolean;
}
```

In `AgentArmsComponent`, destructure `isWaitingPermission`:

```typescript
function AgentArmsComponent({
  position,
  isTyping,
  isWaitingPermission = false,
}: AgentArmsProps): ReactNode {
```

Add a wave animation for the raised arm:

```typescript
  // Raised arm wave for waiting_permission
  const raisedArmOffset = isWaitingPermission
    ? Math.sin(typingTime * 4) * 3
    : 0;
```

Update `useTick` to also animate when waiting permission:

```typescript
  useTick((ticker) => {
    if (isTyping || isWaitingPermission) {
      setTypingTime((t) => t + ticker.deltaTime * 0.15);
    } else {
      setTypingTime(0);
    }
  });
```

Update the right arm draw callback to use the raised pose when waiting:

```typescript
  const drawRightArmCallback = useCallback(
    (g: Graphics) => {
      if (isWaitingPermission) {
        drawRaisedRightArm(g, { ...agentArmParams, animOffset: raisedArmOffset });
      } else {
        drawRightArm(g, { ...agentArmParams, animOffset: rightArmOffset });
      }
    },
    [agentArmParams, rightArmOffset, raisedArmOffset, isWaitingPermission],
  );
```

### Step 3: Wire in OfficeRoom

- [ ] **Modify `frontend/src/components/game/OfficeRoom.tsx`.**

Pass `isWaitingPermission` to `AgentArms` in the all-merged-mode render (around line 348):

```tsx
              <AgentArms
                key={`arms-${agent.id}`}
                position={agent.currentPosition}
                isTyping={agent.isTyping}
                isWaitingPermission={agent.backendState === "waiting_permission"}
              />
```

And for overview mode (around line 340):

```tsx
              <AgentArms
                key={`arms-${agent.id}`}
                position={{ x: desk.x, y: desk.y }}
                isTyping={agent.state === "working"}
                isWaitingPermission={agent.state === "waiting_permission"}
              />
```

### Step 4: Add amber bubble for waiting_permission

The bubble system already supports the `waiting_permission` state. In the backend event processing, when an agent enters `waiting_permission`, a bubble should be enqueued. This is handled by the existing `updateAgentMeta` flow in gameStore when the backend state changes.

To add the automatic amber bubble, modify the reconciliation logic or add a store subscription. The simplest approach:

- [ ] **Add a subscription in a new `useEffect` in the game orchestration layer** (wherever `processBackendState` is called) that detects when an agent transitions to `waiting_permission` and calls:

```typescript
useGameStore.getState().enqueueBubble(agentId, {
  text: "Waiting for permission...",
  type: "thought",
  icon: "key",
});
```

This can be done in the existing `processBackendState` implementation in gameStore. Find the section that updates agent backend states and add:

```typescript
// In processBackendState, after updating agent backendState:
if (meta.backendState === "waiting_permission" && agent.backendState !== "waiting_permission") {
  // Agent just entered waiting_permission — show amber bubble
  get().enqueueBubble(agentId, {
    text: "Waiting for permission...",
    type: "thought",
    icon: "key",
  });
}
```

- [ ] **Verify types:** `cd frontend && npx tsc --noEmit`
- [ ] **Commit:** `feat(visual): add raised arm pose and amber bubble for waiting_permission state`

---

## Task 8: Integration wiring

**Files:**
- Modify: `frontend/src/components/overlay/AgentDetailPanel.tsx` (minor)
- Modify: `frontend/src/app/page.tsx` (verify all overlays are mounted)
- Verify: WebSocket updates reflect in both panel and sprite

### Step 1: Verify end-to-end wiring

- [ ] **Check that AgentDetailPanel and AgentContextMenu are rendered in page.tsx.**

The imports and JSX should already be in place from Tasks 3 and 4. Verify both are present:

```tsx
import { AgentDetailPanel } from "@/components/overlay/AgentDetailPanel";
import { AgentContextMenu } from "@/components/overlay/AgentContextMenu";
```

```tsx
        <AgentDetailPanel />
        <AgentContextMenu />
```

### Step 2: Verify that panel shows live data

- [ ] **The `AgentDetailPanel` subscribes to `selectSelectedAgent` with `useShallow`.** Since it reads from `gameStore.agents` Map, and agents are updated by WebSocket state updates via `processBackendState`, the panel will automatically reflect changes (name, status, currentTask, isTyping) as they arrive.

Verify this by checking the subscription pattern:

```typescript
const agent = useGameStore(useShallow(selectSelectedAgent));
```

This re-renders when the selected agent's data changes because `selectSelectedAgent` returns a new reference when the agent Map entry is replaced (which it always is — immutable Map updates via `new Map(state.agents)`).

### Step 3: Handle agent departure while panel is open

- [ ] **Add a guard in `AgentDetailPanel`** that clears selection when the selected agent is removed.

Add after the existing `useEffect` for Escape:

```typescript
  // Clear selection if agent disappears (departed/killed)
  useEffect(() => {
    if (selectedAgentId && !agent) {
      clearSelection();
    }
  }, [selectedAgentId, agent, clearSelection]);
```

### Step 4: Ensure SpawnModal room-click flow works

- [ ] **Trace the spawn flow:**
  1. User clicks empty floor space in OfficeRoom
  2. `onEmptySpaceClick` fires, sets `spawnModalOpen = true`
  3. SpawnModal renders, fetches projects from `/api/v1/tasks/projects`
  4. User fills in project + issue description
  5. SpawnModal calls `onSpawn(projectId, issue)`
  6. Backend spawn endpoint creates a new AO session
  7. AO starts the agent, backend picks it up via task polling
  8. New agent appears in the office visualization

The existing `SpawnModal` already handles steps 3-5. The parent component needs to provide the `onSpawn` callback that hits the correct backend endpoint.

### Step 5: Final verification

- [ ] **Run all frontend tests:** `cd frontend && npx vitest run`
- [ ] **Run all backend tests:** `cd backend && uv run pytest tests/ -v`
- [ ] **Run full check:** `cd /Users/apple/Projects/others/random/claude-office && make checkall`
- [ ] **Commit:** `feat(integration): wire agent management overlays and spawn flow`

---

## Summary

| Task | Files | Estimated Time |
|------|-------|---------------|
| 1. gameStore selection state | 3 files | 5 min |
| 2. AgentSprite clickable | 2 files | 3 min |
| 3. AgentDetailPanel | 4 files | 5 min |
| 4. AgentContextMenu | 3 files | 5 min |
| 5. Room click spawn | 2 files | 3 min |
| 6. Backend endpoints | 4 files | 5 min |
| 7. Visual waiting_permission | 3 files | 4 min |
| 8. Integration wiring | 2 files | 3 min |
| **Total** | **~15 unique files** | **~33 min** |

Tasks 1-4 are sequential (each depends on the prior). Tasks 5 and 6 are independent of each other and can run in parallel. Task 7 is independent. Task 8 depends on all prior tasks.

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 8
                                  ↗
Task 5 (independent) ───────────┘
Task 6 (independent) ───────────┘
Task 7 (independent) ───────────┘
```
