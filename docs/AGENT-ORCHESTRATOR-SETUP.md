# Agent Orchestrator (AO) 集成设置指南

## 1. 概述

Agent Orchestrator (AO) 是一个多 Agent 调度系统，负责在 git worktree 中启动独立的 claude-code Agent 实例来处理任务。Claude Office Visualizer 通过轮询 AO 的 HTTP API 同步任务状态，并通过 WebSocket 实时广播到前端的 TaskDrawer 面板。

**集成后的工作流程：**

1. 用户通过 CLI / UI / AO Dashboard 派发任务（指定项目 + issue）
2. AO 在目标项目的 git worktree 中启动一个 claude-code Agent
3. Agent 在独立 tmux session 中运行，处理 issue
4. Claude Office 后端每隔 N 秒轮询 AO 的 `/api/sessions`，同步任务状态
5. 状态变更通过 WebSocket 推送到前端 TaskDrawer，实时展示进度
6. Agent 完成工作后创建 PR，状态流转为 `pr_open` -> `review_pending` -> `merged` -> `done`

---

## 2. 前置条件

| 依赖 | 最低版本 | 安装方式 |
|------|---------|---------|
| Node.js | 18+ | `brew install node` |
| tmux | 3.0+ | `brew install tmux` |
| claude-code CLI | 最新 | `npm install -g @anthropic-ai/claude-code` |
| Agent Orchestrator | 最新 | 见下方安装步骤 |
| Python | 3.11+ | `brew install python@3.12` |
| uv | 最新 | `brew install uv` |
| Git | 2.20+ | `brew install git`（需支持 worktree） |

确认已安装：

```bash
node --version        # >= 18
tmux -V               # >= 3.0
claude --version      # claude-code CLI
git worktree list     # 确认 git worktree 可用
```

---

## 3. Agent Orchestrator 安装与配置

### 3.1 安装 AO

```bash
cd /Users/apple/Projects/others/random
git clone https://github.com/ComposioHQ/agent-orchestrator.git
cd agent-orchestrator
npm install
```

### 3.2 配置文件

AO 的配置文件位于 `/Users/apple/Projects/others/random/agent-orchestrator.yaml`：

```yaml
port: 3003                    # AO HTTP API 监听端口
defaults:
  runtime: tmux               # 使用 tmux 管理 Agent 进程
  agent: claude-code          # 使用 claude-code 作为 Agent
  workspace: worktree         # 每个任务在独立 git worktree 中运行
  notifiers:
    - desktop                 # 桌面通知（任务完成时弹窗）
projects:
  agent-orchestrator:         # 项目 ID（用于 spawn 时指定）
    name: agent-orchestrator
    sessionPrefix: ao         # tmux session 前缀（如 ao-1, ao-2）
    repo: ComposioHQ/agent-orchestrator
    path: /Users/apple/Projects/others/random/agent-orchestrator
    defaultBranch: main
    agentRules: |-            # 注入给每个 Agent 的规则
      Always run tests before pushing.
      Use conventional commits (feat:, fix:, chore:, docs:, refactor:, test:).
      Link issue numbers in commit messages.
      Write clear commit messages that explain WHY, not just WHAT.
  claude-office:
    name: claude-office
    sessionPrefix: co         # tmux session 前缀（如 co-1, co-2）
    repo: user/claude-office
    path: /Users/apple/Projects/others/random/claude-office
    defaultBranch: main
    agentRules: |-
      Always run tests before pushing.
      Use conventional commits (feat:, fix:, chore:, docs:, refactor:, test:).
      Never return new objects from Zustand selectors without useShallow.
      Always push to 'myfork' remote (qwlong/claude-office), never push to 'origin'.
      When creating PRs, use: gh pr create --repo qwlong/claude-office
```

**配置字段说明：**

| 字段 | 说明 |
|------|------|
| `port` | AO API 服务端口，Claude Office 后端通过此端口通信 |
| `defaults.runtime` | Agent 运行时，`tmux` 表示在 tmux session 中运行 |
| `defaults.agent` | Agent 类型，`claude-code` 使用 Claude Code CLI |
| `defaults.workspace` | 工作空间隔离方式，`worktree` 使用 git worktree |
| `projects.<id>.sessionPrefix` | tmux session 命名前缀，方便 `tmux attach` 时定位 |
| `projects.<id>.path` | 项目本地路径，AO 在此路径下创建 worktree |
| `projects.<id>.agentRules` | 注入 Agent 的行为规则，确保代码质量 |

### 3.3 添加新项目

在 `projects` 下新增一个 key 即可：

```yaml
projects:
  my-new-project:
    name: my-new-project
    sessionPrefix: mnp
    repo: org/my-new-project
    path: /path/to/my-new-project
    defaultBranch: main
    agentRules: |-
      Your rules here.
```

---

## 4. Claude Office 后端配置

### 4.1 环境变量

编辑 `/Users/apple/Projects/others/random/claude-office/backend/.env`：

```env
AO_URL=http://localhost:3003
AO_POLL_INTERVAL=10
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AO_URL` | AO HTTP API 地址。设置后启用任务编排功能；留空则禁用 | `""` (禁用) |
| `AO_POLL_INTERVAL` | 轮询间隔（秒）。越小状态更新越快，但 API 请求越多 | `10` |

**配置加载方式：** 后端使用 pydantic-settings，配置定义在 `backend/app/config.py` 的 `Settings` 类中：

```python
AO_URL: str = ""              # 默认为空 = 禁用
AO_POLL_INTERVAL: int = 10    # 默认 10 秒
```

`TaskService.start()` 在启动时检查 `AO_URL`：为空则跳过初始化，不为空则创建 `AOAdapter` 并启动轮询循环。

### 4.2 禁用集成

如果暂时不需要 AO 集成，将 `AO_URL` 设为空即可：

```env
AO_URL=
```

后端日志会打印：`AO_URL not set, task orchestration disabled`

---

## 5. 启动所有服务

### 5.1 启动顺序

**必须先启动 AO，再启动 Claude Office，** 否则后端连接探测会失败（不过后续轮询会自动重连）。

```bash
# 终端 1：启动 AO
cd /Users/apple/Projects/others/random/agent-orchestrator
ao start
# 或者 npx ao start
# AO 启动后监听 http://localhost:3003
```

```bash
# 终端 2：启动 Claude Office（推荐 tmux 模式）
cd /Users/apple/Projects/others/random/claude-office
make dev-tmux
# 后端启动在 :8000，前端启动在 :3000
```

### 5.2 验证连接

```bash
# 检查 AO 是否运行
curl http://localhost:3003/api/sessions
# 预期返回：{"sessions": [...]}

# 检查 Claude Office 后端是否连接到 AO
curl http://localhost:8000/api/v1/tasks/status
# 预期返回：{"connected": true, "adapterType": "ao", "taskCount": 0}

# 检查 AO 中配置的项目列表
curl http://localhost:8000/api/v1/tasks/projects
# 预期返回 agent-orchestrator.yaml 中配置的项目列表
```

如果 `connected` 为 `false`，检查：
- AO 是否正在运行（`curl localhost:3003/api/sessions`）
- `.env` 中 `AO_URL` 是否正确
- 防火墙是否阻断了本地端口通信

### 5.3 管理 tmux session

```bash
# 查看 Claude Office 的 tmux session
tmux list-sessions | grep claude-office

# 切换到后端窗口查看日志
tmux attach -t claude-office:backend

# 切换到前端窗口
tmux attach -t claude-office:frontend

# 在 tmux 内切换窗口：Ctrl-b n / Ctrl-b p

# 关闭 Claude Office
make dev-tmux-kill
```

---

## 6. 使用方式

有三种方式派发任务给 Agent。

### 6.1 CLI 方式（直接调用 AO）

```bash
# 列出可用项目
ao list projects

# 派发任务
ao spawn --project claude-office --issue "fix: resolve login page CSS overflow"

# 查看所有活跃 session
ao status
```

AO 会：
1. 在 `claude-office` 项目目录下创建 git worktree
2. 启动一个新的 tmux session（前缀 `co-`）
3. 在该 session 中运行 claude-code，传入 issue 和 agentRules

### 6.2 UI Spawn 按钮（通过 Claude Office 前端）

1. 打开浏览器访问 `http://localhost:3000`
2. 在 TaskDrawer 面板中点击 **Spawn** 按钮
3. 选择目标项目（下拉列表来自 AO 配置）
4. 输入 issue 描述
5. 点击确认

前端调用后端 `POST /api/v1/tasks/spawn` 接口：

```json
{
  "project_id": "claude-office",
  "issue": "feat: add dark mode toggle to settings page"
}
```

后端通过 `AOAdapter.spawn()` 转发到 AO 的 `POST /api/spawn`。

### 6.3 AO Dashboard

如果 AO 提供了内置 Dashboard（取决于版本），可直接在 `http://localhost:3003` 管理任务。Claude Office 的轮询机制会自动发现通过 Dashboard 创建的任务。

---

## 7. 监控 Agent 工作

### 7.1 tmux attach — 直接观察 Agent 终端

AO 中的每个 Agent 运行在独立的 tmux session 中：

```bash
# 列出所有 AO 创建的 tmux session
tmux list-sessions
# 示例输出：
# co-1: 1 windows (created ...)    <- claude-office 项目的第 1 个 Agent
# co-2: 1 windows (created ...)    <- claude-office 项目的第 2 个 Agent
# ao-1: 1 windows (created ...)    <- agent-orchestrator 项目的 Agent

# 连接到某个 Agent 的终端
tmux attach -t co-1

# 只看不操作（只读模式）
tmux attach -t co-1 -r

# 退出 tmux attach（不关闭 session）：Ctrl-b d
```

### 7.2 ao status — 查看任务列表和状态

```bash
ao status
# 显示所有活跃 session 的状态：spawning / working / pr_open / done / error
```

或通过 API：

```bash
curl http://localhost:3003/api/sessions | python3 -m json.tool
```

### 7.3 TaskDrawer — 前端实时面板

打开 `http://localhost:3000`，TaskDrawer 面板会实时显示：

- 每个任务的状态（spawning -> working -> pr_open -> done）
- 关联的项目
- PR 链接（如果已创建）
- CI 状态
- Review 状态
- 与 Office 中哪个 Agent session 关联（通过 worktree 路径匹配）

状态通过 WebSocket (`/ws/projects`) 实时推送，无需手动刷新。

### 7.4 状态流转

AO 的 session 状态会映射为 Claude Office 内部的 TaskStatus：

| AO 状态 | Claude Office 状态 | 说明 |
|---------|-------------------|------|
| `spawning` | `spawning` | 正在创建 worktree 和启动 Agent |
| `working` / `ready` / `active` / `idle` | `working` | Agent 正在工作 |
| `pr_open` / `pr-open` | `pr_open` | PR 已创建 |
| `review` | `review_pending` | 等待 Code Review |
| `approved` | `approved` | Review 已通过 |
| `merged` | `merged` | PR 已合并 |
| `done` / `killed` / `exited` | `done` | 任务完成 |
| `error` / `failed` | `error` | 任务出错 |

---

## 8. 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       用户交互层                                  │
│                                                                 │
│   浏览器 :3000          CLI            AO Dashboard :3003       │
│   (TaskDrawer)         (ao spawn)      (如果可用)                │
└──────┬──────────────────┬────────────────────┬──────────────────┘
       │ WebSocket         │                    │
       │ /ws/projects      │                    │
       ▼                   │                    │
┌──────────────────┐       │                    │
│ Claude Office    │       │                    │
│ Frontend :3000   │       │                    │
│ (Next.js)        │       │                    │
└──────┬───────────┘       │                    │
       │ HTTP              │                    │
       ▼                   │                    │
┌──────────────────┐       │                    │
│ Claude Office    │       │                    │
│ Backend :8000    │◄──────┘                    │
│ (FastAPI)        │                            │
│                  │    POST /api/v1/tasks/spawn │
│ ┌──────────────┐ │────────────────────────────┘
│ │ TaskService  │ │
│ │              │ │  GET /api/sessions (每 10 秒)
│ │ ┌──────────┐ │ │──────────────────────┐
│ │ │AOAdapter │ │ │                      │
│ │ └──────────┘ │ │                      │
│ └──────────────┘ │                      │
└──────────────────┘                      │
                                          ▼
                              ┌─────────────────────┐
                              │ Agent Orchestrator   │
                              │ :3003                │
                              │                      │
                              │ POST /api/spawn      │
                              │ GET  /api/sessions   │
                              │ GET  /api/projects   │
                              └──────────┬───────────┘
                                         │
                              ┌──────────┴───────────┐
                              │   tmux sessions      │
                              │                      │
                              │  ┌─── co-1 ────────┐ │
                              │  │ claude-code      │ │
                              │  │ (git worktree 1) │ │
                              │  └─────────────────┘ │
                              │  ┌─── co-2 ────────┐ │
                              │  │ claude-code      │ │
                              │  │ (git worktree 2) │ │
                              │  └─────────────────┘ │
                              │  ┌─── ao-1 ────────┐ │
                              │  │ claude-code      │ │
                              │  │ (git worktree 3) │ │
                              │  └─────────────────┘ │
                              └──────────────────────┘
```

**数据流：**

1. **Spawn 流程：** 前端 -> 后端 `POST /api/v1/tasks/spawn` -> `AOAdapter.spawn()` -> AO `POST /api/spawn` -> 创建 worktree + tmux session + claude-code
2. **状态同步：** `TaskService._poll_loop()` 每 10 秒调用 `AOAdapter.poll()` -> AO `GET /api/sessions` -> 比对更新 `Task` 对象
3. **Session 匹配：** `_match_all_sessions()` 通过 worktree 路径将 AO 任务与 Office 中的 claude-code session 关联
4. **广播推送：** 状态变更时 `_broadcast()` 通过 `broadcast_tasks_update()` 推送 WebSocket 消息到所有前端客户端

**关键源码文件：**

| 文件 | 职责 |
|------|------|
| `backend/app/services/adapters/ao.py` | AO HTTP API 适配器，处理 spawn/poll/状态映射 |
| `backend/app/services/task_service.py` | 任务生命周期管理、轮询循环、session 匹配、广播 |
| `backend/app/config.py` | `AO_URL` 和 `AO_POLL_INTERVAL` 配置定义 |
| `backend/app/api/routes/tasks.py` | REST API 路由：`/tasks/status`、`/tasks`、`/tasks/spawn`、`/tasks/projects` |

---

## 9. 常见问题排查

### 连接失败：`connected: false`

**症状：** `GET /api/v1/tasks/status` 返回 `{"connected": false}`

**排查步骤：**

```bash
# 1. 确认 AO 正在运行
curl http://localhost:3003/api/sessions
# 如果连接拒绝，说明 AO 未启动

# 2. 确认 .env 中 AO_URL 正确
cat /Users/apple/Projects/others/random/claude-office/backend/.env
# 应该是 AO_URL=http://localhost:3003

# 3. 确认后端已加载该配置（重启后端）
# 注意：pydantic-settings 使用 @lru_cache，修改 .env 后需要重启后端
make dev-tmux-backend
```

### 任务不可见：TaskDrawer 为空

**可能原因：**

1. **AO 无活跃 session：** 运行 `ao status` 确认是否有正在运行的任务
2. **轮询未触发：** 检查后端日志是否有 `AO poll failed` 的警告
3. **WebSocket 未连接：** 打开浏览器 DevTools -> Network -> WS，确认 `/ws/projects` 连接正常

### Spawn 失败：503 Service Unavailable

**症状：** 前端 Spawn 按钮报 503 错误

**原因：** `TaskService` 未连接到 AO（adapter 为 None 或 `connected` 为 false）

```bash
# 确认连接状态
curl http://localhost:8000/api/v1/tasks/status

# 如果 connected 为 false，先解决连接问题
```

### tmux session 找不到

**症状：** `tmux attach -t co-1` 报 `session not found`

**排查：**

```bash
# 列出所有 session
tmux list-sessions

# 如果没有 co- 或 ao- 前缀的 session，说明 AO 还没有派发任何任务
# 或者任务已经完成/退出

# 检查 AO 的 session 状态
ao status
```

### Agent worktree 冲突

**症状：** Spawn 失败，AO 日志报 worktree 相关错误

**解决：**

```bash
# 查看当前 worktree 列表
cd /Users/apple/Projects/others/random/claude-office
git worktree list

# 清理已废弃的 worktree
git worktree prune
```

### 轮询间隔调优

如果觉得状态更新太慢，减小轮询间隔：

```env
AO_POLL_INTERVAL=3
```

如果 AO 负载较高，增大轮询间隔：

```env
AO_POLL_INTERVAL=30
```

修改后重启后端生效。

### 后端日志查看

```bash
# 如果用 tmux 模式运行
tmux capture-pane -t claude-office:backend -p | tail -50

# 或者直接 attach
tmux attach -t claude-office:backend
```

关注以下日志关键字：
- `Connected to Agent Orchestrator` — 连接成功
- `AO_URL not set, task orchestration disabled` — 未配置 AO_URL
- `Failed to connect to AO` — 连接失败
- `AO poll failed` — 轮询异常
