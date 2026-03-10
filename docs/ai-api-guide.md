# AgentTODO API — AI Agent 接口规范

> 本文档专门为 AI Agent / LLM 工具调用 AgentTODO 而编写。
> 提供基于 JSON Schema 的原生 HTTP REST API，以及通用的 MCP Server 支持。

## 🔌 选项一：通过 MCP 接入（强烈推荐）

如果你的 Agent 工具支持 MCP (Model Context Protocol)，这是最轻量和最原生的方式。你无需在此查阅任何 REST API 接口文档。

直接在配置文件中挂载：
```json
{
  "agenttodo": {
    "command": "node",
    "args": ["/你的项目绝对路径/AgentTODO/server/src/mcp.js"]
  }
}
```

## 🌐 选项二：使用传统 REST API

### 连接信息

- Base URL: `http://localhost:3300`（根据实际部署地址修改）
- Content-Type: `application/json`
- **无需认证** — 本地应用，所有请求直接访问

---

### API 端点速查

| 方法   | 路径                          | 用途             |
|--------|-------------------------------|-----------------|
| **GET**| **`/api/tasks/summary`**      | **📊 任务统计概览** |
| **GET**| **`/api/tasks/today`**        | **📅 今日待办**    |
| **GET**| **`/api/tasks/overdue`**      | **⚠️ 逾期任务**   |
| GET    | /api/tasks                    | 查询任务列表      |
| POST   | /api/tasks                    | 创建任务         |
| GET    | /api/tasks/:id                | 获取单个任务      |
| PUT    | /api/tasks/:id                | 更新任务         |
| DELETE | /api/tasks/:id                | 删除任务         |
| POST   | /api/tasks/batch              | 批量操作         |
| GET    | /api/tasks/:id/subtasks       | 获取子任务列表    |
| POST   | /api/tasks/:id/subtasks       | 添加子任务       |
| PUT    | /api/tasks/:id/subtasks/:sid  | 更新/完成子任务   |
| DELETE | /api/tasks/:id/subtasks/:sid  | 删除子任务       |
| GET    | /api/tasks/:id/notes          | 获取任务备注      |
| POST   | /api/tasks/:id/notes          | 添加备注         |
| DELETE | /api/tasks/:id/notes/:nid     | 删除备注         |
| GET    | /api/tags                     | 获取标签列表      |
| POST   | /api/tags                     | 创建标签         |
| PUT    | /api/tags/:id                 | 更新标签         |
| DELETE | /api/tags/:id                 | 删除标签         |
| GET    | /api/webhooks                 | 获取所有 Webhook |
| POST   | /api/webhooks                 | 注册主动推送地址 |
| GET    | /api/health                   | 健康检查         |

---

## 枚举值（严格使用）

**status（任务状态）**:  `todo` | `in_progress` | `done`

**priority（优先级）**: `low` | `medium` | `high` | `urgent`

**recurrence（重复频率）**: `none` | `daily` | `weekly` | `monthly`

---

## 🤖 AI 专用端点（推荐首先使用）

### 任务统计概览

```
GET /api/tasks/summary
```

```json
{
  "total": 15,
  "by_status": {"todo": 8, "in_progress": 4, "done": 3},
  "overdue": 2,
  "due_today": 3,
  "by_priority": {"urgent": 1, "high": 3},
  "date": "2026-03-10"
}
```

### 今日待办

```
GET /api/tasks/today
```

返回当天到期+已逾期未完成任务，含子任务进度：

```json
{
  "date": "2026-03-10",
  "tasks": [
    {
      "id": 1, "title": "每日锻炼", "priority": "high",
      "due_date": "2026-03-10", "recurrence": "daily",
      "subtask_progress": {"total": 3, "completed": 1}
    }
  ]
}
```

### 逾期任务

```
GET /api/tasks/overdue
```

---

## 创建任务

```
POST /api/tasks
```

```json
{
  "title": "string, 必填, 最大255字符",
  "description": "string, 可选",
  "status": "todo | in_progress | done, 默认 todo",
  "priority": "low | medium | high | urgent, 默认 medium",
  "due_date": "YYYY-MM-DD, 可选",
  "recurrence": "none | daily | weekly | monthly, 默认 none",
  "recurrence_end": "YYYY-MM-DD, 可选",
  "tags": [1, 2],
  "subtasks": ["子任务1", "子任务2"]
}
```

最小请求: `{"title": "买牛奶"}`

---

## 查询任务

```
GET /api/tasks?status=todo&priority=high&search=关键词&sort=due_date&order=asc&page=1&limit=20
```

| 参数        | 说明                           | 示例值              |
|------------|--------------------------------|-------------------|
| status     | 按状态筛选，逗号可多选             | `todo,in_progress` |
| priority   | 按优先级筛选                     | `high,urgent`      |
| tag        | 按标签ID筛选                     | `1,3`             |
| search     | 模糊搜索标题和描述               | `报告`              |
| due_before | 截止日期 ≤                      | `2026-03-15`       |
| due_after  | 截止日期 ≥                      | `2026-03-01`       |
| sort       | 排序字段                        | `created_at` / `due_date` / `priority` |
| order      | 排序方向                        | `asc` / `desc`     |
| page/limit | 分页                           | `1` / `20`         |

---

## 更新任务

```
PUT /api/tasks/:id
```

仅传需修改字段: `{"status": "done"}` 或 `{"recurrence": "weekly"}`

---

## 子任务

```
GET    /api/tasks/:id/subtasks           → 列出
POST   /api/tasks/:id/subtasks           Body: {"title": "步骤1"}
PUT    /api/tasks/:id/subtasks/:sid      Body: {"completed": true}
DELETE /api/tasks/:id/subtasks/:sid
```

## 任务备注

```
GET    /api/tasks/:id/notes              → 列出（时间倒序）
POST   /api/tasks/:id/notes             Body: {"content": "进展", "source": "ai"}
DELETE /api/tasks/:id/notes/:nid
```

## 批量操作

```
POST /api/tasks/batch
Body: {"action": "update_status", "ids": [1,2,3], "value": "done"}
      {"action": "delete", "ids": [4,5]}
```

---

## 🔔 Webhooks (主动推送机制)

为了能够接收主动通知（如每天早上的“任务逾期”提醒，或者任务被前端更新时的即时反馈），AI Agent 可以向 Tracker 注册自己的监听接口。

### 注册 Webhook

```
POST /api/webhooks
```

```json
{
  "name": "OpenClaw Daily Alerts",
  "url": "http://your-ai-agent-address:8000/webhook-listener",
  "events": ["task.created", "task.updated", "task.overdue"]
}
```

- **events**: 当前支持 `task.created`、`task.updated`、`task.overdue`。也可以传入 `["*"]` 来监听所有。

### 接收推送数据格式

当事件触发时，Tracker 会主动朝填写的 `url` 发送 `POST` 请求，AI 应该接收并根据 `event` 类型处理播报或状态同步：

```json
{
  "event": "task.overdue",
  "timestamp": "2026-03-10T09:00:00.000Z",
  "data": {
    "count": 2,
    "tasks": [
      { "id": 1, "title": "拖延的报告", "due_date": "2026-03-09", ... }
    ]
  }
}
```

---

## 标签

```
GET    /api/tags
POST   /api/tags         Body: {"name": "工作", "color": "#3b82f6"}
PUT    /api/tags/:id      Body: {"name": "新名称"}
DELETE /api/tags/:id
```

---

## 任务对象结构

```json
{
  "id": 1,
  "title": "每日锻炼",
  "description": "划船机30分钟",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-03-10",
  "recurrence": "daily",
  "recurrence_end": null,
  "created_at": "2026-03-09T14:30:00.000Z",
  "updated_at": "2026-03-09T15:00:00.000Z",
  "tags": [{"id": 1, "name": "健康", "color": "#22c55e"}]
}
```

---

## 错误处理

| 状态码 | 含义     | 响应格式                          |
|-------|----------|----------------------------------|
| 400   | 参数错误  | `{"errors": ["Title is..."]}` |
| 404   | 不存在   | `{"error": "Task not found"}`     |
| 500   | 服务器错误 | `{"error": "Internal server error"}` |

---

## AI Agent 典型工作流

### 场景 1：每日晨报
```
1. GET /api/tasks/summary  → 全局概览
2. GET /api/tasks/today    → 今日任务
3. 组合报告回复用户
```

### 场景 2：创建周期性任务
```
POST /api/tasks {"title":"每日锻炼","recurrence":"daily","due_date":"2026-03-10","subtasks":["热身","划船30分钟","拉伸"]}
```

### 场景 3：记录进度
```
POST /api/tasks/:id/notes {"content":"已完成热身","source":"ai"}
PUT  /api/tasks/:id/subtasks/1 {"completed":true}
```

### 场景 4：处理逾期
```
GET /api/tasks/overdue → 获取逾期列表
PUT /api/tasks/:id {"due_date":"新日期"} 或 {"status":"done"}
```

### 场景 5：清理已完成
```
GET  /api/tasks?status=done&limit=100
POST /api/tasks/batch {"action":"delete","ids":[...]}
```
