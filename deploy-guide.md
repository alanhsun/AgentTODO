# AgentTODO 部署指南

<purpose>
提供 AgentTODO 系统的多种部署方式（Docker、本地开发）、数据备份策略以及常见问题排查方案。适用于家庭服务器和低功耗设备（如 Raspberry Pi）部署。
</purpose>

<dependencies>
- Docker 20.10+ 和 Docker Compose V2
- 或 Node.js 20+ （本地开发）
</dependencies>

---

## 🚀 快速部署（Docker 推荐）

<purpose>
使用 Docker Compose 快速拉起服务并映射持久化数据卷。
</purpose>

### 1. 克隆/下载项目

<input>
```bash
cd /opt
git clone https://github.com/alanhsun/AgentTODO.git task-manager
cd task-manager
```
</input>

### 2. 一键启动

<input>
```bash
docker-compose up -d
```
</input>

<output>
服务启动成功后，通过浏览器访问 `http://<服务器IP>:3300`。
</output>

---

## ⚙️ 环境变量配置

<purpose>
通过环境变量调整后端运行端口、数据库路径及环境模式。
</purpose>

<input>
| 环境变量名称      | 默认值               | 功能说明                   |
|-----------------|----------------------|------------------------|
| `PORT`          | `3300`               | 设定后端服务监听端口         |
| `DB_PATH`       | `/data/tasks.db`     | 指定 SQLite 数据库文件存储路径 |
| `NODE_ENV`      | `production`         | 标识系统运行环境             |
</input>

---

## 🔧 本地开发环境

<purpose>
为二次开发准备本地调试环境，分离前后端服务以支持热更新。
</purpose>

<input>
```bash
# 安装根目录和子目录依赖
cd server && npm install
cd ../client && npm install

# 终端 A：启动后端 (监听 3300 端口)
cd server && npm run dev

# 终端 B：启动前端 (监听 5173 端口，并自动代理 API 请求)
cd client && npm run dev
```
</input>

---

## 💾 数据备份与恢复

<purpose>
说明如何备份和还原存储在 Docker Volume 中的 SQLite 数据库，防止数据丢失。
</purpose>

### 备份流程
<input>
```bash
# 从容器内将数据库文件拷贝到宿主机
docker cp agenttodo:/data/tasks.db ./backup-$(date +%Y%m%d).db
```
</input>

### 恢复流程
<input>
```bash
# 将备份文件覆盖回容器，并重启服务生效
docker cp ./backup.db agenttodo:/data/tasks.db
docker restart agenttodo
```
</input>

---

## 🔄 更新升级

<purpose>
获取最新的代码与 Docker 镜像，并平滑升级系统。
</purpose>

<input>
```bash
cd task-manager
git pull
docker-compose pull
docker-compose up -d
```
</input>

---

## 🐛 常见问题排查 (FAQ)

### Q: 忘记密码怎么办？
<output>
AgentTODO 已经重构为 **本地私有化 (Zero-Auth)** 模式，无需用户登录与密码认证即可访问。
</output>

### Q: 如何在 Raspberry Pi 上部署？
<output>
本项目 Docker 镜像基于 Alpine + Node.js，原生支持 `arm64` 架构。在树莓派上直接执行 `docker-compose up -d` 即可正常运行。
</output>

### Q: 数据库文件在宿主机的物理路径是什么？
<output>
在使用 Docker 部署时，数据存储在 Docker volume 中。可通过以下命令查看实际挂载的物理路径：
```bash
docker volume inspect task-manager_task-data
```
</output>

<references>
- 有关 AI 集成：请参阅 [CLI 技能系统开发指南](./docs/cli-skill-guide.md)
- 有关 API 详情：请参阅 [API 参考文档](./docs/api-reference.md)
</references>
