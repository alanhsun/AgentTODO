# AgentTODO CLI 技能系统开发指南

<!-- @purpose -->
本文档旨在帮助开发者了解如何运行 CLI 终端，以及如何利用 `BaseSkill` 模板在本地快速编写和测试新的可插拔技能（Skill）。
<!-- /purpose -->

你好！欢迎来到 AgentTODO 的 CLI 技能系统。
为了兼顾 AI 自动接入和人工调试，项目同时保留两条轻量通道：MCP stdio 供 AI 客户端自动发现工具，**基于命令行的可插拔技能系统 (Skill System)** 用于交互调试和热加载。

CLI 默认访问 `AGENTTODO_URL`（未设置时为 `http://localhost:3301/api`）。如果服务启用了 `API_TOKEN`，请同时设置同值的 `AGENTTODO_API_TOKEN`；内置技能会自动使用 Bearer Token。`AGENTTODO_TIMEOUT_MS` 可调整请求超时，默认 10000 毫秒。

这篇文档将用最简单的话，教你如何使用和开发新的技能。

---

## 1. 核心结构

- **交互终端 (`index.js`)**：解析 `list`、`run`、`reload` 和 `exit` 命令。
- **技能管理器 (`SkillManager.js`)**：注册、卸载和热加载技能。
- **基础类 (`BaseSkill.js`)**：统一参数验证、执行和错误格式。
- **具体技能 (`skills/*.js`)**：实现创建、查询和更新等操作。

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
- `reload`：重新扫描技能目录并热加载，无需重启 CLI
- `exit`：退出程序

当前内置技能：

| 技能 | 用途 |
|---|---|
| `ping` | 检查 CLI 调用链 |
| `get_daily_summary` | 获取全局统计 |
| `get_today_agenda` | 获取今日及逾期任务 |
| `get_user_tags` | 获取现有标签 |
| `create_task` | 创建任务和子任务 |
| `update_task` | 更新任务基本字段 |
| `add_task_progress_note` | 原子记录笔记、子任务或重复任务进展 |

CLI 有意不内置删除技能。需要 AI 自动发现搜索、上下文读取等完整工具时，优先使用 [MCP 适配器](./mcp-guide.md)。

---

## 3. 怎样开发一个新技能？(Step-by-Step)

想要增加一个新功能（比如：读取任务上下文），只需要在 `server/src/cli/skills/` 目录下创建 `get_task_context.js`。

### 第一步：继承模板
所有的技能都必须继承 `BaseSkill`。

```javascript
const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class GetTaskContextSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_task_context';
    this.description = '读取指定任务的完整上下文。';
  }
}

module.exports = GetTaskContextSkill;
```

### 第二步：参数验证 (可选，但推荐)
如果要求必须传入任务 ID，需要重写 `validate` 方法：

```javascript
  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    return args;
  }
```

### 第三步：执行逻辑 (必填)
重写 `execute` 方法，告诉程序具体怎么干活：

```javascript
  async execute(args) {
    try {
      const res = await httpClient.get(`/tasks/${args.task_id}/context`);
      return res.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
```

### 第四步：保存并热加载
写完代码保存后，回到运行着的 CLI 窗口，输入：
```bash
reload
```
然后输入 `list`，你就能看到新技能 `get_task_context`。

---

## 4. 单元测试怎么写？

为了保证代码靠谱，我们使用了 `Jest` 框架。测试代码存放在 `server/src/cli/__tests__/` 目录下。

运行测试命令：
```bash
# 仓库根目录
npm test --workspace=server -- src/cli/__tests__ --runInBand
```

测试可通过 `jest.mock` 模拟网络请求，因此多数 CLI 单元测试不要求先启动服务。创建涉及 HTTP 的技能时，应同时覆盖成功响应、认证失败和网络错误。

## 5. 技能约束

- 所有相对 API 路径都通过 `httpClient` 发送，不在技能文件中重复硬编码主机和端口。
- 写入技能必须验证必要参数；涉及删除、批量修改或覆盖历史数据时，应在上层交互先获得用户明确确认。
- 重复任务单次完成应调用 `/tasks/:id/progress` 写入发生日期，不应直接把整个任务改成 `done`。
- `handleError` 返回结构化错误，技能不要吞掉错误或打印 Token。

---

修改完成后，运行 `npm test`、`npm run lint` 和相关真实 API 冒烟测试，再提交代码。
