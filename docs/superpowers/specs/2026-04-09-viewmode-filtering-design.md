# ViewMode 过滤逻辑审计与修复方案

> **目标：** 让 EventLog、ConversationHistory、AgentStatus 在每种 ViewMode 下都显示与当前视图语义一致的数据。

---

## 1. 现状分析

### 1.1 ViewMode 状态机

```
office (默认单房间)
  ├─ projects (所有项目网格)
  │   └─ project (zoom 单项目, activeRoomKey = projectKey)
  └─ sessions (所有会话网格)
      └─ session (zoom 单会话, activeRoomKey = sessionId)
```

### 1.2 数据来源

| Store | 数据 | 特点 |
|-------|------|------|
| **gameStore** | agents (Map), eventLog[], conversation[], boss, gitStatus | 实时 WebSocket 更新，含动画状态 |
| **projectStore** | projects[], sessions[], viewMode, activeRoomKey | 定期轮询，静态数据，无动画状态 |

### 1.3 各组件当前过滤行为

| 组件 | office | projects | project | sessions | session |
|------|--------|----------|---------|----------|---------|
| **AgentStatus** | gameStore 全部 | gameStore 全部 | projectStore 单项目 | gameStore 全部 | projectStore 按 sessionId |
| **EventLog** | 全部 | 全部 | **全部 (BUG)** | 全部 | **全部 (BUG)** |
| **Conversation** | 全部 | 全部 | **全部 (BUG)** | 全部 | **全部 (BUG)** |
| **OfficeGame** | 单房间动画 | 多房间网格 | 单房间 zoom | 多房间网格 | 单房间 zoom |

---

## 2. 问题清单

### P1-1: EventLog 不按 ViewMode 过滤

**现象：** zoom 到某个 project 或 session 时，事件日志仍显示所有事件。

**根因：** `EventLog` 直接读 `selectEventLog`，无过滤逻辑。

**可用过滤字段：** `EventLogEntry.agentId` — 可通过 agentId 匹配到 project/session 的 agent 列表。

### P1-2: ConversationHistory 不按 ViewMode 过滤

**现象：** zoom 到某个 session 时，对话历史仍显示所有对话。

**根因：** `ConversationHistory` 直接读 `selectConversation`，无过滤逻辑。

**可用过滤字段：** `ConversationEntry.agentId` — 同 EventLog。

### P1-3: 双数据源导致 zoom 后丢失动画状态

**现象：** zoom 到 project/session 时，AgentStatus 用 projectStore 静态数据，phase 固定 null，queueType/queueIndex 丢失。

**根因：** `getFilteredAgents()` 返回 projectStore 的 `Agent[]` 类型，没有 phase/queue 字段。AgentStatus 的 `DisplayAgent` 硬编码 `phase: null, queueType: null, queueIndex: -1`。

**理想行为：** 用 projectStore 确定哪些 agent 属于当前视图，再从 gameStore 取对应 agent 的完整动画状态。

### P2-1: sessionId 未类型化

**现象：** `agentFilter.ts` 用 `(agent as Record<string, unknown>).sessionId` 强转。

**根因：** `Agent` 类型（来自 `ProjectGroup.agents`）没有 `sessionId` 字段定义。

### P2-2: OfficeGame 和 AgentStatus 重复 session 过滤逻辑

**现象：** `OfficeGame.sessionRooms` memo 和 `agentFilter.getFilteredAgents()` 各自独立按 sessionId 聚合 agent。

**风险：** 改一处不改另一处会导致不一致。

---

## 3. 修复方案

### 3.1 核心思路：统一过滤层

创建 `useFilteredData` hook，根据 viewMode + activeRoomKey 过滤三类数据：

```typescript
interface FilteredData {
  agents: AgentAnimationState[];      // 从 gameStore，保留动画状态
  events: EventLogEntry[];            // 从 gameStore，按 agentId 过滤
  conversation: ConversationEntry[];  // 从 gameStore，按 agentId 过滤
}
```

**过滤规则矩阵：**

| ViewMode | agentIds 来源 | agents | events | conversation |
|----------|---------------|--------|--------|--------------|
| office | 无过滤 | gameStore 全部 | 全部 | 全部 |
| projects | 无过滤 | gameStore 全部 | 全部 | 全部 |
| project | projectStore 匹配项目的 agent.id 集合 | gameStore 中 id 在集合内的 | agentId 在集合内的 | agentId 在集合内的 |
| sessions | 无过滤 | gameStore 全部 | 全部 | 全部 |
| session | projectStore 匹配 sessionId 的 agent.id 集合 | gameStore 中 id 在集合内的 | agentId 在集合内的 | agentId 在集合内的 |

### 3.2 Agent 类型修复

给 `Agent` 类型添加 `sessionId` 字段（或扩展 `ProjectGroup.agents` 的类型），消除 `as Record<string, unknown>` 强转。

需要确认：`sessionId` 是后端返回的还是前端推导的？检查 `generated.ts` 中 `Agent` 类型。

### 3.3 AgentStatus 数据源统一

**改前：** project/session 模式用 projectStore 静态 Agent → DisplayAgent（丢失动画状态）。

**改后：**
1. 用 `getFilteredAgentIds()` 从 projectStore 获取当前视图的 agent ID 集合
2. 从 gameStore 取这些 ID 对应的 `AgentAnimationState`（保留 phase、queue 信息）
3. 如果 gameStore 中找不到（agent 未在当前 WebSocket 连接中），fallback 到 projectStore 静态数据

### 3.4 去重 session 过滤逻辑

将 `OfficeGame.sessionRooms` 中的 "按 sessionId 聚合 agent" 逻辑抽到共享 utility（可复用 `agentFilter.ts` 中的逻辑）。

### 3.5 EventLog 过滤

在 `EventLog` 组件中加入过滤：

```typescript
const allEvents = useGameStore(selectEventLog);
const { events: filteredEvents } = useFilteredData();
// 或直接用 filteredAgentIds 过滤
```

### 3.6 ConversationHistory 过滤

同 EventLog，用 `filteredAgentIds` 过滤 conversation entries。

---

## 4. 文件变更清单

| 文件 | 变更 | 类型 |
|------|------|------|
| `frontend/src/types/projects.ts` | Agent 类型添加 sessionId | 类型修复 |
| `frontend/src/utils/agentFilter.ts` | 重构：返回 agentId 集合而非 Agent[]，消除强转 | 重构 |
| `frontend/src/hooks/useFilteredData.ts` | **新建**：统一过滤 hook，输出 agents/events/conversation | 新功能 |
| `frontend/src/components/game/AgentStatus.tsx` | 使用 useFilteredData，保留动画状态 | 修复 |
| `frontend/src/components/game/EventLog.tsx` | 使用 useFilteredData 过滤事件 | 修复 |
| `frontend/src/components/game/ConversationHistory.tsx` | 使用 useFilteredData 过滤对话 | 修复 |
| `frontend/src/components/game/OfficeGame.tsx` | sessionRooms 复用 agentFilter 逻辑 | 去重 |
| `frontend/tests/agentFilter.test.ts` | 更新测试适配新接口 | 测试 |
| `frontend/tests/useFilteredData.test.ts` | **新建**：hook 过滤逻辑测试 | 测试 |

---

## 5. 边界情况

1. **agent 在 gameStore 但不在 projectStore：** 可能发生在 projectStore 尚未更新时。应显示 gameStore 中的 agent（不丢弃）。
2. **event 的 agentId 为空或不匹配任何已知 agent：** 在 project/session 模式下应隐藏这些事件。
3. **"所有项目" / "所有会话" 模式：** 不过滤，显示全部数据（与 "office" 模式行为一致）。
4. **WebSocket 连接的是 `__all__`：** 数据包含所有 session，过滤逻辑仍有效（基于 agentId 匹配）。
5. **切换 viewMode 时的性能：** `useMemo` 依赖 viewMode + activeRoomKey + agentIds 集合，避免每次 render 重新过滤。

---

## 6. 不做的事情

- **不改 WebSocket 连接逻辑：** 前端始终接收全部数据，在组件层过滤。
- **不改 OfficeGame 渲染逻辑：** 多房间网格的 room 渲染不变，只统一 agent 过滤的共享逻辑。
- **不改 "Whole Office" 的位置：** P3 优先级，本次不动。
- **不加新的 i18n key：** 过滤是纯逻辑变更，不涉及 UI 文案。
