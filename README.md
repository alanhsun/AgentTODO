# 🚀 Lite Task Tracker

**Lite Task Tracker** 是一个专为 AI 助手（如 OpenClaw、ChatGPT、Coze 等）设计的轻量级、本地化任务管理中枢。它不仅提供了一个现代化的响应式 Web UI（看板 + 列表视图），还专门暴露了一套**无需认证**、**结构精简**的 API，让你的私人 AI 助理随时充当你的“执行力教练”。

---

## ✨ 核心特性

- 🤖 **AI Native API**：提供为 LLM 专门优化的端点（如 `/api/tasks/summary`、`/api/tasks/today`），AI 启动时可一键获取今日待办大盘与逾期警告。
- 🔓 **本地私有化 (Zero-Auth)**：专为本地受信任网络设计，去除了繁琐的 JWT 用户注册与登录，大模型及脚本直接调用无缝集成。
- 🔄 **周期任务 & 子任务分解**：支持设置每日/每周重复习惯。当你对 AI 说“我要规划一次旅行”时，AI 可直接调用接口在该大任务下无限拆分具体子步骤并主动追踪。
- 🔔 **Webhook 主动推送支持**：内置 Node-Cron 定时任务扫描。当你的任务逾期未办理时，可主动向 AI 系统（如 OpenClaw）发送 HTTP Push，让机器来“催”你办事！
- 🎨 **双视图自由切换**：美观丝滑的深/浅色模式切换，并支持传统的“列表(List)”视角和更直观的“看板(Kanban)”视角。

---

## 🛠️ 快速安装 (Docker 推荐)

我们推荐使用 Docker Compose 进行一键部署，不仅免去环境配置的麻烦，且数据持久化极其安全。

### 1. 创建 `docker-compose.yml`

在你的服务器或本地电脑新建一个文件夹，并在其中新建一个文件 `docker-compose.yml`：

```yaml
services:
  lite-task-tracker:
    image: alansundy/lite-task-tracker:latest
    container_name: lite-task-tracker
    restart: unless-stopped
    ports:
      - "3300:3300"
    volumes:
      - task-data:/data
    environment:
      - NODE_ENV=production
      - PORT=3300
      - DB_PATH=/data/tasks.db

volumes:
  task-data:
    driver: local
```

### 2. 一键启动

在该目录下执行：

```bash
docker-compose up -d
```

启动完成后，打开浏览器访问 👉 **[http://localhost:3300](http://localhost:3300)** 即可开始使用精美的 Web 端界面！

---

## 🧠 让 AI 助手接管你的日常 (OpenClaw 等)

想要让 OpenClaw / ChatGPT 等大语言模型自动为你记录待办、规划任务、甚至在你拖延时严厉批评你？

我们提供了一份**不用写代码的保姆级接入指南**，只需「复制 + 粘贴」即可让 AI 变身为工作力教练。

👉 **[点击查阅：零基础 AI 助手接入指南](./ai-integration/openclaw-setup-guide.md)**
👉 **[面向开发者的全量接口说明](./docs/ai-api-guide.md)**

---

## 💻 本地开发指南

如果你想二次开发或定制功能：

```bash
# 1. 克隆代码仓库
git clone https://github.com/alanhsun/lite-task-tracker.git
cd lite-task-tracker

# 2. 启动前端与后端 (使用 npm workspaces)
npm run dev

# 此时：
# 本地前端运行在 http://localhost:5173 
# 后端 API 运行在 http://localhost:3300 
```

使用 `npm run build:client` 即可打包前端静态资源给后端独立运行。

---

## 📄 License

MIT License
