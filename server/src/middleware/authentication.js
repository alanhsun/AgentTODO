const crypto = require('crypto');

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function readToken(req, username) {
  const directToken = req.get('x-api-token');
  if (directToken) return directToken;

  const authorization = req.get('authorization') || '';
  if (authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  if (authorization.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
      const separatorIndex = decoded.indexOf(':');
      if (separatorIndex < 0) return '';
      const suppliedUsername = decoded.slice(0, separatorIndex);
      if (!safeEqual(suppliedUsername, username)) return '';
      return decoded.slice(separatorIndex + 1);
    } catch (_err) {
      return '';
    }
  }

  return '';
}

function createAuthenticationMiddleware({ apiToken, apiUsername }) {
  if (!apiToken) return (_req, _res, next) => next();

  return (req, res, next) => {
    if (req.method === 'OPTIONS' || req.path === '/api/health') return next();

    const suppliedToken = readToken(req, apiUsername);
    if (safeEqual(suppliedToken, apiToken)) return next();

    res.set('WWW-Authenticate', 'Basic realm="AgentTODO", charset="UTF-8"');
    return res.status(401).json({ error: 'Authentication required' });
  };
}

module.exports = { createAuthenticationMiddleware, safeEqual };
