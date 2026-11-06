const express = require('express');
const { getDb } = require('../db');
const { asyncHandler, parseId, HttpError } = require('../utils/http');
const { serializeWebhook, WEBHOOK_EVENTS, DEFAULT_EVENTS } = require('../services/webhookService');

const router = express.Router();

const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 255;

function validateName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new HttpError(400, 'name is required');
  }
  if (name.trim().length > MAX_NAME_LENGTH) {
    throw new HttpError(400, `name must be ${MAX_NAME_LENGTH} characters or less`);
  }
  return name.trim();
}

function validateUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new HttpError(400, 'url is required');
  }
  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    throw new HttpError(400, 'url must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HttpError(400, 'url must use http or https');
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new HttpError(400, `url must be ${MAX_URL_LENGTH} characters or less`);
  }
  return trimmed;
}

function validateEvents(events) {
  const allowed = [...WEBHOOK_EVENTS, '*'];
  if (!Array.isArray(events) || events.length === 0 || !events.every((e) => allowed.includes(e))) {
    throw new HttpError(400, `events must be a non-empty array of: ${allowed.join(', ')}`);
  }
  return [...new Set(events)];
}

// GET /api/webhooks - List all registered webhooks
router.get('/', asyncHandler(async (req, res) => {
  const hooks = await getDb()('webhooks').orderBy('created_at', 'desc');
  res.json(hooks.map(serializeWebhook));
}));

// POST /api/webhooks - Register a new webhook (for AI to listen to push events)
router.post('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const body = req.body || {};
  const name = validateName(body.name);
  const url = validateUrl(body.url);
  const events = body.events === undefined ? DEFAULT_EVENTS : validateEvents(body.events);

  const [id] = await db('webhooks').insert({
    name,
    url,
    events: JSON.stringify(events),
    is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    created_at: new Date().toISOString(),
  });

  const hook = await db('webhooks').where('id', id).first();
  res.status(201).json(serializeWebhook(hook));
}));

// PUT /api/webhooks/:id - Update webhook (name / url / events / is_active)
router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseId(req.params.id);
  const body = req.body || {};
  const hook = await db('webhooks').where({ id }).first();
  if (!hook) return res.status(404).json({ error: 'Webhook not found' });

  const updates = {};
  if (body.name !== undefined) updates.name = validateName(body.name);
  if (body.url !== undefined) updates.url = validateUrl(body.url);
  if (body.events !== undefined) updates.events = JSON.stringify(validateEvents(body.events));
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, 'No valid fields to update (name, url, events, is_active)');
  }

  await db('webhooks').where('id', id).update(updates);
  const updated = await db('webhooks').where('id', id).first();
  res.json(serializeWebhook(updated));
}));

// DELETE /api/webhooks/:id - Remove a webhook
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await getDb()('webhooks').where('id', id).del();
  if (!deleted) return res.status(404).json({ error: 'Webhook not found' });
  res.json({ message: 'Webhook deleted' });
}));

module.exports = router;
