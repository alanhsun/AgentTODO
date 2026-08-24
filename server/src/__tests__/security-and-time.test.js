const express = require('express');
const request = require('supertest');
const { createAuthenticationMiddleware } = require('../middleware/authentication');
const { dateInTimeZone } = require('../utils/date');
const { validateWebhookUrl, isPrivateIp } = require('../utils/webhookUrl');
const { validateBackup } = require('../validators/backup');

describe('Security and time helpers', () => {
  test('uses the configured application timezone for date boundaries', () => {
    const instant = new Date('2026-08-23T16:30:00.000Z');
    expect(dateInTimeZone(instant, 'Asia/Shanghai')).toBe('2026-08-24');
    expect(dateInTimeZone(instant, 'UTC')).toBe('2026-08-23');
  });

  test('recognizes loopback and private addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.10')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  test('allows trusted LAN webhook targets only when explicitly enabled', async () => {
    await expect(validateWebhookUrl('http://127.0.0.1:9000/hook', {
      allowPrivateNetwork: false,
      allowedHosts: [],
    })).rejects.toThrow('Private-network');

    await expect(validateWebhookUrl('http://127.0.0.1:9000/hook', {
      allowPrivateNetwork: true,
      allowedHosts: [],
    })).resolves.toBe('http://127.0.0.1:9000/hook');
  });

  test('supports browser basic auth and API bearer tokens', async () => {
    const protectedApp = express();
    protectedApp.use(createAuthenticationMiddleware({ apiToken: 'secret-token', apiUsername: 'agenttodo' }));
    protectedApp.get('/private', (_req, res) => res.json({ ok: true }));

    expect((await request(protectedApp).get('/private')).status).toBe(401);
    expect((await request(protectedApp).get('/private').auth('agenttodo', 'secret-token')).status).toBe(200);
    expect((await request(protectedApp).get('/private').set('Authorization', 'Bearer secret-token')).status).toBe(200);
  });

  test('rejects malformed or oversized backup structures', () => {
    expect(validateBackup({ version: 1, data: { tasks: [] } })).toBeNull();
    expect(validateBackup({ version: 2, data: {} })).toMatch(/version/);
    expect(validateBackup({ version: 1, data: { tasks: {} } })).toMatch(/array/);
  });
});
