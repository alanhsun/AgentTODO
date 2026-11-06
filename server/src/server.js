const app = require('./app');
const config = require('./config');
const { initDb, closeDb } = require('./db');
const { initWorkers, stopWorkers } = require('./worker');
const { flushWebhooks } = require('./services/webhookService');
const { closeAllEventClients } = require('./services/eventService');

const SHUTDOWN_TIMEOUT_MS = 10000;

async function start() {
  try {
    await initDb();
    console.log('Database initialized');
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }

  // 未指定 HOST 时由 Node 自动选择：支持 IPv6 时监听 ::（同时接受 IPv4），否则 0.0.0.0。
  // 仅监听 0.0.0.0 会导致 Windows 等系统上 "localhost" 优先解析到 ::1 时每次请求多等待约 2 秒。
  const onListening = () => {
    const addr = server.address();
    console.log(`Task Manager API running on port ${addr.port} (${addr.address})`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

    // 启动 Webhook 轮询监控系统 (如检查逾期)
    initWorkers();
  };
  const server = config.host
    ? app.listen(config.port, config.host, onListening)
    : app.listen(config.port, onListening);

  server.on('error', (err) => {
    console.error('HTTP server error:', err.message);
    process.exit(1);
  });

  // 优雅退出：Node 作为容器 PID 1 时不会默认响应 SIGTERM，必须显式处理，
  // 否则 `docker stop` 要等满 10 秒被强杀，且可能中断正在进行的写入。
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully...`);
    stopWorkers();
    closeAllEventClients();

    const forceExit = setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
      try {
        await flushWebhooks();
        await closeDb();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
