# syntax=docker/dockerfile:1
# 本项目使用 npm workspaces，锁文件只存在于根目录，
# 因此所有安装步骤都基于根目录 package-lock.json 执行 `npm ci`，保证构建可复现。

# ---- Stage 1: build frontend ----
FROM node:20-alpine AS client-build
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
# --ignore-scripts：前端构建不需要任何原生编译（esbuild / rollup 通过可选平台依赖提供二进制），
# 同时避免 npm 在某些版本下顺带安装 server 工作区时触发 sqlite3 的 node-gyp 编译。
RUN npm ci --workspace client --include-workspace-root=false --ignore-scripts --no-audit --no-fund

COPY client/ ./client/
RUN npm run build --workspace client

# ---- Stage 2: server production dependencies (needs toolchain for native sqlite3 fallback builds) ----
FROM node:20-alpine AS server-deps
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --workspace server --include-workspace-root=false --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# ---- Stage 3: runtime (no build toolchain, smaller & safer image) ----
FROM node:20-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=server-deps /app/node_modules ./node_modules

# Server source
COPY server/package.json ./server/
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY server/knexfile.js ./server/

# API docs (for Swagger UI)
COPY docs/openapi.yaml ./docs/openapi.yaml

# Client build output
COPY --from=client-build /app/client/dist ./client/dist

# Data directory
RUN mkdir -p /data && chown -R appuser:appgroup /data

USER appuser

ENV NODE_ENV=production
ENV PORT=3300
ENV DB_PATH=/data/tasks.db
# 容器内 CLI 默认指向本机服务
ENV AGENTTODO_URL=http://localhost:3300/api

EXPOSE 3300
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3300/api/health || exit 1

CMD ["node", "server/src/server.js"]
