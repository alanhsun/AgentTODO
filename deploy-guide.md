# AgentTODO 部署指南

<!-- @purpose -->
提供 AgentTODO 系统的多种部署方式（Docker、本地开发）、数据备份策略以及常见问题排查方案。适用于家庭服务器和低功耗设备（如 Raspberry Pi）部署。
<!-- /purpose -->

<!-- @dependencies -->
- Docker 20.10+ 和 Docker Compose V2
- 或 Node.js 20+ （本地开发）
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
git clone https://github.com/alanhsun/AgentTODO.git task-manager
cd task-manager
```
<!-- /input -->

### 2. 一键启动

<!-- @input -->
```bash
docker-compose up -d
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
| 环境变量名称      | 默认值               | 功能说明                   |
|-----------------|----------------------|------------------------|
| `PORT`          | `3300`（Docker）/ `3301`（本地） | 设定后端服务监听端口         |
| `HOST`          | 自动（`::`，同时接受 IPv4） | 监听地址，一般无需设置       |
| `DB_PATH`       | `/data/tasks.db`     | 指定 SQLite 数据库文件存储路径（父目录不存在时自动创建） |
| `NODE_ENV`      | `production`         | 标识系统运行环境             |
| `TZ`            | 系统时区（容器内为 UTC） | **重要**：决定"今天 / 逾期"的判断与每日逾期检查时间，如 `Asia/Shanghai` |
| `OVERDUE_CRON`  | `0 9 * * *`          | 逾期检查（推送 `task.overdue` Webhook）的 cron 表达式 |
| `WEBHOOK_TIMEOUT` | `5000`             | Webhook 推送超时（毫秒）    |
| `CORS_ORIGIN`   | `*`                  | 允许跨域访问的来源           |
| `JSON_LIMIT`    | `20mb`               | 请求体大小上限（影响备份导入） |
| `AGENTTODO_URL` | `http://localhost:3300/api` | CLI 技能 / Python 工具访问的服务地址 |
<!-- /input -->

---

## 🔧 本地开发环境

<!-- @purpose -->
为二次开发准备本地调试环境，分离前后端服务以支持热更新。
<!-- /purpose -->

<!-- @input -->
```bash
# 在根目录安装依赖即可（npm workspaces 会同时安装 server 与 client）
npm install

# 启动前后端服务
# 此时前端会运行在 3300 端口，后端 API 运行在 3301 端口
npm run dev

# 运行测试 / 前端代码检查
npm test
npm run lint
```
<!-- /input -->

---

## 💾 数据备份与恢复

<!-- @purpose -->
说明如何备份和还原存储在 Docker Volume 中的 SQLite 数据库，防止数据丢失。
<!-- /purpose -->

### 备份流程
<!-- @input -->
推荐方式：在 Web 界面左下角点击「导出」，或调用 `GET /api/backup/export` 获得 JSON 备份（可通过「导入」/ `POST /api/backup/import` 还原）。

也可以直接备份数据库文件（建议先停止容器，确保数据已全部落盘）：
```bash
# 从容器内将数据库文件拷贝到宿主机
docker stop agenttodo
docker cp agenttodo:/data/tasks.db ./backup-$(date +%Y%m%d).db
docker start agenttodo
```
<!-- /input -->

### 恢复流程
<!-- @input -->
```bash
# 将备份文件覆盖回容器，并重启服务生效
docker cp ./backup.db agenttodo:/data/tasks.db
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
cd task-manager
git pull
docker-compose pull
docker-compose up -d
```
<!-- /input -->

---

## 🐛 常见问题排查 (FAQ)

### Q: 忘记密码怎么办？
<!-- @output -->
AgentTODO 已经重构为 **本地私有化 (Zero-Auth)** 模式，无需用户登录与密码认证即可访问。
<!-- /output -->

### Q: 如何在 Raspberry Pi 上部署？
<!-- @output -->
本项目 Docker 镜像基于 Alpine + Node.js，CI 会同时构建 `amd64` 与 `arm64` 架构镜像。在树莓派上直接执行 `docker-compose up -d` 即可正常运行。
<!-- /output -->

### Q: "今天的任务"显示不对 / 逾期提醒时间不对？
<!-- @output -->
容器默认使用 UTC 时区。请在 `docker-compose.yml` 中设置 `TZ`（例如 `TZ=Asia/Shanghai`）后重新 `docker-compose up -d`，启动日志中会打印当前生效的时区。
<!-- /output -->

### Q: 数据库文件在宿主机的物理路径是什么？
<!-- @output -->
在使用 Docker 部署时，数据存储在 Docker volume 中。可通过以下命令查看实际挂载的物理路径：
```bash
docker volume inspect task-manager_task-data
```
<!-- /output -->

<!-- @references -->
- 有关 AI 集成：请参阅 [CLI 技能系统开发指南](./docs/cli-skill-guide.md)
- 有关 API 详情：请参阅 [API 参考文档](./docs/api-reference.md)
<!-- /references -->
