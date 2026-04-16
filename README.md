# 🚀 AgentTODO

<p align="center">
  <img src="https://raw.githubusercontent.com/alanhsun/AgentTODO/main/docs/assets/agenttodo_logo.png" alt="AgentTODO Logo" width="200" style="border-radius:20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5)">
</p>

<!-- @purpose -->
**AgentTODO** 是一个专为 AI 助手（如 OpenClaw、ChatGPT、Coze 等）设计的轻量级、本地化任务管理中枢。它提供现代化的响应式 Web UI（看板 + 列表视图），并通过**命令行技能系统 (CLI Skill System)** 和**无认证 REST API** 暴露能力，使 AI 助理能够作为执行力教练直接读写任务数据。
<!-- /purpose -->

<!-- @dependencies -->
- Node.js >= 20 或 Docker 20.10+
- 现代浏览器 (Chrome, Firefox, Safari)
<!-- /dependencies -->

---

## ✨ 核心特性

<!-- @features -->
- 🤖 **AI Native CLI 技能系统**：提供专门为大语言模型优化的命令行交互模式（支持热加载），AI 可以通过标准输入输出直接操作任务大盘，摆脱复杂的网络协议配置。
- 🔓 **本地私有化 (Zero-Auth)**：专为本地受信任网络设计，去除 JWT 用户注册与登录等繁琐流程，大模型和本地脚本直接无缝集成调用。
- 🔄 **周期任务 & 子任务分解**：支持设置每日/每周重复习惯。AI 能够主动将宏大目标（如“旅行规划”）拆解为子步骤并持续追踪。
- 🔔 **Webhook 主动推送支持**：内置 Node-Cron 定时任务扫描。当任务逾期时，主动向 AI 系统发送 HTTP Push 触发提醒。
- 🎨 **双视图自由切换**：支持“列表(List)”与“看板(Kanban)”视角，并自带深/浅色模式切换。
<!-- /features -->

---

## 🛠️ 快速安装 (Docker 推荐)

<!-- @purpose -->
使用 Docker Compose 进行一键部署，实现免环境配置与数据安全持久化。
<!-- /purpose -->

### 1. 创建配置文件
<!-- @input -->
新建 `docker-compose.yml` 文件：
```yaml
services:
  agenttodo:
    image: alansundy/agenttodo:latest
    container_name: agenttodo
    restart: unless-stopped
    ports:
      - "3300:3300"
    volumes:
      - task-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3300
      - AGENTTODO_URL=http://localhost:3300/api
      - DB_PATH=/data/tasks.db

volumes:
  task-data:
    driver: local
```
<!-- /input -->

### 2. 启动服务
<!-- @input -->
在目录中执行以下命令：
```bash
docker-compose up -d
```
<!-- /input -->

<!-- @output -->
服务将在后台运行。打开浏览器访问 👉 **[http://localhost:3300](http://localhost:3300)** 即可使用 Web 界面。
<!-- /output -->

---

## 🧠 AI 助手集成指南

想要让 AI 助手接管你的日常待办并充当工作教练？我们提供了零代码的接入方式与详细的开发者 API。

<!-- @references -->
- 🤖 **AI 助手接入工作流**：[阅读 AI 技能编排指南](./ai-integration/skill_workflow.md)
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
npm install
npm run dev
```
<!-- /input -->

<!-- @output -->
- 本地前端运行在：`http://localhost:3300` (支持热更新)
- 后端 API 运行在：`http://localhost:3301`
- CLI 交互终端可通过 `node server/src/cli/index.js` 启动。
<!-- /output -->

---

## 📄 License

MIT License
