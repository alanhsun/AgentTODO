const path = require('path');

const config = {
  // 本地开发时默认使用 3301，Docker 或生产环境使用传入的 PORT (通常是 3300)
  port: parseInt(process.env.PORT, 10) || 3301,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tasks.db'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

module.exports = config;
