# AgentTODO API 参考文档

<!-- @purpose -->
本文档详细定义了 AgentTODO 系统的 RESTful API 接口规范，专为 AI 助手及前端客户端调用设计。
整个系统已重构为 **本地私有化 (Zero-Auth)** 模式，无需传递任何 JWT 认证信息即可直接访问所有接口。
<!-- /purpose -->

<!-- @dependencies -->
- 基础 URL: `http://<服务器地址>:3300` (开发模式下，Vite 前端在 3300 端口会自动代理 API 请求至后端的 3301)
- 内容类型: `application/json`
- API 规范: OpenAPI 3.0 (可访问 `/api/openapi.json` 获取)
- 交互式文档: 浏览器访问 `/api-docs` 查看 Swagger UI
<!-- /dependencies -->

---

## 目录
1. [AI 专用统计端点](#1-ai-专用统计端点)
2. [任务 (Tasks) CRUD](#2-任务-tasks-crud)
3. [任务子元素 (Subtasks & Notes)](#3-任务子元素-subtasks--notes)
4. [标签 (Tags)](#4-标签-tags)
5. [系统与 Webhook](#5-系统与-webhook)
6. [通用约定](#6-通用约定)

---

## 1. AI 专用统计端点

<!-- @purpose -->
为 AI 助手设计的宏观数据接口，便于快速获取用户的整体任务状态。
所有"今天 / 逾期"的判断均基于服务器本地时区（通过 `TZ` 环境变量配置）。
<!-- /purpose -->

### 1.1 任务统计概览
<!-- @input -->
```http
GET /api/tasks/summary
```
<!-- /input -->

<!-- @output -->
返回全局任务统计信息（`by_priority` 只统计未完成任务）：
```json
{
  "total": 15,
  "by_status": {"todo": 8, "in_progress": 4, "done": 3},
  "overdue": 2,
  "due_today": 3,
  "completed_today": 1,
  "by_priority": {"urgent": 1, "high": 3},
  "date": "2026-03-10"
}
```
<!-- /output -->

### 1.2 今日待办详情
<!-- @input -->
```http
GET /api/tasks/today
```
<!-- /input -->

<!-- @output -->
返回当天到期及已逾期的未完成任务，按优先级（紧急 → 低）、截止日期排序，附带标签、**完整子任务列表（含 ID）**与进度：
```json
{
  "date": "2026-03-10",
  "tasks": [
    {
      "id": 1,
      "title": "每日锻炼",
      "priority": "high",
      "due_date": "2026-03-10",
      "recurrence": "daily",
      "is_overdue": false,
      "tags": [{"id": 2, "name": "健康", "color": "#22c55e"}],
      "subtasks": [{"id": 7, "title": "热身", "completed": true, "sort_order": 1}],
      "subtask_progress": {"total": 3, "completed": 1}
    }
  ]
}
```
<!-- /output -->

### 1.3 逾期任务列表
<!-- @input -->
```http
GET /api/tasks/overdue
```
<!-- /input -->

---

## 2. 任务 (Tasks) CRUD

<!-- @purpose -->
对核心业务实体“任务”进行增删改查。
<!-- /purpose -->

### 2.1 创建任务
<!-- @input -->
```http
POST /api/tasks
```
**请求体 JSON Schema**:
```json
{
  "title": "string, 必填, 最大255字符",
  "description": "string, 可选",
  "status": "todo | in_progress | done, 默认 todo",
  "priority": "low | medium | high | urgent, 默认 medium",
  "due_date": "YYYY-MM-DD, 可选（ISO 日期时间会自动截取日期部分）",
  "recurrence": "none | daily | weekly | monthly, 默认 none",
  "recurrence_end": "YYYY-MM-DD, 可选",
  "tags": [1, 2],
  "subtasks": ["子任务1", "子任务2"]
}
```
*提示：AI 可利用 `subtasks` 数组一次性拆分并创建带有子任务的大项目。引用不存在的标签 ID 会返回 400，且整个创建操作回滚。*
<!-- /input -->

### 2.2 查询与搜索任务
<!-- @input -->
```http
GET /api/tasks?status=todo&priority=high&search=关键词&sort=due_date&order=asc&page=1&limit=20
```
支持的 Query 参数：
- `status`: 按状态筛选（多选逗号分隔）
- `priority`: 按优先级筛选（多选逗号分隔）
- `tag`: 标签ID（多选逗号分隔，匹配任意一个）
- `search`: 模糊搜索标题和描述
- `due_before` / `due_after`: 截止日期范围（YYYY-MM-DD，含边界）
- `sort`: `created_at | updated_at | due_date | priority | title | status`。`priority` 按业务含义排序；`due_date` 排序时无截止日期的任务始终在最后
- `page` / `limit`: 分页，`limit` 最大 500

每个任务附带 `tags` 与 `subtask_progress`（无子任务时为 `null`）。
<!-- /input -->

### 2.3 获取任务详情
<!-- @input -->
```http
GET /api/tasks/:id
```
<!-- /input -->

<!-- @output -->
返回任务全部字段，以及 `tags`、`subtasks`、`subtask_progress`、`notes`（按时间倒序）。
<!-- /output -->

### 2.4 更新与删除任务
<!-- @input -->
```http
PUT /api/tasks/:id
DELETE /api/tasks/:id
```
对于 `PUT`，只需传入需要修改的字段（局部更新）；`due_date` / `recurrence_end` 传 `null` 可清空；传 `tags` 会整体替换。
删除任务会级联删除其子任务、进展笔记和标签关联。
<!-- /input -->

<!-- @output -->
**周期任务**：当 `recurrence` 不为 `none` 的任务被标记为 `done` 时，系统会自动生成下一次实例（复制标题、描述、优先级、标签，子任务重置为未完成；下一次截止日期总是晚于今天，超过 `recurrence_end` 则不再生成），响应中会额外包含：
```json
{ "id": 12, "status": "done", "recurrence": "none", "next_occurrence": { "id": 13, "due_date": "2026-03-11" } }
```
已完成的旧实例不再保留重复规则，避免反复切换状态导致重复生成。`completed_at` 字段会随状态自动维护。
<!-- /output -->

### 2.5 批量操作
<!-- @input -->
```http
POST /api/tasks/batch
```
```json
{ "action": "update_status | update_priority | delete", "ids": [1, 2, 3], "value": "done" }
```
<!-- /input -->

<!-- @output -->
```json
{ "message": "Batch update_status completed", "affected": 2, "not_found": [3], "next_occurrences": [] }
```
<!-- /output -->

---

## 3. 任务子元素 (Subtasks & Notes)

<!-- @purpose -->
管理任务底下的拆分步骤（子任务）和进展日志（备注）。
<!-- /purpose -->

### 3.1 子任务管理
<!-- @input -->
```http
GET    /api/tasks/:id/subtasks           # 获取子任务列表
POST   /api/tasks/:id/subtasks           # 添加新子任务 (Body: {"title": "步骤1"})
PUT    /api/tasks/:id/subtasks/:sid      # 更新子任务 (Body: {"completed": true} / {"title": "..."} / {"sort_order": 2})
DELETE /api/tasks/:id/subtasks/:sid      # 删除子任务
```
<!-- /input -->

### 3.2 任务备注 (进展日志)
<!-- @input -->
```http
GET    /api/tasks/:id/notes              # 获取备注列表
POST   /api/tasks/:id/notes              # 记录进展 (Body: {"content": "进展", "source": "ai"})
DELETE /api/tasks/:id/notes/:nid         # 删除备注
```
<!-- /input -->

---

## 4. 标签 (Tags)

<!-- @purpose -->
管理任务分类标签字典。
<!-- /purpose -->

<!-- @input -->
```http
GET    /api/tags                          # 返回每个标签的 task_count
POST   /api/tags         # Body: {"name": "工作", "color": "#3b82f6"}
PUT    /api/tags/:id     # Body: {"name": "新名称"}
DELETE /api/tags/:id
```
名称最长 50 字符且唯一（重复返回 409），颜色需为 `#RRGGBB` 格式。
<!-- /input -->

---

## 5. 系统与 Webhook

<!-- @purpose -->
获取系统状态或配置主动通知（Push）通道，使得任务逾期等事件能主动推给 AI。
<!-- /purpose -->

### 5.1 管理 Webhook
<!-- @input -->
```http
GET    /api/webhooks
POST   /api/webhooks
PUT    /api/webhooks/:id     # 可更新 name / url / events / is_active
DELETE /api/webhooks/:id
```
**注册请求体**:
```json
{
  "name": "AI Agent 监听器",
  "url": "http://your-ai-agent-address:8000/webhook",
  "events": ["task.created", "task.updated", "task.completed", "task.deleted", "task.overdue"]
}
```
`events` 省略时默认为 `["task.created", "task.updated", "task.overdue"]`，使用 `"*"` 订阅全部事件。
<!-- /input -->

<!-- @output -->
推送格式（POST 到你的 URL，请求头包含 `X-AgentTODO-Event`）：
```json
{ "event": "task.overdue", "timestamp": "2026-03-10T01:00:00.000Z", "data": { "date": "2026-03-10", "count": 2, "tasks": [] } }
```
`task.overdue` 由定时任务触发（默认每天 9:00，可通过 `OVERDUE_CRON` 配置）。
<!-- /output -->

### 5.2 备份与恢复
<!-- @input -->
```http
GET  /api/backup/export   # 导出全部数据 (JSON)
POST /api/backup/import   # 用导出的 JSON 覆盖全部数据（在事务中执行，失败不会破坏现有数据）
```
<!-- /input -->

### 5.3 健康检查
<!-- @input -->
```http
GET /api/health
```
<!-- /input -->

<!-- @output -->
```json
{
  "status": "ok",
  "timestamp": "2026-03-10T03:30:00.000Z"
}
```
<!-- /output -->

---

## 6. 通用约定

<!-- @purpose -->
错误响应格式与状态码约定，便于 AI 根据错误信息自我修正。
<!-- /purpose -->

<!-- @output -->
- `400`：参数错误。字段校验失败返回 `{"errors": ["..."]}`，其它返回 `{"error": "..."}`（包括非法 JSON 请求体）
- `404`：资源不存在，或请求了未知的 `/api/*` 路径
- `409`：标签名称冲突
- `413`：请求体超过 `JSON_LIMIT`
- `500`：服务器内部错误
<!-- /output -->

<!-- @references -->
- 想通过命令行调用？[参阅 CLI 技能指南](./cli-skill-guide.md)
- 需要了解 AI 交互设定？[参阅 AI 助手工作流](../ai-integration/skill_workflow.md)
<!-- /references -->
