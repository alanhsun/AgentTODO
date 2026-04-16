# AgentTODO 客户端 (Client)

<!-- @purpose -->
AgentTODO 的前端界面，采用 React + Vite 构建。提供现代化的响应式 Web UI（包含看板与列表双视图），与无认证 (Zero-Auth) 的后端 API 直接交互，为用户提供直观的任务管理体验。
<!-- /purpose -->

<!-- @dependencies -->
- Node.js >= 20
- React 18
- Vite
<!-- /dependencies -->

---

## 🚀 快速启动

<!-- @input -->
```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
```
<!-- /input -->

<!-- @output -->
前端开发服务器将运行在 `http://localhost:3300`。
会自动将 `/api` 请求代理到后端的 `http://localhost:3301`（需确保根目录执行 `npm run dev` 启动了后端服务）。
<!-- /output -->

---

## 🛠️ 构建与部署

<!-- @input -->
```bash
# 构建生产环境静态文件
npm run build
```
<!-- /input -->

<!-- @output -->
构建产物将输出到 `dist` 目录。在生产环境中，该目录将被后端服务直接代理作为静态资源提供访问。
<!-- /output -->

<!-- @references -->
- 关于整个项目的部署说明：[部署指南](../deploy-guide.md)
<!-- /references -->
