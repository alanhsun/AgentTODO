const path = require('path');

const config = {
  // 本地开发时默认使用 3301，Docker 或生产环境使用传入的 PORT (通常是 3300)
  port: parseInt(process.env.PORT, 10) || 3301,
  // 监听地址；留空则自动选择（IPv6 可用时为 ::，同时接受 IPv4 连接）
  host: process.env.HOST || undefined,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tasks.db'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // 请求体大小上限（备份导入可能较大）
  jsonLimit: process.env.JSON_LIMIT || '20mb',
  // 逾期检查的 cron 表达式（使用服务器本地时区，可通过 TZ 环境变量设置）
  overdueCron: process.env.OVERDUE_CRON || '0 9 * * *',
  // Webhook 推送超时（毫秒）
  webhookTimeout: parseInt(process.env.WEBHOOK_TIMEOUT, 10) || 5000,
};

module.exports = config;
