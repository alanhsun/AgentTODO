# AgentTODO CLI 技能系统开发指南

<!-- @purpose -->
本文档旨在帮助开发者了解如何运行 CLI 终端，以及如何利用 `BaseSkill` 模板在本地快速编写和测试新的可插拔技能（Skill）。
<!-- /purpose -->

你好！欢迎来到 AgentTODO 的 CLI 技能系统。
为了让 AI 助手能够更轻量、更灵活地操作任务，我们将原来的 MCP（Model Context Protocol）替换为了**基于命令行的可插拔技能系统 (Skill System)**。

这篇文档将用最简单的话，教你如何使用和开发新的技能。

---

## 1. 核心概念 (生活类比)

你可以把整个系统想象成一家**跑腿公司**：
- **CLI 终端 (`index.js`)**：公司的前台对讲机。你在这里下达命令，比如“跑腿小哥，去帮我买杯咖啡”。
- **SkillManager (`SkillManager.js`)**：公司的经理。他负责招聘（加载技能）、解雇（卸载技能），甚至不用关门停业就能给小哥发新的技能手册（热加载）。
- **BaseSkill (`BaseSkill.js`)**：公司规定的标准“技能说明书”模板。上面规定了每个跑腿任务必须怎么写。
- **具体技能 (`skills/*.js`)**：各种具体的跑腿任务，比如“创建任务”、“获取总结”等。

---

## 2. 如何运行 CLI

CLI 通过 HTTP 调用后端服务，默认地址为 `http://localhost:3301/api`（本地开发）。
Docker 部署时请设置环境变量 `AGENTTODO_URL=http://localhost:3300/api`（容器内已默认设置）。

### 2.1 交互模式（适合人工调试）

在项目根目录下，打开终端运行：
```bash
node server/src/cli/index.js
```

你将看到一个 `AgentTODO>` 提示符。你可以输入以下命令：
- `help`：查看所有命令
- `help <技能名称>`：查看某个技能的参数说明
- `list`：列出当前所有的可用技能
- `run <技能名称> [JSON参数]`：执行某个技能。比如：
  `run ping`
  `run create_task {"title":"写报告", "priority":"high"}`
- `reload`：热加载技能（**超级好用！修改了代码不需要重启程序，直接输入 reload 就能生效**）
- `exit`：退出程序

### 2.2 单次执行模式（适合 AI 助手 / 脚本调用）

带参数运行时 CLI 只执行一次：标准输出**只包含 JSON 结果**，失败时进程退出码为 `1`，非常适合让 AI 通过 Shell 工具直接调用：

```bash
# 以 JSON 列出全部技能及参数说明（可直接作为 AI 的工具清单）
node server/src/cli/index.js list

# 执行技能
node server/src/cli/index.js run get_today_agenda
node server/src/cli/index.js run search_tasks '{"search":"报告","status":"todo,in_progress"}'

# Windows / 复杂 JSON 引号不好处理时，用 "-" 从标准输入读取参数
echo {"title":"写报告","subtasks":["收集数据","撰写初稿"]} | node server/src/cli/index.js run create_task -
```

失败时输出示例（会带上后端给出的具体原因，方便 AI 自我修正）：
```json
{ "status": "error", "skill": "create_task", "http_status": 400, "message": "Priority must be one of: low, medium, high, urgent" }
```

### 2.3 内置技能一览

| 技能 | 作用 |
|------|------|
| `get_daily_summary` | 全局统计（总数、逾期、今日到期、今日完成） |
| `get_today_agenda` | 今日到期 + 逾期任务，含子任务列表与 ID |
| `search_tasks` | 按关键词 / 状态 / 优先级 / 标签 / 日期搜索任务，用于定位任务 ID |
| `get_task` | 单个任务详情（子任务、进展笔记） |
| `get_user_tags` | 全部标签 |
| `create_task` | 创建任务 / 周期习惯，可一次性带子任务 |
| `update_task` | 更新标题、描述、状态、优先级、日期、重复规则、标签 |
| `add_task_progress_note` | 记录进展笔记，并可勾选子任务、更新任务状态 |
| `ping` | 连通性测试 |

---

## 3. 怎样开发一个新技能？(Step-by-Step)

想要增加一个新功能（比如：删除任务），你只需要在 `server/src/cli/skills/` 目录下创建一个新文件（比如 `delete_task.js`）。

### 第一步：继承模板
所有的技能都必须继承 `BaseSkill`。

```javascript
const BaseSkill = require('../BaseSkill');
const axios = require('axios'); // 如果需要发请求
const { BASE_URL, REQUEST_OPTIONS } = require('../config'); // 共享的服务地址与超时配置

class DeleteTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'delete_task'; // 技能的名字（执行时敲的命令）
    this.description = '删除指定的任务。'; // 技能的说明
    this.parameters = { task_id: '必填，任务 ID' }; // 参数说明，会出现在 help / list 输出中
  }
  
  // 后面写具体的逻辑...
}

module.exports = DeleteTaskSkill;
```

### 第二步：参数验证 (可选，但推荐)
如果你要求必须传入任务 ID 才能删除，你需要重写 `validate` 方法：

```javascript
  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    return args; // 没问题就把参数原样返回
  }
```

### 第三步：执行逻辑 (必填)
重写 `execute` 方法，告诉程序具体怎么干活：

```javascript
  async execute(args) {
    try {
      // 发送 HTTP 请求去删除任务
      await axios.delete(`${BASE_URL}/tasks/${args.task_id}`, REQUEST_OPTIONS);
      return { message: "任务删除成功" };
    } catch (error) {
      // 遇到报错，交给基类统一处理（会自动提取后端返回的错误原因和 HTTP 状态码）
      return this.handleError(error);
    }
  }
```

### 第四步：保存并热加载
写完代码保存后，回到运行着的 CLI 窗口，输入：
```bash
reload
```
然后输入 `list`，你就能看到你的新技能 `delete_task` 啦！

---

## 4. 单元测试怎么写？

为了保证代码靠谱，我们使用了 `Jest` 框架。测试代码存放在 `server/src/cli/__tests__/` 目录下。

运行测试命令（在项目根目录）：
```bash
npm test
```

我们在写测试时，会用一个叫 `jest.mock` 的技术，**假装**发了网络请求（模拟），这样即使没开服务器也能测试代码逻辑对不对。详细可以参考 `create_task.test.js` 与 `skills.test.js` 文件中的中文注释。
后端 REST API 的集成测试位于 `server/src/__tests__/api.test.js`，使用内存 SQLite 数据库运行。

---

🎉 祝你开发愉快！遇到任何报错，记得先看 CLI 输出的红色警告信息哦！
