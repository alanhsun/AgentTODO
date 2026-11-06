/**
 * CLI 技能共享配置
 * 为什么需要 BASE_URL？因为 CLI 相当于一个遥控器，它需要知道服务器（主机）的具体地址才能发指令。
 * 可以通过 AGENTTODO_URL 环境变量覆盖，例如 Docker 部署时设为 http://localhost:3300/api
 */
const BASE_URL = (process.env.AGENTTODO_URL || 'http://localhost:3301/api').replace(/\/+$/, '');

// 所有请求的超时时间，避免服务无响应时 AI 一直卡住
const REQUEST_OPTIONS = { timeout: parseInt(process.env.AGENTTODO_TIMEOUT, 10) || 10000 };

module.exports = { BASE_URL, REQUEST_OPTIONS };
