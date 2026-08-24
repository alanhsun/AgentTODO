const axios = require('axios');

function authConfig() {
  const token = process.env.AGENTTODO_API_TOKEN;
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
}

function get(url) {
  const config = authConfig();
  return config ? axios.get(url, config) : axios.get(url);
}

function post(url, data) {
  const config = authConfig();
  return config ? axios.post(url, data, config) : axios.post(url, data);
}

function put(url, data) {
  const config = authConfig();
  return config ? axios.put(url, data, config) : axios.put(url, data);
}

module.exports = { get, post, put };
