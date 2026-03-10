const app = require('./app');
const config = require('./config');
const { initDb } = require('./db');
const { initWorkers } = require('./worker');

async function start() {
  try {
    await initDb();
    console.log('Database initialized');

    app.listen(config.port, '0.0.0.0', () => {
      console.log(`Task Manager API running on http://0.0.0.0:${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      
      // 启动 Webhook 轮询监控系统 (如检查逾期)
      initWorkers();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
