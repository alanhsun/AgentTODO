# 🤖 AI 助手接入指南 (零基础版)

<purpose>
指导非技术用户如何将任意支持插件或工具调用的 AI 助手（如 OpenClaw, ChatGPT, Coze 等）与 AgentTODO 系统集成，使其成为个人的“执行力教练”。
</purpose>

<dependencies>
- 已成功运行在本地的 AgentTODO 实例 (默认 `http://localhost:3300`)
- 支持插件配置/工具调用的 AI 助手客户端
</dependencies>

---

## 阶段一：配置“智能执行器”工作流 (Skill/Workflow) 🧠

<purpose>
通过给 AI 设定初始 Prompt，让其理解何时应该调用对应的任务工具。
</purpose>

<input>
将以下内容复制并粘贴到 AI 助手的“系统提示词 (System Prompt)”、“角色设定”或“工作流配置”区域：

> **【AgentTODO 代理技能准则】**
> 1. **隐式盘查**：每天当我们进行第一次对话，或我向你请教今日安排时，你应该静默调用 `get_daily_summary` 或 `get_today_agenda` 获取任务概况，无需询问我。
> 2. **化大为小**：当我提出一个含糊的长期目标（例如：“我准备做下个月的旅游攻略”）时，主动帮我拆解为 3-5 个子步骤（如：订机票、订酒店、排行程）。向我确认后，使用 `create_task` 并附带 `subtasks` 参数一次性写入系统。
> 3. **主动追踪**：在日常对话中（例如：“我终于写完那段代码了”），请主动提取进度信息，通过 `add_task_progress_note` 记录为任务日志，并自动勾选对应子任务或将主任务状态更新为完成。无需经过我的明确同意。
</input>

---

## 阶段二：给 AI 安装“机械手臂”（添加工具插件） 🦾

<purpose>
为 AI 助手配置 6 个核心的 REST API 技能，使其能够实际读写 AgentTODO 系统数据。
</purpose>

> **说明**：AgentTODO 已全面重构为**免认证 (Zero-Auth)** 架构，AI 直接发起 HTTP 请求即可。

请在 AI 的 **工具配置 / 插件管理** 界面，逐一添加以下 6 个 API 技能：

<input>
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

### 技能 4：创建新任务 (create_task)
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
      "recurrence": {"type": "string", "description": "none, daily, weekly, monthly 选一个"},
      "subtasks": {"type": "array", "items": {"type": "string"}, "description": "细分的执行步骤列表"}
    },
    "required": ["title"]
  }
  ```

### 技能 5：更新任务 (update_task)
- **名称**: `update_task`
- **描述**: 修改已有任务的常规属性，如标题、延期（修改 due_date）、调整优先级等。
- **URL**: `http://localhost:3300/api/tasks/{{task_id}}`
- **Method**: `PUT`

### 技能 6：记录进度与勾选步骤 (add_task_progress_note)
- **名称**: `add_task_progress_note`
- **描述**: 记录执行进展日志，或标记某个子任务状态为完成。
- **URL**: `http://localhost:3300/api/tasks/{{task_id}}/notes` (注：对于无法组合请求的 AI 客户端，建议使用开发者提供的 Python 包装脚本或 CLI 技能通道)
</input>

---

## 阶段三：测试你的 AI 教练！🎯

<purpose>
验证 AI 助手是否能正确理解自然语言并调用对应的 API 接口。
</purpose>

<input>
配置完毕后，试着对 AI 发送以下指令进行测试：

1. **“早上好，帮我看看今天有哪些必须完成的事情？”**
   *(期望输出：AI 自动调用 `get_today_agenda`，列出待办事项)*

2. **“我要开始筹备下个月的家庭旅游了，大概要去一周。”**
   *(期望输出：AI 拆分“订机票”、“订酒店”等子任务，调用 `create_task` 存入系统)*

3. **“旅游的机票我刚才买好了。”**
   *(期望输出：AI 调用 `add_task_progress_note` 记录笔记并打勾，提醒下一步)*
</input>

<references>
- 想要了解更详细的接口参数定义？[阅读 API 接口参考](../docs/api-reference.md)
- 想要开发进阶的本地 CLI 技能？[阅读 CLI 技能开发指南](../docs/cli-skill-guide.md)
</references>
