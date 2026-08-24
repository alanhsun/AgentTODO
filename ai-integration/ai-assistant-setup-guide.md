# 🤖 AI 助手接入指南 (零基础版)

<!-- @purpose -->
指导非技术用户如何将任意支持插件或工具调用的 AI 助手（如 OpenClaw, ChatGPT, Coze 等）与 AgentTODO 系统集成，使其成为个人的“执行力教练”。
<!-- /purpose -->

<!-- @dependencies -->
- 已成功运行在本地的 AgentTODO 实例 (默认 `http://localhost:3300`)
- 支持 MCP、插件配置或工具调用的 AI 助手客户端
<!-- /dependencies -->

---

## 阶段一：配置“智能执行器”工作流 (Skill/Workflow) 🧠

<!-- @purpose -->
通过给 AI 设定初始 Prompt，让其理解何时应该调用对应的任务工具。
<!-- /purpose -->

<!-- @input -->
将以下内容复制并粘贴到 AI 助手的“系统提示词 (System Prompt)”、“角色设定”或“工作流配置”区域：

> **【AgentTODO 代理技能准则】**
> 1. **隐式盘查**：每天当我们进行第一次对话，或我向你请教今日安排时，你应该静默调用 `get_daily_summary` 或 `get_today_agenda` 获取任务概况，无需询问我。
> 2. **化大为小**：当我提出一个含糊的长期目标（例如：“我准备做下个月的旅游攻略”）时，主动帮我拆解为 3-5 个子步骤（如：订机票、订酒店、排行程）。向我确认后，使用 `create_task` 并附带 `subtasks` 参数一次性写入系统。
> 3. **主动追踪**：用户明确汇报某项任务进度时，可通过 `add_task_progress_note` 记录日志并勾选对应子任务；存在重名任务或意图不明确时，先搜索并确认。删除、批量修改或覆盖历史数据必须再次确认。
<!-- /input -->

---

## 阶段二：给 AI 安装“机械手臂”（添加工具插件） 🦾

<!-- @purpose -->
为 AI 助手配置 8 个核心工具，使其能够搜索、读取上下文并安全读写 AgentTODO 数据。支持 MCP 的本地客户端优先使用 [MCP 指南](../docs/mcp-guide.md)，以下 REST/Python 方式用于其他平台。
<!-- /purpose -->

> **说明**：未设置 `API_TOKEN` 时，AI 可像以前一样直接发起 HTTP 请求。若启用了 Token，请为所有 API 请求增加 `Authorization: Bearer <API_TOKEN>`；健康检查除外。

> **网络边界**：`localhost` 只代表运行 AI 工具的那台机器。云端 ChatGPT、Coze 或 Dify 服务无法直接访问你电脑上的本地地址；应使用本地 MCP 客户端、同一局域网内的自托管执行器，或经过认证和 TLS 保护的网关，不要把免认证 API 直接暴露到公网。

使用仓库自带的 `openclaw_tools.py` 时，先安装 `requests`，再设置 `AGENTTODO_URL`、`AGENTTODO_API_TOKEN` 和可选的 `AGENTTODO_TIMEOUT_MS`。脚本会自动附加认证请求头并返回机器可读 JSON。

URL 选择：

- Docker/生产：`http://127.0.0.1:3300/api`
- npm 本地开发后端：`http://127.0.0.1:3301/api`
- npm 本地开发前端代理：`http://localhost:3300/api`

请在 AI 的 **工具配置 / 插件管理** 界面，逐一添加以下 8 个 API 技能：

<!-- @input -->
### 技能 1：获取每日概览 (get_daily_summary)
- **名称**: `get_daily_summary`
- **描述**: 获取当前任务的完整统计大盘（总数、今日待办数、逾期数）。AI 每天初次交谈或需要了解全局时调用。
- **URL**: `http://localhost:3300/api/tasks/summary`
- **Method**: `GET`

### 技能 2：获取今日详情 (get_today_agenda)
- **名称**: `get_today_agenda`
- **描述**: 获取今日确切要做的任务详情，包括子任务的步骤和完成进度。
- **URL**: `http://localhost:3300/api/tasks/today`
- **Method**: `GET`

### 技能 3：获取全部标签 (get_user_tags)
- **名称**: `get_user_tags`
- **描述**: 获取用户当前存在的所有标签字典，在创建任务前用于参考。
- **URL**: `http://localhost:3300/api/tags`
- **Method**: `GET`

### 技能 4：搜索任务 (search_tasks)
- **名称**: `search_tasks`
- **描述**: 按标题或描述搜索任务，写入前确认任务 ID。
- **URL**: `http://localhost:3300/api/tasks?search={{search}}&limit=20`
- **Method**: `GET`

### 技能 5：获取任务上下文 (get_task_context)
- **名称**: `get_task_context`
- **描述**: 一次获取任务、子任务、笔记、附件元数据和近期重复完成记录。
- **URL**: `http://localhost:3300/api/tasks/{{task_id}}/context`
- **Method**: `GET`

### 技能 6：创建新任务 (create_task)
- **名称**: `create_task`
- **描述**: 把用户的话变成具体的待办事项，支持拆分子任务。
- **URL**: `http://localhost:3300/api/tasks`
- **Method**: `POST`
- **参数结构**:
  ```json
  {
    "type": "object",
    "properties": {
      "title": {"type": "string", "description": "任务的标题"},
      "priority": {"type": "string", "description": "low, medium, high, urgent 选一个"},
      "due_date": {"type": "string", "description": "截止日期 YYYY-MM-DD"},
      "recurrence": {"type": "string", "description": "none, daily, weekdays, weekly, monthly 选一个"},
      "subtasks": {"type": "array", "items": {"type": "string"}, "description": "细分的执行步骤列表"}
    },
    "required": ["title"]
  }
  ```

### 技能 7：更新任务 (update_task)
- **名称**: `update_task`
- **描述**: 修改已有任务的常规属性，如标题、延期（修改 due_date）、调整优先级等。
- **URL**: `http://localhost:3300/api/tasks/{{task_id}}`
- **Method**: `PUT`

### 技能 8：记录进度与勾选步骤 (add_task_progress_note)
- **名称**: `add_task_progress_note`
- **描述**: 记录执行进展日志，或标记某个子任务状态为完成。
- **URL**: `http://localhost:3300/api/tasks/{{task_id}}/progress`
- **Method**: `POST`
- **说明**: 笔记、子任务、主状态和某次重复任务完成状态会在同一事务内更新；重试时复用 `request_id`。
<!-- /input -->

### 重复任务参数规则

- `recurrence` 支持 `none`、`daily`、`weekdays`、`weekly`、`monthly`。
- 重复范围从任务创建日期开始，以 `due_date` 为包含式结束日期；不设置截止日期时持续发生。
- 对某一天完成重复任务，传入同一天的 `occurrence_date` 和 `occurrence_completed: true`，不要直接把整个重复任务设为 `done`。
- AI 对同一次写入进行网络重试时，应保持 `request_id` 不变。

---

## 阶段三：测试你的 AI 教练！🎯

<!-- @purpose -->
验证 AI 助手是否能正确理解自然语言并调用对应的 API 接口。
<!-- /purpose -->

<!-- @input -->
配置完毕后，试着对 AI 发送以下指令进行测试：

1. **“早上好，帮我看看今天有哪些必须完成的事情？”**
   *(期望输出：AI 自动调用 `get_today_agenda`，列出待办事项)*

2. **“我要开始筹备下个月的家庭旅游了，大概要去一周。”**
   *(期望输出：AI 拆分“订机票”、“订酒店”等子任务，调用 `create_task` 存入系统)*

3. **“旅游的机票我刚才买好了。”**
   *(期望输出：AI 调用 `add_task_progress_note` 记录笔记并打勾，提醒下一步)*
<!-- /input -->

<!-- @references -->
- 想要了解更详细的接口参数定义？[阅读 API 接口参考](../docs/api-reference.md)
- 使用支持 MCP 的本地客户端？[阅读 MCP 接入指南](../docs/mcp-guide.md)
- 想要开发进阶的本地 CLI 技能？[阅读 CLI 技能开发指南](../docs/cli-skill-guide.md)
<!-- /references -->
