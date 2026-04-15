# AgentTODO CLI 技能系统开发指南

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

在项目根目录下，打开终端运行：
```bash
node server/src/cli/index.js
```

你将看到一个 `AgentTODO>` 提示符。你可以输入以下命令：
- `help`：查看所有命令
- `list`：列出当前所有的可用技能
- `run <技能名称> [JSON参数]`：执行某个技能。比如：
  `run ping`
  `run create_task {"title":"写报告", "priority":"high"}`
- `reload`：热加载技能（**超级好用！修改了代码不需要重启程序，直接输入 reload 就能生效**）
- `exit`：退出程序

---

## 3. 怎样开发一个新技能？(Step-by-Step)

想要增加一个新功能（比如：删除任务），你只需要在 `server/src/cli/skills/` 目录下创建一个新文件（比如 `delete_task.js`）。

### 第一步：继承模板
所有的技能都必须继承 `BaseSkill`。

```javascript
const BaseSkill = require('../BaseSkill');
const axios = require('axios'); // 如果需要发请求

class DeleteTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'delete_task'; // 技能的名字（执行时敲的命令）
    this.description = '删除指定的任务。'; // 技能的说明
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
      const res = await axios.delete(`http://localhost:3300/api/tasks/${args.task_id}`);
      return { message: "任务删除成功" };
    } catch (error) {
      // 遇到报错，交给基类统一处理
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

运行测试命令：
```bash
cd server
npm run test server/src/cli/__tests__
```

我们在写测试时，会用一个叫 `jest.mock` 的技术，**假装**发了网络请求（模拟），这样即使没开服务器也能测试代码逻辑对不对。详细可以参考 `create_task.test.js` 文件中的中文注释。

---

🎉 祝你开发愉快！遇到任何报错，记得先看 CLI 输出的红色警告信息哦！
