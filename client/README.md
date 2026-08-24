# AgentTODO 客户端 (Client)

<!-- @purpose -->
AgentTODO 的前端界面，采用 React + Vite 构建。提供现代化的响应式 Web UI（包含列表、看板和日历视图），与本地优先、支持可选 Token 的后端 API 交互，为用户提供直观的任务管理体验。
<!-- /purpose -->

<!-- @dependencies -->
- Node.js >= 20
- React 19
- Vite
<!-- /dependencies -->

---

## 🚀 快速启动

<!-- @input -->
```bash
# 1. 在仓库根目录按 package-lock.json 安装全部 workspace 依赖
cd ..
npm ci

# 2. 启动开发服务器
npm run dev:client
```
<!-- /input -->

<!-- @output -->
前端开发服务器将运行在 `http://localhost:3300`。
会自动将 `/api` 请求代理到后端的 `http://localhost:3301`（需确保根目录执行 `npm run dev` 启动了后端服务）。
<!-- /output -->

客户端包含列表、看板和日历三种视图，支持深浅主题、筛选、批量操作、子任务、附件以及重复任务每日完成状态。任务选项的公共显示定义位于 `src/utils/taskOptions.js`，日历重复规则位于 `src/utils/calendarRecurrence.js`。

---

## 🛠️ 构建与部署

<!-- @input -->
```bash
# 在仓库根目录执行
npm run build:client
npm run lint
npm run test:calendar --workspace=client
```
<!-- /input -->

<!-- @output -->
构建产物将输出到 `dist` 目录。在生产环境中，该目录将被后端服务直接代理作为静态资源提供访问。
<!-- /output -->

<!-- @references -->
- 关于整个项目的部署说明：[部署指南](../deploy-guide.md)
<!-- /references -->
