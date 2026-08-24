# 🚀 AgentTODO

<p align="center">
  <img src="https://raw.githubusercontent.com/alanhsun/AgentTODO/main/docs/assets/agenttodo_logo.png" alt="AgentTODO Logo" width="200" style="border-radius:20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5)">
</p>

<!-- @purpose -->
**AgentTODO** 是一个专为 AI 助手（如 OpenClaw、ChatGPT、Coze 等）设计的轻量级、本地化任务管理中枢。它提供现代化的响应式 Web UI，并通过本地 MCP、命令行技能系统和 REST API 暴露能力，使 AI 助理能够作为执行力教练直接读写任务数据。可信本地环境可保持免认证，也可为局域网访问启用轻量 API Token。
<!-- /purpose -->

<!-- @dependencies -->
- Node.js >= 20.17 或 Docker 20.10+
- 现代浏览器 (Chrome, Firefox, Safari)
<!-- /dependencies -->

---

## ✨ 核心特性

<!-- @features -->
- 🤖 **本地 MCP + CLI 技能系统**：MCP stdio 供 AI 客户端自动发现工具；交互式 CLI 保留热加载能力，便于人工调试。
- 🔐 **本地优先、按需保护**：本机默认只监听回环地址；可信网络可免认证，局域网也可启用 API Token，不引入用户注册系统。
- 🔄 **周期任务 & 子任务分解**：支持每天、每个工作日、每周和每月重复，并按日期记录每次完成情况。AI 能够将大目标拆成子步骤持续追踪。
- 📎 **本地附件与完整备份**：任务可拖放上传附件，图片支持安全预览；文件保存在本地磁盘，并可随 ZIP 完整备份导出和恢复。
- 🔔 **Webhook 主动推送支持**：内置 Node-Cron 定时任务扫描。当任务逾期时，主动向 AI 系统发送 HTTP Push 触发提醒。
- 🎨 **多视图自由切换**：支持列表、看板和日历视角，并自带深/浅色模式切换。
<!-- /features -->

---

## 🛠️ 快速安装（Docker 推荐）

<!-- @purpose -->
使用 Docker Compose 进行一键部署，实现免环境配置与数据安全持久化。
<!-- /purpose -->

### 1. 获取项目并准备配置
<!-- @input -->
```bash
git clone https://github.com/alanhsun/AgentTODO.git
cd AgentTODO
cp .env.example .env
```
<!-- /input -->

Windows PowerShell 可使用 `Copy-Item .env.example .env`。仓库内的 `docker-compose.yml` 是唯一 Compose 配置来源，无需另行复制一份。

### 2. 启动服务
<!-- @input -->
在目录中执行以下命令：
```bash
docker compose up -d
```
<!-- /input -->

<!-- @output -->
服务将在后台运行。打开浏览器访问 👉 **[http://localhost:3300](http://localhost:3300)** 即可使用 Web 界面。
<!-- /output -->

### 局域网安全配置

默认 Compose 配置保留局域网访问和私网 Webhook，以符合家庭服务器与本地 AI 助手的使用场景。如果局域网并非完全可信，请先复制 `.env.example` 为 `.env`，并设置一个较长的随机 `API_TOKEN`。启用后：

- 浏览器使用用户名 `agenttodo`（可由 `API_USERNAME` 修改）和该 Token 进行 HTTP Basic Auth；
- API 客户端使用 `Authorization: Bearer <token>` 或 `X-API-Token: <token>`；
- `/api/health` 保持免认证，便于容器健康检查。

跨站浏览器访问默认关闭；确有需要时，通过逗号分隔的 `CORS_ORIGIN` 显式指定可信来源。

### 任务与数据规则

- 普通任务只在 `due_date` 当天显示于日历；重复任务从创建日期开始，到 `due_date` 为止（首尾均包含）。未设置截止日期的重复任务会持续发生。
- `weekdays` 表示每个周一至周五；`weekly` 以创建日期为锚点每 7 天发生一次；`monthly` 以创建日的日号为锚点，缺少该日号的月份会跳过。
- 重复任务只保存一个任务主体，每日完成情况单独记录，不会生成大量任务副本。
- SQLite 数据库和附件都保存在本地；完整 ZIP 备份同时包含二者，旧版 JSON 备份不包含附件文件。

---

## 🧠 AI 助手集成指南

想让 AI 助手读取和更新任务，可按客户端能力选择 MCP、REST/Python 或 CLI。MCP 是本地 AI 客户端的首选方式；云端 AI 服务无法直接访问你电脑上的 `localhost`，需要由本地客户端、局域网代理或你明确配置的安全网关转发。

<!-- @references -->
- 🤖 **AI 助手接入工作流**：[阅读 AI 技能编排指南](./ai-integration/skill_workflow.md)
- 🔗 **本地 MCP 接入**：[阅读 MCP 使用指南](./docs/mcp-guide.md)
- 💻 **CLI 技能系统开发**：[阅读 CLI 技能系统文档](./docs/cli-skill-guide.md)
- 🔌 **REST API 接口规范**：[阅读 API 接口参考](./docs/api-reference.md)
- ⚙️ **部署与运维详情**：[阅读部署指南](./deploy-guide.md)
<!-- /references -->

---

## 💻 本地开发指南

<!-- @purpose -->
面向希望进行二次开发和功能定制的开发者。
<!-- /purpose -->

<!-- @input -->
```bash
# 1. 克隆代码仓库
git clone https://github.com/alanhsun/AgentTODO.git
cd AgentTODO

# 2. 安装依赖并启动 (前端与后端)
npm ci
npm run dev
```
<!-- /input -->

<!-- @output -->
- 本地前端运行在：`http://localhost:3300` (支持热更新)
- 后端 API 运行在：`http://localhost:3301`
- CLI 交互终端可通过 `node server/src/cli/index.js` 启动。
- MCP stdio 适配器可通过 `npm run mcp` 启动（通常由 AI 客户端自动启动）。
<!-- /output -->

常用检查命令：

```bash
npm test
npm run lint
npm run build:client
npm run test:calendar --workspace=client
```

---

## 📄 License

MIT License
