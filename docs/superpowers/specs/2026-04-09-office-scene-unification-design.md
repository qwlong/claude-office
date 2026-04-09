# Office Scene Unification Design

## Problem

`OfficeGame.tsx`（808 行）和 `OfficeRoom.tsx`（569 行）有 ~200+ 行重复的场景渲染代码：背景、装饰、桌子、agent、boss、气泡等。当在 `OfficeRoom` 里改了多 boss 支持后，`OfficeGame` 还是旧代码，改一处漏一处。

### 当前架构

| 文件 | 职责 | 问题 |
|------|------|------|
| `OfficeGame.tsx` (808行) | 入口，5 种 view 的调度器 | 内联了完整的单办公室渲染（~370行） |
| `OfficeRoom.tsx` (569行) | 可复用办公室组件（`isRoom` 双模式） | 跟 OfficeGame 大量重复 |
| `MultiRoomCanvas.tsx` (94行) | 多房间网格布局 | OK |
| `RoomContext.tsx` (52行) | 多房间数据 provider | OK |

### 重复清单

以下渲染块在两个文件中几乎完全相同：

- `OfficeBackground`
- Boss area rug(s)（含 merged view 多 rug）
- 墙面装饰：EmployeeOfTheMonth, CityWindow, SafetySign, WallClock, wallOutlet, Whiteboard, waterCooler, coffeeMachine
- PrinterStation, Plant
- Elevator
- Y-sorted layer：chairs + agents
- DeskSurfacesBase（桌面 + 键盘）
- AgentArms, AgentHeadset
- DeskSurfacesTop（显示器 + 桌面摆件）
- Boss(es)（含 merged view 多 boss）
- TrashCanSprite
- Labels layer
- Bubbles layer + BossBubble

`OfficeGame` 独有的：
- `compactionAnimation`（MobileBoss + 动画垃圾桶）
- `DebugOverlays`
- 键盘快捷键

## Design

采用渐进式统一（方案 A），分两步：

### Step 1: OfficeGame 委托给 OfficeRoom（消除重复）

**目标：** `OfficeGame` 的 "office" 模式不再内联渲染，而是委托给 `OfficeRoom`。

#### OfficeGame.tsx 变化

- 删除 `!isMultiRoom` 分支内联的 ~370 行场景渲染代码
- 替换为 `<OfficeRoom textures={textures} />`
- 保留：Application 容器、zoom/pan（TransformWrapper）、键盘快捷键、view 路由、fit-to-view 逻辑
- 删除不再需要的 imports 和 useMemo（`deskAgents`、`occupiedDesks`、`deskTasks`、`deskCount`、`deskPositions` 等）
- **预期行数：~430 行**

#### OfficeRoom.tsx 变化

新增功能（仅 `!isRoom` 模式生效）：

1. **Compaction 动画：** 调用 `useCompactionAnimation()`，渲染 `MobileBoss`、动画垃圾桶
2. **Debug overlays：** 渲染 `DebugOverlays` + debug mode 文字
3. **`isAway` 传递：** BossSprite 的 `isAway` 根据 `compactionAnimation.phase !== "idle"` 判断

#### 数据流不变

- 单办公室模式（`!isRoom`）：从 `gameStore` 读取全局状态，跟当前 `OfficeGame` 行为一致
- 多房间模式（`isRoom`）：从 `RoomContext` 读取 per-room 数据，跟当前行为一致

### Step 2: Compaction 状态 per-session 化

**目标：** 每个房间（session）可以独立触发和播放 compaction 动画。

#### gameStore 变化

将全局 compaction 状态改为 per-session Map：

```typescript
// Before (全局单例)
compactionPhase: CompactionAnimationPhase;
isCompacting: boolean;
contextUtilization: number;

// After (per-session)
compactionPhases: Map<string, CompactionAnimationPhase>;
isCompactingMap: Map<string, boolean>;
contextUtilizations: Map<string, number>;
```

对应的 actions 也改为接受 `sessionId` 参数：

```typescript
triggerCompaction: (sessionId: string) => void;
setCompactionPhase: (sessionId: string, phase: CompactionAnimationPhase) => void;
setIsCompacting: (sessionId: string, isCompacting: boolean) => void;
setContextUtilization: (sessionId: string, value: number) => void;
```

保留向后兼容的 selectors，单办公室模式使用当前活跃 sessionId：

```typescript
// 单办公室模式 selector（读当前 session）
export const selectCompactionPhase = (state: GameStore) =>
  state.compactionPhases.get(state.sessionId) ?? "idle";
export const selectIsCompacting = (state: GameStore) =>
  state.isCompactingMap.get(state.sessionId) ?? false;
export const selectContextUtilization = (state: GameStore) =>
  state.contextUtilizations.get(state.sessionId) ?? 0;
```

#### useCompactionAnimation 变化

接受可选 `sessionId` 参数：

```typescript
export function useCompactionAnimation(sessionId?: string): CompactionAnimationState {
  // 如果传了 sessionId，从 Map 中读对应状态
  // 否则使用全局 selector（向后兼容）
}
```

#### OfficeRoom 变化

- `isRoom` 模式：从 `roomCtx` 拿 session/project key，传给 `useCompactionAnimation(sessionId)`
- `!isRoom` 模式：不传参，使用当前活跃 session 的全局状态

#### RoomContext 变化

无需改动。`ProjectGroup` 已有 `key` 字段，可作为 session/project 标识。

#### 事件处理

后端发送 compaction 事件时需要带 `sessionId`，store 的 event handler 根据 `sessionId` 更新对应 Map entry。如果后端暂时不支持 per-session compaction 事件，Step 2 可以先只改数据结构，实际触发仍走全局路径。

## 文件影响

| 文件 | Step 1 | Step 2 |
|------|--------|--------|
| `OfficeGame.tsx` | **大改**（删 ~370 行） | 不变 |
| `OfficeRoom.tsx` | **中改**（加 compaction/debug ~60 行） | 小改（传 sessionId） |
| `compactionAnimation.ts` | 不变 | **中改**（接受 sessionId） |
| `gameStore.ts` | 不变 | **中改**（Map 化 compaction 状态） |
| `MultiRoomCanvas.tsx` | 不变 | 不变 |
| `RoomContext.tsx` | 不变 | 不变 |

## 风险

- **Step 1 风险低：** 本质是删除重复代码，OfficeRoom 已经有 `isRoom` 双模式机制，只需补全缺失的 compaction/debug 功能
- **Step 2 风险中等：** compaction 状态 Map 化涉及 store 结构变更，需要确保所有 consumer 都正确迁移。向后兼容 selectors 可以降低风险

## 验收标准

### Step 1
- [ ] `OfficeGame.tsx` 不再包含任何场景渲染代码（背景、桌子、agent 等）
- [ ] 单办公室模式（"office" view）视觉效果与重构前完全一致
- [ ] compaction 动画在单办公室模式正常工作
- [ ] debug overlays 在单办公室模式正常工作
- [ ] 多房间模式（projects/project/sessions/session）不受影响
- [ ] `make checkall` 通过

### Step 2
- [ ] 多房间视图中，每个房间可以独立播放 compaction 动画
- [ ] 单办公室模式 compaction 行为不变
- [ ] 两个房间同时 compaction 时互不干扰
- [ ] `make checkall` 通过
