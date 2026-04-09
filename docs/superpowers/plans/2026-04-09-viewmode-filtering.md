# ViewMode 过滤逻辑修复 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 EventLog、ConversationHistory、AgentStatus 在 project/session 视图下只显示当前视图相关的数据，并保留 agent 动画状态。

**Architecture:** 新建 `getFilteredAgentIds()` 纯函数从 projectStore 数据计算当前视图的 agentId 集合；新建 `useFilteredData()` hook 用该集合过滤 gameStore 的 agents/events/conversation。各消费组件改用 hook 输出。

**Tech Stack:** React, Zustand, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-09-viewmode-filtering-design.md`

---

### Task 1: 重构 agentFilter — 返回 ID 集合

**Files:**
- Modify: `frontend/src/utils/agentFilter.ts`
- Modify: `frontend/tests/agentFilter.test.ts`

- [ ] **Step 1: 更新测试 — 新增 `getFilteredAgentIds` 测试**

在 `frontend/tests/agentFilter.test.ts` 中新增 describe block 测试 `getFilteredAgentIds`：

```typescript
import { getFilteredAgents, getFilteredAgentIds } from "../src/utils/agentFilter";

describe("getFilteredAgentIds", () => {
  // 复用已有的 makeAgent, makeProject, projects 数据

  it("returns null for office view", () => {
    expect(getFilteredAgentIds("office", null, projects)).toBeNull();
  });

  it("returns null for projects overview", () => {
    expect(getFilteredAgentIds("projects", null, projects)).toBeNull();
  });

  it("returns null for sessions overview", () => {
    expect(getFilteredAgentIds("sessions", null, projects)).toBeNull();
  });

  it("returns Set of agent ids for project view", () => {
    const result = getFilteredAgentIds("project", "proj-1", projects);
    expect(result).toEqual(new Set(["a1", "a2", "a3"]));
  });

  it("returns Set of agent ids for session view", () => {
    const result = getFilteredAgentIds("session", "sess-1", projects);
    expect(result).toEqual(new Set(["a1", "a2"]));
  });

  it("returns empty Set for unknown session", () => {
    const result = getFilteredAgentIds("session", "nonexistent", projects);
    expect(result).toEqual(new Set());
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx vitest run tests/agentFilter.test.ts`
Expected: FAIL — `getFilteredAgentIds` not exported

- [ ] **Step 3: 实现 `getFilteredAgentIds`**

在 `frontend/src/utils/agentFilter.ts` 中添加：

```typescript
/**
 * Get the set of agent IDs for the current view.
 * Returns null when no filtering needed (show all agents).
 */
export function getFilteredAgentIds(
  viewMode: ViewMode,
  activeRoomKey: string | null,
  projects: ProjectGroup[],
): Set<string> | null {
  if (viewMode === "project" && activeRoomKey) {
    const project = projects.find((p) => p.key === activeRoomKey);
    return new Set((project?.agents ?? []).map((a) => a.id));
  }
  if (viewMode === "session" && activeRoomKey) {
    const ids = new Set<string>();
    for (const project of projects) {
      for (const agent of project.agents) {
        const sid = String((agent as Record<string, unknown>).sessionId ?? "");
        if (sid === activeRoomKey) ids.add(agent.id);
      }
    }
    return ids;
  }
  return null;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run tests/agentFilter.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/agentFilter.ts frontend/tests/agentFilter.test.ts
git commit -m "feat: add getFilteredAgentIds() for viewMode-based filtering"
```

---

### Task 2: 新建 useFilteredData hook

**Files:**
- Create: `frontend/src/hooks/useFilteredData.ts`
- Create: `frontend/tests/useFilteredData.test.ts`

- [ ] **Step 1: 写 hook 过滤逻辑测试**

`frontend/tests/useFilteredData.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { filterEvents, filterConversation } from "../src/hooks/useFilteredData";

describe("filterEvents", () => {
  const events = [
    { agentId: "a1", type: "pre_tool_use", summary: "test1" },
    { agentId: "a2", type: "session_start", summary: "test2" },
    { agentId: "a3", type: "pre_tool_use", summary: "test3" },
  ] as any[];

  it("returns all events when agentIds is null", () => {
    expect(filterEvents(events, null)).toBe(events);
  });

  it("filters events by agentId set", () => {
    const result = filterEvents(events, new Set(["a1", "a3"]));
    expect(result.map((e: any) => e.agentId)).toEqual(["a1", "a3"]);
  });

  it("returns empty array when no agents match", () => {
    expect(filterEvents(events, new Set(["unknown"]))).toEqual([]);
  });
});

describe("filterConversation", () => {
  const msgs = [
    { agentId: "a1", role: "assistant", text: "hello" },
    { agentId: "a2", role: "user", text: "hi" },
    { agentId: "a1", role: "tool", text: "result" },
  ] as any[];

  it("returns all messages when agentIds is null", () => {
    expect(filterConversation(msgs, null)).toBe(msgs);
  });

  it("filters messages by agentId set", () => {
    const result = filterConversation(msgs, new Set(["a1"]));
    expect(result.map((m: any) => m.text)).toEqual(["hello", "result"]);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cd frontend && npx vitest run tests/useFilteredData.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 hook 和纯函数**

`frontend/src/hooks/useFilteredData.ts`:

```typescript
import { useMemo } from "react";
import { useGameStore, selectAgents, selectEventLog, selectConversation } from "@/stores/gameStore";
import { useProjectStore, selectViewMode, selectActiveRoomKey } from "@/stores/projectStore";
import { useShallow } from "zustand/react/shallow";
import { getFilteredAgentIds } from "@/utils/agentFilter";
import type { EventLogEntry, AgentAnimationState } from "@/stores/gameStore";
import type { ConversationEntry } from "@/types";

/**
 * Filter events by a set of agent IDs.
 * Returns the original array reference when agentIds is null (no filtering).
 */
export function filterEvents(
  events: EventLogEntry[],
  agentIds: Set<string> | null,
): EventLogEntry[] {
  if (!agentIds) return events;
  return events.filter((e) => agentIds.has(e.agentId));
}

/**
 * Filter conversation entries by a set of agent IDs.
 * Returns the original array reference when agentIds is null (no filtering).
 */
export function filterConversation(
  conversation: ConversationEntry[],
  agentIds: Set<string> | null,
): ConversationEntry[] {
  if (!agentIds) return conversation;
  return conversation.filter((c) => agentIds.has(c.agentId));
}

/**
 * Hook: returns filtered agents, events, and conversation for the current viewMode.
 *
 * - office/projects/sessions: returns all data (no filtering)
 * - project: returns data for agents in the selected project
 * - session: returns data for agents in the selected session
 *
 * Agents come from gameStore (preserving animation state).
 * Filtering is based on agentIds derived from projectStore.
 */
export function useFilteredData() {
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore((s) => s.projects);
  const gameAgents = useGameStore(useShallow(selectAgents));
  const allEvents = useGameStore(selectEventLog);
  const allConversation = useGameStore(selectConversation);

  const agentIds = useMemo(
    () => getFilteredAgentIds(viewMode, activeRoomKey, projects),
    [viewMode, activeRoomKey, projects],
  );

  const agents = useMemo((): AgentAnimationState[] => {
    const all = Array.from(gameAgents.values()).sort((a, b) => a.number - b.number);
    if (!agentIds) return all;
    return all.filter((a) => agentIds.has(a.id));
  }, [gameAgents, agentIds]);

  const events = useMemo(
    () => filterEvents(allEvents, agentIds),
    [allEvents, agentIds],
  );

  const conversation = useMemo(
    () => filterConversation(allConversation, agentIds),
    [allConversation, agentIds],
  );

  return { agents, events, conversation, agentIds };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `cd frontend && npx vitest run tests/useFilteredData.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFilteredData.ts frontend/tests/useFilteredData.test.ts
git commit -m "feat: add useFilteredData hook for viewMode-based data filtering"
```

---

### Task 3: AgentStatus 改用 useFilteredData

**Files:**
- Modify: `frontend/src/components/game/AgentStatus.tsx`

- [ ] **Step 1: 重构 AgentStatus 使用 useFilteredData**

替换现有的 filtering 逻辑：

1. 删除对 `getFilteredAgents` 的导入和 `filtered` memo
2. 导入 `useFilteredData`
3. 用 `useFilteredData().agents` 替代 `agentArray` 的计算逻辑
4. 因为 `useFilteredData` 返回的是 `AgentAnimationState[]`（来自 gameStore），不再需要 `DisplayAgent` 接口和两分支映射

关键变更：
```typescript
// Before:
const filtered = useMemo(() => getFilteredAgents(...), [...]);
const agentArray = useMemo((): DisplayAgent[] => {
  if (filtered) { /* projectStore branch - loses animation state */ }
  /* gameStore branch */
}, [filtered, gameAgents]);

// After:
const { agents: agentArray } = useFilteredData();
// agentArray is always AgentAnimationState[] from gameStore, filtered by viewMode
```

渲染代码中需要适配：
- `agent.backendState` 直接可用（AgentAnimationState 有此字段）
- `agent.phase` 直接可用（不再是 null）
- `agent.bubble` 是 `BubbleState` 类型，已有 `.content` 字段
- `agent.queueType` 和 `agent.queueIndex` 直接可用

删除 `DisplayAgent` 接口定义。

- [ ] **Step 2: 运行 typecheck 和测试**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: ALL PASS, no type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/AgentStatus.tsx
git commit -m "refactor: AgentStatus uses useFilteredData, preserves animation state"
```

---

### Task 4: EventLog 按 viewMode 过滤

**Files:**
- Modify: `frontend/src/components/game/EventLog.tsx`

- [ ] **Step 1: 修改 EventLog 使用 useFilteredData**

在 EventLog 组件中：

```typescript
// Before:
const eventLog = useGameStore(selectEventLog);

// After:
import { useFilteredData } from "@/hooks/useFilteredData";
const { events: eventLog } = useFilteredData();
```

其余渲染逻辑不变 — `eventLog` 变量名不变，只是数据源从全量变为过滤后。

header 中的事件计数也自动变为过滤后的数量。

- [ ] **Step 2: 运行 typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/EventLog.tsx
git commit -m "feat: EventLog filters events by viewMode (project/session)"
```

---

### Task 5: ConversationHistory 按 viewMode 过滤

**Files:**
- Modify: `frontend/src/components/game/ConversationHistory.tsx`

- [ ] **Step 1: 修改 ConversationHistory 使用 useFilteredData**

```typescript
// Before:
const conversation = useGameStore(selectConversation);

// After:
import { useFilteredData } from "@/hooks/useFilteredData";
const { conversation } = useFilteredData();
```

其余渲染逻辑不变。message 计数自动变为过滤后的数量。

- [ ] **Step 2: 运行 typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/game/ConversationHistory.tsx
git commit -m "feat: ConversationHistory filters by viewMode (project/session)"
```

---

### Task 6: OfficeGame sessionRooms 复用 agentFilter

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`

- [ ] **Step 1: 替换 sessionRooms 中的内联 sessionId 聚合逻辑**

将 OfficeGame 中的 `agentsBySession` 计算改为复用 `agentFilter` 中的逻辑：

```typescript
import { getFilteredAgentIds } from "@/utils/agentFilter";

// sessionRooms memo 中，替换内联的 agentsBySession 构建：
const sessionRooms = useMemo(() => {
  const projectByName = new Map(projects.map((p) => [p.name, p]));

  // 复用 agentFilter 的 sessionId 匹配逻辑，为每个 session 获取 agents
  return storeSessions.map((session) => {
    const project = projectByName.get(session.projectName ?? "") ?? projects[0];
    // 收集匹配该 session 的 agents
    const agents: typeof projects[0]["agents"] = [];
    for (const p of projects) {
      for (const agent of p.agents) {
        const sid = String((agent as Record<string, unknown>).sessionId ?? "");
        if (sid === session.id) agents.push(agent);
      }
    }
    return {
      key: session.id,
      name: `${session.projectName ?? "Unknown"} · ${session.id.slice(0, 8)}`,
      color: project?.color ?? "#888888",
      root: project?.root ?? null,
      agents,
      boss: project?.boss ?? { state: "idle" as const, currentTask: null, bubble: null, position: { x: 640, y: 830 } },
      sessionCount: 1,
      todos: project?.todos ?? [],
    };
  });
}, [projects, storeSessions]);
```

注意：这里 OfficeGame 需要的是 `Agent[]`（projectStore 类型，用于静态渲染），不是 `AgentAnimationState[]`。所以 sessionRooms 仍然从 projectStore 取 agents，不需要改为 useFilteredData。

实际上这一步的去重效果有限（逻辑相同但输出类型不同），可以抽取一个共享的 `getAgentsBySessionId` 辅助函数到 `agentFilter.ts`：

```typescript
/** Group agents by sessionId across all projects */
export function groupAgentsBySessionId(
  projects: ProjectGroup[],
): Map<string, Agent[]> {
  const map = new Map<string, Agent[]>();
  for (const project of projects) {
    for (const agent of project.agents) {
      const sid = String((agent as Record<string, unknown>).sessionId ?? "");
      if (!sid) continue;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(agent);
    }
  }
  return map;
}
```

然后 OfficeGame 和 `getFilteredAgentIds` 的 session 分支都可以复用。

- [ ] **Step 2: 运行 typecheck 和测试**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/agentFilter.ts frontend/src/components/game/OfficeGame.tsx frontend/tests/agentFilter.test.ts
git commit -m "refactor: extract groupAgentsBySessionId, deduplicate session agent logic"
```

---

### Task 7: 全量验证

- [ ] **Step 1: 运行全部检查**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: ALL PASS, zero type errors

- [ ] **Step 2: 手动验证（开发服务器）**

验证矩阵：

| ViewMode | AgentStatus | EventLog | Conversation |
|----------|-------------|----------|--------------|
| office | 全部 agent + 动画 | 全部事件 | 全部对话 |
| projects | 全部 agent + 动画 | 全部事件 | 全部对话 |
| project | 该项目 agent + 动画 | 该项目事件 | 该项目对话 |
| sessions | 全部 agent + 动画 | 全部事件 | 全部对话 |
| session | 该会话 agent + 动画 | 该会话事件 | 该会话对话 |

- [ ] **Step 3: Commit 并推送**

```bash
git push origin feat/viewmode-filtering
```
