const app = require('./app');
const config = require('./config');
const { initDb } = require('./db');
const { initWorkers } = require('./worker');
const { assertValidTimeZone } = require('./utils/date');

async function start() {
  try {
    assertValidTimeZone(config.appTimezone);
    await initDb();
    console.log('Database initialized');

    app.listen(config.port, config.host, () => {
      console.log(`Task Manager API running on http://${config.host}:${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Application timezone: ${config.appTimezone}`);
      if (!config.apiToken && !['127.0.0.1', '::1', 'localhost'].includes(config.host)) {
        console.warn('WARNING: AgentTODO is listening beyond localhost without API_TOKEN. Only use this on a trusted LAN.');
      }
      if (config.webhookAllowPrivateNetwork) {
        console.warn('Webhook delivery to private-network targets is enabled. Only trusted users should manage webhooks.');
      }
      
      // 启动 Webhook 轮询监控系统 (如检查逾期)
      initWorkers();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
