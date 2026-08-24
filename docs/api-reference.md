# AgentTODO API 参考文档

<!-- @purpose -->
本文档详细定义了 AgentTODO 系统的 RESTful API 接口规范，专为 AI 助手及前端客户端调用设计。
系统采用本地优先模式：未设置 `API_TOKEN` 时无需认证；设置后可用浏览器 Basic Auth、Bearer Token 或 `X-API-Token` 请求头访问。系统不包含用户注册、JWT 或多用户权限模型。
<!-- /purpose -->

<!-- @dependencies -->
- 基础 URL: Docker/生产环境为 `http://<服务器地址>:3300/api`；本地开发后端为 `http://127.0.0.1:3301/api`。Vite 前端的 `http://localhost:3300/api` 会代理到后端。
- 内容类型: `application/json`
- API 规范: OpenAPI 3.0 (可访问 `/api/openapi.json` 获取)
- 交互式文档: 浏览器访问 `/api-docs` 查看 Swagger UI
<!-- /dependencies -->

启用 `API_TOKEN` 后，脚本可选择以下一种请求头：

```http
Authorization: Bearer <API_TOKEN>
# 或
X-API-Token: <API_TOKEN>
```

`GET /api/health` 始终免认证，用于本地和容器健康检查。

---

## 目录
1. [AI 专用统计端点](#1-ai-专用统计端点)
2. [任务 (Tasks) CRUD](#2-任务-tasks-crud)
3. [任务子元素 (Subtasks & Notes)](#3-任务子元素-subtasks--notes)
4. [标签 (Tags)](#4-标签-tags)
5. [系统与 Webhook](#5-系统与-webhook)
6. [状态码与错误处理](#6-状态码与错误处理)

---

## 1. AI 专用统计端点

<!-- @purpose -->
为 AI 助手设计的宏观数据接口，便于快速获取用户的整体任务状态。
<!-- /purpose -->

### 1.1 任务统计概览
<!-- @input -->
```http
GET /api/tasks/summary
```
<!-- /input -->

<!-- @output -->
返回全局任务统计信息：
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
返回当天实际发生的任务及已逾期任务，包含子任务统计和本次重复完成状态：
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
      "subtask_progress": {"total": 3, "completed": 1},
      "agenda_type": "today",
      "occurrence_date": "2026-03-10",
      "occurrence_completed": false
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
  "due_date": "YYYY-MM-DD, 可选",
  "recurrence": "none | daily | weekdays | weekly | monthly, 默认 none",
  "tags": [1, 2],
  "subtasks": ["子任务1", "子任务2"]
}
```
*提示：AI 可利用 `subtasks` 数组一次性拆分并创建带有子任务的大项目。*

重复任务从 `created_at` 所在日期开始，到 `due_date` 为止（含首尾日期）；不设置 `due_date` 时会持续发生。`weekdays` 仅周一至周五，`weekly` 每 7 天，`monthly` 使用创建日的日号且跳过不存在该日号的月份。任务主体不会按天复制。

旧版 `recurrence_end` 字段仍可读取和写入，但已废弃；新客户端应只使用 `due_date` 表示重复结束日期。
<!-- /input -->

### 2.2 查询与搜索任务
<!-- @input -->
```http
GET /api/tasks?status=todo&priority=high&search=关键词&sort=due_date&order=asc&page=1&limit=20
```
支持的 Query 参数：
- `status`: 按状态筛选（多选逗号分隔）
- `priority`: 按优先级筛选
- `tag`: 标签ID
- `search`: 模糊搜索标题和描述
- `due_before` / `due_after`: 时间过滤
- `sort`: `created_at | updated_at | due_date | priority | title | status`
- `order`: `asc | desc`
- `page` / `limit`: 分页；`limit` 最大 100

每个任务会额外返回 `subtask_progress`，例如 `{"total": 4, "completed": 2}`；没有子任务时为 `null`。
<!-- /input -->

### 2.3 更新与删除任务
<!-- @input -->
```http
PUT /api/tasks/:id
DELETE /api/tasks/:id
```
对于 `PUT`，只需传入需要修改的字段（局部更新）。

读取单个任务使用：

```http
GET /api/tasks/:id
```
<!-- /input -->

### 2.4 AI 紧凑上下文

```http
GET /api/tasks/:id/context
```

一次返回任务、标签、子任务、最近 50 条笔记、附件元数据和最近 31 条重复完成记录，减少 AI 连续发起多次查询。附件只返回安全的公开元数据，不返回磁盘存储文件名。

### 2.5 原子记录进展

```http
POST /api/tasks/:id/progress
```

```json
{
  "note_content": "今天已经完成核对",
  "complete_subtasks": [12],
  "task_status": "in_progress",
  "occurrence_date": "2026-03-10",
  "occurrence_completed": true,
  "source": "ai",
  "request_id": "conversation-123-step-4"
}
```

至少需要提供 `note_content`、`complete_subtasks`、`task_status` 或一组 `occurrence_date` + `occurrence_completed`。所有变化在同一个 SQLite 事务中完成；子任务 ID 必须属于该任务，发生日期也必须符合任务的重复规则。AI 重试时复用同一个 `request_id`，接口会返回 `duplicate: true`，不会重复添加笔记。

### 2.6 批量操作

```http
POST /api/tasks/batch
```

```json
{
  "action": "update_status",
  "ids": [1, 2, 3],
  "value": "in_progress"
}
```

`action` 支持 `update_status`、`update_priority` 和 `delete`，单次最多处理 100 个任务。批量删除会同时清理关联附件文件，调用前应由用户明确确认。

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
PUT    /api/tasks/:id/subtasks/:sid      # 更新标题或状态 (Body: {"title": "新标题", "completed": true})
DELETE /api/tasks/:id/subtasks/:sid      # 删除子任务
```
<!-- /input -->

### 3.2 任务附件
<!-- @input -->
```http
GET    /api/tasks/:id/attachments                         # 获取附件列表
POST   /api/tasks/:id/attachments                         # multipart/form-data，字段名 file
GET    /api/tasks/:id/attachments/:aid/download           # 下载原文件
GET    /api/tasks/:id/attachments/:aid/preview            # 预览 JPEG/PNG/GIF/WebP
DELETE /api/tasks/:id/attachments/:aid                    # 删除附件及磁盘文件
```

附件文件保存在 `ATTACHMENT_DIR`，SQLite 仅保存名称、类型、大小和 SHA-256 等元数据。默认单文件上限为 20 MB，可通过 `ATTACHMENT_MAX_SIZE_MB` 调整。只有 JPEG、PNG、GIF 和 WebP 返回 `preview_url`；其他文件使用下载接口。
<!-- /input -->

### 3.3 任务备注 (进展日志)
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
GET    /api/tags
POST   /api/tags         # Body: {"name": "工作", "color": "#3b82f6"}
PUT    /api/tags/:id     # Body: {"name": "新名称"}
DELETE /api/tags/:id
```
<!-- /input -->

---

## 5. 系统与 Webhook

<!-- @purpose -->
获取系统状态或配置主动通知（Push）通道，使得任务逾期等事件能主动推给 AI。
<!-- /purpose -->

### 5.1 注册 Webhook
<!-- @input -->
```http
POST /api/webhooks
```
**请求体**:
```json
{
  "name": "AI Agent 监听器",
  "url": "http://your-ai-agent-address:8000/webhook",
  "events": ["task.created", "task.updated", "task.overdue"]
}
```
<!-- /input -->

查询现有 Webhook：

```http
GET /api/webhooks
```

`events` 只接受 `task.created`、`task.updated`、`task.overdue` 或 `*`。默认会订阅前三项。出于 SSRF 防护，私网地址和主机白名单受 `WEBHOOK_ALLOW_PRIVATE_NETWORK` 与 `WEBHOOK_ALLOWED_HOSTS` 控制。

### 5.2 健康检查
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

### 5.3 备份与恢复
<!-- @input -->
```http
GET  /api/backup/export.zip     # 推荐：数据库和附件完整 ZIP 备份
POST /api/backup/import.zip     # multipart/form-data，字段名 backup

GET  /api/backup/export         # 兼容旧版：仅 JSON，不含附件文件
POST /api/backup/import         # 兼容旧版 JSON 恢复
```

ZIP 恢复会核验附件大小与 SHA-256。旧版 JSON 恢复不包含附件，因此会清除当前附件；日常使用应优先选择 ZIP。
<!-- /input -->

---

## 6. 状态码与错误处理

- `200/201`：请求成功。
- `400`：字段、日期、重复规则或文件格式不合法；详细校验信息可能位于 `errors` 数组。
- `401`：已配置 `API_TOKEN`，但认证缺失或错误。
- `404`：任务或子资源不存在。
- `409`：幂等 `request_id` 已被另一个任务使用。
- `413`：JSON 请求体超过 `JSON_BODY_LIMIT`；附件或备份文件超限会返回 `400`。
- `500`：服务端异常；客户端可记录错误并谨慎重试读取请求。

健康检查是唯一始终免认证的 API。Swagger UI 和 `/api/openapi.json` 在启用 Token 后同样受到保护。

<!-- @references -->
- 想通过命令行调用？[参阅 CLI 技能指南](./cli-skill-guide.md)
- 使用本地 AI 客户端？[参阅 MCP 指南](./mcp-guide.md)
- 需要了解 AI 交互设定？[参阅 AI 助手工作流](../ai-integration/skill_workflow.md)
<!-- /references -->
