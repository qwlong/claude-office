# Project Persistence to DB

## 目标

将 Project 从纯内存（`ProjectRegistry`）持久化到 DB，消除重启后 "Unknown" project 问题，支持 project 编辑。

## 现状

- Project 只存在于 `ProjectRegistry` 内存中
- 重启后从 session 记录推导 project 归属，推导失败 → "Unknown"
- Project 属性（颜色等）每次重启重新分配

## DB 表结构

### 新增 `projects` 表

```sql
CREATE TABLE projects (
    id          VARCHAR PRIMARY KEY,      -- UUID 字符串
    key         VARCHAR NOT NULL UNIQUE,  -- URL-safe 标识 (如 "projects-others-random")
    name        VARCHAR NOT NULL,         -- 显示名
    color       VARCHAR NOT NULL,         -- 颜色 (如 "#3B82F6")
    label       VARCHAR,                  -- 别名/友好名称
    icon        VARCHAR,                  -- 图标
    description TEXT,                     -- 描述
    path        VARCHAR,                  -- 项目主仓库路径
    sequence    INTEGER DEFAULT 0,        -- 排序 (小的靠前，用于置顶)
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL
);
```

### 修改 `sessions` 表

新增外键列：

```sql
ALTER TABLE sessions ADD COLUMN project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE;
```

保留 `project_name` 和 `project_root` 做兼容/回填。`project_id` 是新的关联方式。

Sessions 表主键保持 `id` VARCHAR（session UUID）不变。

## 数据流

### 现在

```
event 到达 → 推导 project_name → ProjectRegistry 内存注册 → 重启丢失
```

### 改后

```
event 到达
  → 推导 project_name + path
  → 查 DB projects 表 (by key)
  → 不存在 → INSERT (自动创建，分配颜色)
  → 存在 → 复用
  → 更新 session.project_id = project.id
重启 → 从 DB 加载 projects 表 → 不需要推导
```

## ProjectRegistry 改造

`ProjectRegistry` 从纯内存变为 DB-backed：

| 方法 | 现在 | 改后 |
|------|------|------|
| `register_session` | 内存 dict 操作 | 查/创建 DB project，更新 session.project_id |
| `get_project_for_session` | 内存 dict 查找 | DB 查询（可加内存缓存） |
| `get_all_projects` | 内存 dict.values() | DB 查询 |

内存缓存策略：启动时从 DB 全量加载到内存，后续写操作同时更新 DB + 内存。

## API

| 方法 | 路径 | 用途 |
|------|------|------|
| `GET` | `/api/v1/projects` | 列出所有 project（已有，改为从 DB 读） |
| `PATCH` | `/api/v1/projects/{key}` | 编辑 project（name, color, label, icon, description, sequence） |
| `DELETE` | `/api/v1/projects/{key}` | 删除 project + 级联删 sessions/events |

## 删除行为

删除 Project → `ON DELETE CASCADE` 级联删除：
- 该 project 下所有 session（sessions 表）
- 每个 session 的所有 events（events 表，通过 session_id 关联）

## 迁移策略

1. 创建 `projects` 表
2. 从现有 `sessions` 表的 `project_name` + `project_root` 回填 `projects` 表
3. 为 `sessions` 表添加 `project_id` 列并回填
4. `ProjectRegistry` 启动时从 DB 加载，不再从 session 记录推导

## 文件变更

| 文件 | 变更 |
|------|------|
| `backend/app/db/models.py` | 新增 `ProjectRecord` 模型，`SessionRecord` 加 `project_id` 外键 |
| `backend/app/core/project_registry.py` | 改为 DB-backed，启动时加载，写操作同步 DB |
| `backend/app/core/event_processor.py` | `_auto_register_project` 改为写 DB |
| `backend/app/api/routes/projects.py` | 新增 PATCH、DELETE 端点 |
| `backend/app/api/routes/sessions.py` | 删除时检查级联 |
| `backend/tests/` | 新增 project CRUD 测试 |

## 不做的事情

- 不改前端 projectStore 结构（前端仍然从 WebSocket 接收 ProjectGroup）
- 不改 WebSocket 协议
- 不加 project 创建 UI（自动创建够用）
- 不加 project 编辑 UI（API 先行，UI 后面再做）
