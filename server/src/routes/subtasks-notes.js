const express = require('express');
const { getDb } = require('../db');
const { asyncHandler, parseId, HttpError } = require('../utils/http');
const { serializeSubtask } = require('../services/taskService');
const { broadcastEvent } = require('../services/eventService');
const { MAX_TITLE_LENGTH } = require('../validators/task');

const router = express.Router();

const MAX_SOURCE_LENGTH = 50;

/** 统一加载父任务：不存在时直接 404，避免每个路由重复同样的检查 */
router.param('taskId', (req, res, next, value) => {
  (async () => {
    const taskId = parseId(value, 'taskId');
    const task = await getDb()('tasks').where({ id: taskId }).first();
    if (!task) return res.status(404).json({ error: 'Task not found' });
    req.task = task;
    next();
  })().catch(next);
});

function validateTitle(title) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new HttpError(400, 'Title is required');
  }
  if (title.trim().length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, `Title must be ${MAX_TITLE_LENGTH} characters or less`);
  }
  return title.trim();
}

/** 子任务 / 笔记变化时同步刷新父任务的 updated_at，便于按"最近更新"排序 */
function touchTask(db, taskId, now) {
  return db('tasks').where('id', taskId).update({ updated_at: now });
}

// GET /api/tasks/:taskId/subtasks - List subtasks
router.get('/:taskId/subtasks', asyncHandler(async (req, res) => {
  const subtasks = await getDb()('subtasks')
    .where('task_id', req.task.id)
    .orderBy(['sort_order', 'id']);
  res.json(subtasks.map(serializeSubtask));
}));

// POST /api/tasks/:taskId/subtasks - Add subtask
router.post('/:taskId/subtasks', asyncHandler(async (req, res) => {
  const db = getDb();
  const title = validateTitle(req.body && req.body.title);
  const now = new Date().toISOString();

  const [maxOrder] = await db('subtasks').where('task_id', req.task.id).max('sort_order as max');
  const [id] = await db('subtasks').insert({
    task_id: req.task.id,
    title,
    completed: false,
    sort_order: (maxOrder.max || 0) + 1,
    created_at: now,
  });
  await touchTask(db, req.task.id, now);

  const subtask = await db('subtasks').where('id', id).first();
  broadcastEvent('subtask.created', { taskId: req.task.id, subtaskId: id });
  res.status(201).json(serializeSubtask(subtask));
}));

// PUT /api/tasks/:taskId/subtasks/:id - Toggle / update subtask
router.put('/:taskId/subtasks/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseId(req.params.id);
  const body = req.body || {};

  const subtask = await db('subtasks').where({ id, task_id: req.task.id }).first();
  if (!subtask) return res.status(404).json({ error: 'Subtask not found' });

  const updates = {};
  if (body.title !== undefined) updates.title = validateTitle(body.title);
  if (body.completed !== undefined) updates.completed = body.completed ? 1 : 0;
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(body.sort_order)) throw new HttpError(400, 'sort_order must be an integer');
    updates.sort_order = body.sort_order;
  }
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, 'No valid fields to update (title, completed, sort_order)');
  }

  await db('subtasks').where('id', id).update(updates);
  await touchTask(db, req.task.id, new Date().toISOString());
  const updated = await db('subtasks').where('id', id).first();
  broadcastEvent('subtask.updated', { taskId: req.task.id, subtaskId: id });
  res.json(serializeSubtask(updated));
}));

// DELETE /api/tasks/:taskId/subtasks/:id - Remove subtask
router.delete('/:taskId/subtasks/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseId(req.params.id);
  const deleted = await db('subtasks').where({ id, task_id: req.task.id }).del();
  if (!deleted) return res.status(404).json({ error: 'Subtask not found' });
  await touchTask(db, req.task.id, new Date().toISOString());
  broadcastEvent('subtask.deleted', { taskId: req.task.id, subtaskId: id });
  res.json({ message: 'Subtask deleted' });
}));

// GET /api/tasks/:taskId/notes - List notes
router.get('/:taskId/notes', asyncHandler(async (req, res) => {
  const notes = await getDb()('task_notes')
    .where('task_id', req.task.id)
    .orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]);
  res.json(notes);
}));

// POST /api/tasks/:taskId/notes - Add a note
router.post('/:taskId/notes', asyncHandler(async (req, res) => {
  const db = getDb();
  const { content, source } = req.body || {};
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new HttpError(400, 'Content is required');
  }
  if (source !== undefined && (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH)) {
    throw new HttpError(400, `source must be a string of at most ${MAX_SOURCE_LENGTH} characters`);
  }

  const now = new Date().toISOString();
  const [id] = await db('task_notes').insert({
    task_id: req.task.id,
    content: content.trim(),
    source: source || 'user',
    created_at: now,
  });
  await touchTask(db, req.task.id, now);

  const note = await db('task_notes').where('id', id).first();
  broadcastEvent('note.created', { taskId: req.task.id, noteId: id });
  res.status(201).json(note);
}));

// DELETE /api/tasks/:taskId/notes/:id - Delete a note
router.delete('/:taskId/notes/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const deleted = await getDb()('task_notes').where({ id, task_id: req.task.id }).del();
  if (!deleted) return res.status(404).json({ error: 'Note not found' });
  broadcastEvent('note.deleted', { taskId: req.task.id, noteId: id });
  res.json({ message: 'Note deleted' });
}));

module.exports = router;
