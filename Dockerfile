# Build stage — install from the single workspace lockfile and compile the frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci --workspace=client

COPY client/ ./client/
RUN npm run build --workspace=client

# Production dependency stage — compile sqlite3 without retaining build tools
FROM node:20-alpine AS server-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev --workspace=server \
    && apk del .build-deps \
    && npm cache clean --force

# Minimal runtime stage
FROM node:20-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=server-dependencies /app/node_modules ./node_modules
COPY package.json ./package.json
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY server/knexfile.js ./server/knexfile.js
COPY docs/ ./docs/
COPY --from=builder /app/client/dist ./client/dist

RUN mkdir -p /data && chown -R appuser:appgroup /data /app

USER appuser

ENV NODE_ENV=production
ENV HOST=127.0.0.1
ENV PORT=3300
ENV DB_PATH=/data/tasks.db
ENV APP_TIMEZONE=Asia/Shanghai

EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3300/api/health || exit 1

CMD ["node", "server/src/server.js"]
