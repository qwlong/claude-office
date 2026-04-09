# Agent Persistence to DB

## 目标

将 Agent 持久化到 DB，使 agent 列表在后端重启后可恢复，并为 sidebar 的 agent count 提供准确数据。

## 现状

- Agent 只存在于内存（`StateMachine.agents` dict）
- 后端重启后 agent 状态丢失
- Boss（main agent）不在 agents 列表里，导致 agent count 不准确
- 前端 sidebar 的 agent count 不包含 boss

## 关系模型

```
Project 1:N Session 1:N Agent
```

- 每个 session 至少有 1 个 agent（main）
- 每个 session 可能有 0~N 个 subagent
- Agent 不跨 session

## DB 表结构

### 新增 `agents` 表

```sql
CREATE TABLE agents (
    id            VARCHAR PRIMARY KEY,  -- UUID
    session_id    VARCHAR NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_id    VARCHAR REFERENCES projects(id) ON DELETE CASCADE,  -- 冗余，方便查询
    external_id   VARCHAR NOT NULL,     -- Claude Code 内部 ID ("main" 或 subagent UUID)
    agent_type    VARCHAR NOT NULL,     -- "main" / "subagent"
    name          VARCHAR,              -- 显示名 (如 "The Critic"，main 为 "Claude")
    state         VARCHAR,              -- working / idle / completed / leaving 等
    assignment    TEXT,                 -- 当前任务/指令描述
    desk          INTEGER,              -- 工位号
    color         VARCHAR,              -- 颜色
    created_at    DATETIME NOT NULL,
    updated_at    DATETIME NOT NULL,
    started_at    DATETIME,             -- 开始工作时间
    ended_at      DATETIME              -- 离开/完成时间
);
```

`ON DELETE CASCADE`：删除 session 时级联删除其 agents。

## 同步策略：关键节点写 DB

| 节点 | 操作 | 字段 |
|------|------|------|
| Agent 创建（spawn / session_start） | INSERT | 全部字段，设 created_at + started_at |
| 状态大变化（idle↔working, completed） | UPDATE | state, updated_at |
| assignment 变化 | UPDATE | assignment, updated_at |
| Agent 离开/完成 | UPDATE | state, ended_at, updated_at |

**不写 DB 的：** position、phase、bubble、queueType 等动画状态——这些走 WebSocket 实时推送。

## Main Agent 处理

每个 session 的 `session_start` 事件触发创建一条 `agent_type="main"` 的 agent 记录：
- `external_id` = "main"
- `name` = "Claude"
- `state` = boss 的当前 state

这样前端 `project.agents.length` 自然包含 main agent，不需要 +1 hack。

## 数据流

### 写入

```
session_start → INSERT agent (type=main, external_id="main", name="Claude")
subagent_spawn → INSERT agent (type=subagent, external_id=xxx, name=yyy)
state 大变化 → UPDATE agent.state, agent.assignment
session_end / agent_leave → UPDATE agent.ended_at
```

### 读取（重启恢复）

```
启动 → SELECT agents WHERE ended_at IS NULL → 恢复到 StateMachine.agents
```

## 文件变更

| 文件 | 变更 |
|------|------|
| `backend/app/db/models.py` | 新增 `AgentRecord` 模型 |
| `backend/app/main.py` | schema migration（add agents table） |
| `backend/app/core/event_processor.py` | 关键节点写 DB |
| `backend/app/core/handlers/session_handler.py` | session_start 时创建 main agent 记录 |
| `backend/app/core/handlers/agent_handler.py` | subagent spawn/leave 时写 DB |
| `backend/app/core/event_processor.py` | get_project_grouped_state 包含 main agent 在 agents 列表 |
| `backend/tests/` | agent persistence 测试 |

## 前端字段覆盖分析

| 前端显示 | 数据字段 | DB 字段 | 备注 |
|---------|---------|---------|------|
| 名称 + 颜色条 | name, color | ✅ name, color | |
| ID 缩写 | id | ✅ external_id | |
| 工位号 | desk | ✅ desk | |
| 任务摘要 | currentTask | ✅ assignment | |
| 状态 badge | backendState | ✅ state | |
| 最近工具调用 | bubble.content (icon + text) | ❌ 不存 | 实时 WebSocket，重启后为空 |
| 前端动画阶段 | phase | ❌ 不存 | 前端动画状态 |
| 队列位置 | queueType, queueIndex | ❌ 不存 | 前端动画状态 |

### 未来可能需要的字段

- `last_tool_call` — 最近一次工具调用的名称/摘要，重启后仍可显示
- `last_tool_icon` — 工具图标
- `total_tool_calls` — 累计工具调用次数
- `token_usage` — token 消耗统计

## 不做的事情

- 不改前端 Agent 类型定义（后端发送的 Agent 结构不变）
- 不改 WebSocket 协议
- 不存动画状态到 DB（position, phase, bubble 等）
- 不加 agent CRUD API（暂时不需要手动管理 agent）
