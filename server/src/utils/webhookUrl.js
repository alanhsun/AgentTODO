const dns = require('dns');
const dnsPromises = dns.promises;
const net = require('net');

function isPrivateIpv4(address) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIp(address) {
  if (net.isIP(address) === 4) return isPrivateIpv4(address);
  if (net.isIP(address) !== 6) return true;

  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    return isPrivateIpv4(normalized.slice('::ffff:'.length));
  }
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized);
}

function hostIsAllowed(hostname, allowedHosts) {
  if (allowedHosts.length === 0) return true;
  const normalized = hostname.toLowerCase();
  return allowedHosts.some((allowedHost) => normalized === allowedHost
    || (allowedHost.startsWith('*.') && normalized.endsWith(allowedHost.slice(1))));
}

async function validateWebhookUrl(rawUrl, { allowPrivateNetwork, allowedHosts }) {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0 || rawUrl.length > 2048) {
    throw new Error('Webhook URL must be a non-empty string no longer than 2048 characters');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (_err) {
    throw new Error('Webhook URL is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use http or https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Webhook URL must not contain credentials');
  }
  if (!hostIsAllowed(parsed.hostname, allowedHosts)) {
    throw new Error('Webhook host is not in WEBHOOK_ALLOWED_HOSTS');
  }

  if (!allowPrivateNetwork) {
    if (parsed.hostname.toLowerCase() === 'localhost') {
      throw new Error('Private-network webhook targets are disabled');
    }

    let addresses;
    try {
      addresses = await dnsPromises.lookup(parsed.hostname, { all: true, verbatim: true });
    } catch (_err) {
      throw new Error('Webhook host could not be resolved');
    }

    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
      throw new Error('Private-network webhook targets are disabled');
    }
  }

  return parsed.toString();
}

function createWebhookLookup({ allowPrivateNetwork }) {
  return (hostname, options, callback) => {
    const lookupOptions = typeof options === 'object' ? options : { family: options };
    dns.lookup(hostname, {
      family: lookupOptions.family || 0,
      all: true,
      verbatim: true,
    }, (error, addresses) => {
      if (error) return callback(error);
      if (!allowPrivateNetwork && addresses.some(({ address }) => isPrivateIp(address))) {
        return callback(new Error('Private-network webhook targets are disabled'));
      }
      if (addresses.length === 0) return callback(new Error('Webhook host could not be resolved'));
      if (lookupOptions.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

module.exports = { validateWebhookUrl, createWebhookLookup, isPrivateIp, hostIsAllowed };
