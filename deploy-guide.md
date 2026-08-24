# AgentTODO 部署指南

<!-- @purpose -->
提供 AgentTODO 系统的多种部署方式（Docker、本地开发）、数据备份策略以及常见问题排查方案。适用于家庭服务器和低功耗设备（如 Raspberry Pi）部署。
<!-- /purpose -->

<!-- @dependencies -->
- Docker 20.10+ 和 Docker Compose V2
- 或 Node.js 20.17+（本地开发）
<!-- /dependencies -->

---

## 🚀 快速部署（Docker 推荐）

<!-- @purpose -->
使用 Docker Compose 快速拉起服务并映射持久化数据卷。
<!-- /purpose -->

### 1. 克隆/下载项目

<!-- @input -->
```bash
cd /opt
git clone https://github.com/alanhsun/AgentTODO.git agenttodo
cd agenttodo
cp .env.example .env
```
<!-- /input -->

### 2. 一键启动

<!-- @input -->
```bash
docker compose up -d
```
<!-- /input -->

<!-- @output -->
服务启动成功后，通过浏览器访问 `http://<服务器IP>:3300`。
<!-- /output -->

---

## ⚙️ 环境变量配置

<!-- @purpose -->
通过环境变量调整后端运行端口、数据库路径及环境模式。
<!-- /purpose -->

<!-- @input -->
| 环境变量名称 | 默认值 | 功能说明 |
|---|---|---|
| `HOST` | 本机运行 `127.0.0.1`；Compose `0.0.0.0` | 服务监听地址 |
| `PORT` | 本机 `3301`；Compose `3300` | 后端服务监听端口 |
| `DB_PATH` | 本机 `server/data/tasks.db`；Compose `/data/tasks.db` | SQLite 数据库文件路径 |
| `ATTACHMENT_DIR` | 本机 `server/data/attachments`；Compose `/data/attachments` | 任务附件文件目录 |
| `ATTACHMENT_MAX_SIZE_MB` | `20` | 单个附件大小上限（MB） |
| `BACKUP_MAX_SIZE_MB` | `1024` | ZIP 完整备份导入上限（MB） |
| `NODE_ENV` | `production` | 运行环境 |
| `APP_TIMEZONE` | `Asia/Shanghai` | “今天”与定时任务使用的时区 |
| `API_TOKEN` | 空 | 可选访问令牌；留空仅适用于可信网络 |
| `API_USERNAME` | `agenttodo` | 浏览器 Basic Auth 用户名 |
| `CORS_ORIGIN` | 空 | 允许的跨站来源，多个值以逗号分隔 |
| `JSON_BODY_LIMIT` | `50mb` | JSON 请求体上限；附件上传不使用此限制 |
| `WEBHOOK_ALLOW_PRIVATE_NETWORK` | 本机自动允许；Compose 为 `true` | 是否允许回环/局域网 Webhook |
| `WEBHOOK_ALLOWED_HOSTS` | 空 | 可选 Webhook 主机白名单 |
<!-- /input -->

MCP 和 CLI 作为独立本地进程运行时还会读取：

| 环境变量名称 | 默认值 | 功能说明 |
|---|---|---|
| `AGENTTODO_URL` | `http://localhost:3301/api` | MCP/CLI 访问的完整 API 基础地址；Docker 后端通常改为 `http://127.0.0.1:3300/api` |
| `AGENTTODO_API_TOKEN` | 空 | 与服务端 `API_TOKEN` 相同的 Bearer Token |
| `AGENTTODO_TIMEOUT_MS` | `10000` | MCP/CLI HTTP 请求超时（毫秒） |

---

## 🔧 本地开发环境

<!-- @purpose -->
为二次开发准备本地调试环境，分离前后端服务以支持热更新。
<!-- /purpose -->

<!-- @input -->
```bash
# 在仓库根目录按锁文件安装全部 workspace 依赖
npm ci

# 启动前后端服务
# 此时前端会运行在 3300 端口，后端 API 运行在 3301 端口
npm run dev
```
<!-- /input -->

---

## 💾 数据备份与恢复

<!-- @purpose -->
网页左下角的“导出”默认生成包含数据库与附件的 ZIP 完整备份；“导入”支持该 ZIP，也兼容旧版 JSON。ZIP 恢复会校验附件大小和 SHA-256。

如需从 Docker 宿主机手工备份，应备份整个 `/data`，因为附件位于 `/data/attachments`，不能只复制数据库。
<!-- /purpose -->

### 备份流程
<!-- @input -->
```bash
# 从容器内复制完整数据目录（数据库和附件）
docker cp agenttodo:/data ./agenttodo-data-backup
```
<!-- /input -->

### 恢复流程
<!-- @input -->
```bash
# 停止服务后恢复完整数据目录，再重新启动
docker stop agenttodo
docker cp ./agenttodo-data-backup/. agenttodo:/data
docker restart agenttodo
```
<!-- /input -->

---

## 🔄 更新升级

<!-- @purpose -->
获取最新的代码与 Docker 镜像，并平滑升级系统。
<!-- /purpose -->

<!-- @input -->
```bash
cd agenttodo
git pull
docker compose pull
docker compose up -d
```
<!-- /input -->

如果希望使用当前检出的源码自行构建，而不是拉取 `alansundy/agenttodo:latest`：

```bash
docker compose up -d --build
```

数据库迁移会在服务启动时自动执行。升级前仍建议从网页导出完整 ZIP，或停止容器后备份整个 `/data`。

---

## 🐛 常见问题排查 (FAQ)

### Q: 是否必须配置密码？
<!-- @output -->
不必须。本机或完全可信局域网可留空 `API_TOKEN`。在共享局域网中建议设置 Token；忘记后可在 `.env` 中更换并重启容器，不涉及用户账号数据库。
<!-- /output -->

### Q: 如何在 Raspberry Pi 上部署？
<!-- @output -->
Dockerfile 基于 Node.js Alpine，并会在目标机器上编译 SQLite 原生依赖。若发布镜像不包含你的树莓派架构，请使用 `docker compose up -d --build` 在设备上本地构建。
<!-- /output -->

### Q: 数据库文件在宿主机的物理路径是什么？
<!-- @output -->
在使用 Docker 部署时，数据存储在 Docker volume 中。可通过以下命令查看实际挂载的物理路径：
```bash
docker volume ls
docker volume inspect agenttodo_task-data
```

卷名前缀来自 Compose 项目名；如果目录名不同，请以 `docker volume ls` 的实际结果为准。
<!-- /output -->

### Q: MCP 显示启动成功后为什么一直没有输出？
<!-- @output -->
这是正常现象。MCP 使用 stdio 等待 AI 客户端发起协议请求，不是交互式命令行。人工调试请使用 `node server/src/cli/index.js`；MCP 配置参见 [MCP 指南](./docs/mcp-guide.md)。
<!-- /output -->

### Q: 如何查看容器状态和日志？

```bash
docker compose ps
docker compose logs --tail=200 agenttodo
curl http://localhost:3300/api/health
```

<!-- @references -->
- 有关 AI 集成：请参阅 [CLI 技能系统开发指南](./docs/cli-skill-guide.md)
- 有关 MCP：请参阅 [本地 MCP 接入指南](./docs/mcp-guide.md)
- 有关 API 详情：请参阅 [API 参考文档](./docs/api-reference.md)
<!-- /references -->
