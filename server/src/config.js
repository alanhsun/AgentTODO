const path = require('path');

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseList(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function isLoopbackHost(host) {
  return ['127.0.0.1', '::1', 'localhost'].includes(host);
}

function parsePositiveInteger(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

const host = process.env.HOST || '127.0.0.1';
const privateWebhookDefault = isLoopbackHost(host);

const config = {
  // 本地开发时默认使用 3301，Docker 或生产环境使用传入的 PORT (通常是 3300)
  port: parseInt(process.env.PORT, 10) || 3301,
  host,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tasks.db'),
  attachmentDir: process.env.ATTACHMENT_DIR || path.join(__dirname, '..', 'data', 'attachments'),
  attachmentMaxBytes: parsePositiveInteger(process.env.ATTACHMENT_MAX_SIZE_MB, 20) * 1024 * 1024,
  backupMaxBytes: parsePositiveInteger(process.env.BACKUP_MAX_SIZE_MB, 1024) * 1024 * 1024,
  appTimezone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
  corsOrigins: parseList(process.env.CORS_ORIGIN),
  apiToken: process.env.API_TOKEN ? process.env.API_TOKEN.trim() : '',
  apiUsername: process.env.API_USERNAME || 'agenttodo',
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || '50mb',
  webhookAllowPrivateNetwork: parseBoolean(process.env.WEBHOOK_ALLOW_PRIVATE_NETWORK, privateWebhookDefault),
  webhookAllowedHosts: parseList(process.env.WEBHOOK_ALLOWED_HOSTS).map((hostName) => hostName.toLowerCase()),
};

module.exports = config;
