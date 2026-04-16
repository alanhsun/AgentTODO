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
返回当天到期及已逾期的任务，包含子任务进度：
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
  "due_date": "YYYY-MM-DD, 可选",
  "recurrence": "none | daily | weekly | monthly, 默认 none",
  "tags": [1, 2],
  "subtasks": ["子任务1", "子任务2"]
}
```
*提示：AI 可利用 `subtasks` 数组一次性拆分并创建带有子任务的大项目。*
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
<!-- /input -->

### 2.3 更新与删除任务
<!-- @input -->
```http
PUT /api/tasks/:id
DELETE /api/tasks/:id
```
对于 `PUT`，只需传入需要修改的字段（局部更新）。
<!-- /input -->

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
PUT    /api/tasks/:id/subtasks/:sid      # 更新子任务状态 (Body: {"completed": true})
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

<!-- @references -->
- 想通过命令行调用？[参阅 CLI 技能指南](./cli-skill-guide.md)
- 需要了解 AI 交互设定？[参阅 AI 助手工作流](../ai-integration/skill_workflow.md)
<!-- /references -->
