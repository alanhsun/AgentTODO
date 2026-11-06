const express = require('express');
const { getDb } = require('../db');
const { asyncHandler, parseId, HttpError } = require('../utils/http');
const { broadcastEvent } = require('../services/eventService');

const router = express.Router();

const MAX_TAG_NAME_LENGTH = 50;
const DEFAULT_COLOR = '#6366f1';
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new HttpError(400, 'Tag name is required');
  }
  if (name.trim().length > MAX_TAG_NAME_LENGTH) {
    throw new HttpError(400, `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less`);
  }
  return name.trim();
}

function validateColor(color) {
  if (typeof color !== 'string' || !COLOR_RE.test(color)) {
    throw new HttpError(400, 'color must be a hex color like #6366f1');
  }
  return color;
}

async function assertNameAvailable(db, name, excludeId = null) {
  const query = db('tags').where({ name });
  if (excludeId) query.whereNot('id', excludeId);
  if (await query.first()) {
    throw new HttpError(409, 'Tag already exists');
  }
}

// GET /api/tags - List all tags with task counts
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const tags = await db('tags')
    .leftJoin('task_tags', 'tags.id', 'task_tags.tag_id')
    .select('tags.id', 'tags.name', 'tags.color')
    .count('task_tags.task_id as task_count')
    .groupBy('tags.id')
    .orderBy('tags.name');

  res.json(tags.map((t) => ({ ...t, task_count: Number(t.task_count) || 0 })));
}));

// POST /api/tags - Create a tag
router.post('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const body = req.body || {};
  const name = validateName(body.name);
  const color = body.color === undefined || body.color === null || body.color === ''
    ? DEFAULT_COLOR
    : validateColor(body.color);

  await assertNameAvailable(db, name);
  const [id] = await db('tags').insert({ name, color });
  const tag = await db('tags').where('id', id).first();
  broadcastEvent('tag.created', { tagId: id });
  res.status(201).json({ ...tag, task_count: 0 });
}));

// PUT /api/tags/:id - Update a tag
router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseId(req.params.id);
  const body = req.body || {};
  const tag = await db('tags').where({ id }).first();

  if (!tag) {
    return res.status(404).json({ error: 'Tag not found' });
  }

  const updates = {};
  if (body.name !== undefined) updates.name = validateName(body.name);
  if (body.color !== undefined) updates.color = validateColor(body.color);

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, 'No valid fields to update');
  }
  if (updates.name) await assertNameAvailable(db, updates.name, id);

  await db('tags').where('id', id).update(updates);
  const updated = await db('tags').where('id', id).first();
  broadcastEvent('tag.updated', { tagId: id });
  res.json(updated);
}));

// DELETE /api/tags/:id - Delete a tag (task links cascade)
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseId(req.params.id);
  const deleted = await db('tags').where('id', id).del();

  if (!deleted) {
    return res.status(404).json({ error: 'Tag not found' });
  }
  broadcastEvent('tag.deleted', { tagId: id });
  res.json({ message: 'Tag deleted successfully' });
}));

module.exports = router;
