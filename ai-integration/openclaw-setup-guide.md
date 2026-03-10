# 🤖 OpenClaw 助手接入指南 (零基础版)

如果你是零代码基础的用户，想要让 **OpenClaw**（或其他支持插件的 AI 助手）变身成为你的专属“执行力教练”，请按照以下简单的「复制+粘贴」步骤操作即可！

---

## 阶段一：配置“智能执行器”工作流 (Skill/Workflow) 🧠

在这个方案中，**我们不会去强行扭曲你所使用的 AI 助手的说话语气和它自己的初始设定（人设）**。
这只是一套名为「AgentTODO」的扩展工具包。但为了让它知道啥时候该抛出相应的工具调用能力，你可以将下面的工作流准则（Skill Prompt / Tool Description）填到这个工具箱的“介绍信息”或任何类似 Coze/OpenClaw 的**编排提示词**中：

> 【AgentTODO 代理技能准则】
> 1. **隐式盘查**：每天当我们进行第一次对话、或当我向你请教一天的行事安排时，你应该能聪明地知道去静默调用 `get_daily_summary` 或者 `get_today_agenda`，不需要我来请你这么做。
> 2. **化大为小**：如果我抛出一个含糊的、长期维度的宏大想法（例如：“我准备做下个月的旅游攻略”），你千万不要只去建一条叫“旅游攻略”的任务而已。帮人在心中把大目标拆成最少3-5个子步骤，问我：“需要我帮你细分为定机票找酒店这样几个步骤打到清单上吗？”，如果我同意，则一次性把它们作为 `subtasks` 写入 `create_task`。
> 3. **见缝插针（主动状态追踪）**：我在跟你普通瞎聊的时候（如：“哎呀今天真的好卡哦”、“我终于通过面试了第一关啊”），这些话里带着任务的进展，甚至已经完成了任务。**你不需要经过我同意**，请主动抓取这些信息作为任务备忘录 `note_content` 附加到那条任务轨迹里 (`add_task_progress_note`)！并顺道把任务子步骤打个勾！

---

## 阶段二：给 AI 安装“机械手臂”（添加技能插件） 🦾

AI 需要你的授权才能读写你的任务列表。在 OpenClaw 中，这通常叫做 **工具 (Tools)**、**技能 (Skills)** 或 **功能调用 (Function Calling)**。

请在 OpenClaw 的 **工具配置 / 插件管理** 界面，添加以下 5 个技能。
*注意：如果你的 OpenClaw 支持直接导入 JSON 描述文件，你可以直接复制底下代码块的内容。对于不需要代码配置的界面，只需照着下方的描述填空即可。*

### 技能 1：获取每日概览 (get_daily_summary)
*   **名称 (Name)**: `get_daily_summary`
*   **描述 (Description)**: 获取当前任务的完整统计大盘（总数、今日待办数、逾期数）。AI 每天初次交谈或需要了解全局时调用。
*   **API 地址 (URL)**: `http://localhost:3300/api/tasks/summary`
*   **请求方式 (Method)**: `GET`

### 技能 2：获取今日详情 (get_today_agenda)
*   **名称 (Name)**: `get_today_agenda`
*   **描述 (Description)**: 获取今日确切要做的任务详情，包括子任务的步骤和完成进度。
*   **API 地址 (URL)**: `http://localhost:3300/api/tasks/today`
*   **请求方式 (Method)**: `GET`

### 技能 3：创建新任务 (create_task)
*   **名称 (Name)**: `create_task`
*   **描述 (Description)**: 把用户的话变成具体的待办事项。可以包含分步的子任务。
*   **API 地址 (URL)**: `http://localhost:3300/api/tasks`
*   **请求方式 (Method)**: `POST`
*   **参数配置 (JSON Schema)**:
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

### 技能 4：更新任务 (update_task)
*   **名称 (Name)**: `update_task`
*   **描述 (Description)**: 用于修改已有任务的常规属性，例如修改标题、延期（修改 due_date）、调整优先级等。
*   **API 地址 (URL)**: `http://localhost:3300/api/tasks/{{task_id}}`
*   **请求方式 (Method)**: `PUT`

### 技能 5：记录进度与勾选步骤 (add_task_progress_note)
*   **名称 (Name)**: `add_task_progress_note`
*   **描述 (Description)**: 记录执行进展日志，或标记某个子任务状态为完成。
*   **API 地址 (URL)**: `http://localhost:3300/api/tasks/{{task_id}}/notes` 以及 `/subtasks/{{subtask_id}}` (如果你的客户端支持组合 API 调用，请参考项目提供的 Python 脚本逻辑，或者让 AI 直接请求后端的单一对应端点)。
*   *(如果你使用的是支持 Python 脚本的复杂版 OpenClaw 插件系统，请直接将本目录下的 `openclaw_tools.py` 导入系统即可)*

---

## 阶段三：测试你的 AI 教练！🎯

配置完毕后，保存设置。现在你可以用自然语言和你的 OpenClaw 对话了。
试着对它说以下几句话，看看奇迹是否发生：

1. **“早上好，帮我看看今天有哪些必须完成的事情？”**
   *(它应该会自动调用 `get_today_agenda`，然后严厉地把任务列给你看。)*

2. **“我要开始筹备下个月的家庭旅游了，大概要去一周。”**
   *(它应该不会只建一个“旅游”任务，而是自动拆分出“订机票”、“订酒店”、“做攻略”等几步，并调用 `create_task` 存进你的系统。)*

3. **“旅游的机票我刚才买好了。”**
   *(它应该会自动找到刚刚那个旅游任务，调用工具为你打上勾，并回复你“已记录进展，机票预订步骤已完成，接下来请抓紧预订酒店。”)*
