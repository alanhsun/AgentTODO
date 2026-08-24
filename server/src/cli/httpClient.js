const axios = require('axios');
const API_BASE = (process.env.AGENTTODO_URL || 'http://localhost:3301/api').replace(/\/$/, '');

function resolveUrl(pathOrUrl) {
  return /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : `${API_BASE}/${String(pathOrUrl).replace(/^\//, '')}`;
}

function authConfig() {
  const token = process.env.AGENTTODO_API_TOKEN;
  const timeout = Number.parseInt(process.env.AGENTTODO_TIMEOUT_MS || '10000', 10);
  return {
    timeout: Number.isFinite(timeout) ? timeout : 10000,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}

function get(url) {
  return axios.get(resolveUrl(url), authConfig());
}

function post(url, data) {
  return axios.post(resolveUrl(url), data, authConfig());
}

function put(url, data) {
  return axios.put(resolveUrl(url), data, authConfig());
}

module.exports = { get, post, put };
