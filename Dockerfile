# Build stage — compile frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Client dependencies & build
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm ci 2>/dev/null || npm install

COPY client/ ./client/
RUN cd client && npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Server dependencies (production only)
COPY server/package.json server/package-lock.json* ./server/
RUN apk add --no-cache python3 make g++ \
    && cd server && npm ci --omit=dev 2>/dev/null || npm install --omit=dev \
    && npm cache clean --force

# Server source
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY server/knexfile.js ./server/

# API docs (for Swagger UI)
COPY docs/ ./docs/

# Client build output
COPY --from=builder /app/client/dist ./client/dist

# Data directory
RUN mkdir -p /data && chown -R appuser:appgroup /data /app

USER appuser

ENV NODE_ENV=production
ENV PORT=3300
ENV DB_PATH=/data/tasks.db

EXPOSE 3300

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3300/api/health || exit 1

CMD ["node", "server/src/server.js"]
