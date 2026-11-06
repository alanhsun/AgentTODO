const express = require('express');
const { getDb } = require('../db');
const { validateTaskInput, validateBatchInput } = require('../validators/task');
const { triggerWebhook } = require('../services/webhookService');
const { broadcastEvent } = require('../services/eventService');
const {
  PRIORITY_RANK_SQL,
  attachTags,
  attachSubtasks,
  getTaskWithTags,
  getTaskDetail,
  resolveTagIds,
  replaceTaskTags,
  insertSubtasks,
  completionFields,
  spawnNextOccurrence,
} = require('../services/taskService');
const { asyncHandler, parseId, HttpError } = require('../utils/http');
const { today: localToday, normalizeDate } = require('../utils/date');

const router = express.Router();

const MAX_PAGE_SIZE = 500;
const ALLOWED_SORTS = ['created_at', 'updated_at', 'due_date', 'priority', 'title', 'status'];

/** 支持 ?status=a,b 与 ?status=a&status=b 两种写法 */
function csv(value) {
  if (value === undefined || value === null || value === '') return [];
  return [].concat(value).join(',').split(',').map((s) => s.trim()).filter(Boolean);
}

/** 转义 LIKE 通配符，避免搜索 "50%" 时匹配所有内容 */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

function startOfLocalDayIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

// GET /api/tasks/summary - AI-friendly task overview
router.get('/summary', asyncHandler(async (req, res) => {
  const db = getDb();
  const today = localToday();
  const notDone = "status != 'done'";

  const row = await db('tasks')
    .select(
      db.raw('COUNT(*) AS total'),
      db.raw("SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) AS todo"),
      db.raw("SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress"),
      db.raw("SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done"),
      db.raw(`SUM(CASE WHEN ${notDone} AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue`, [today]),
      db.raw(`SUM(CASE WHEN ${notDone} AND due_date = ? THEN 1 ELSE 0 END) AS due_today`, [today]),
      db.raw(`SUM(CASE WHEN ${notDone} AND priority = 'urgent' THEN 1 ELSE 0 END) AS urgent`),
      db.raw(`SUM(CASE WHEN ${notDone} AND priority = 'high' THEN 1 ELSE 0 END) AS high`),
      db.raw("SUM(CASE WHEN status = 'done' AND completed_at >= ? THEN 1 ELSE 0 END) AS completed_today", [startOfLocalDayIso()]),
    )
    .first();

  const n = (v) => Number(v) || 0;
  res.json({
    total: n(row.total),
    by_status: { todo: n(row.todo), in_progress: n(row.in_progress), done: n(row.done) },
    overdue: n(row.overdue),
    due_today: n(row.due_today),
    completed_today: n(row.completed_today),
    by_priority: { urgent: n(row.urgent), high: n(row.high) },
    date: today,
  });
}));

// GET /api/tasks/today - Today's agenda (due today + overdue + active in-progress + completed today)
router.get('/today', asyncHandler(async (req, res) => {
  const db = getDb();
  const today = localToday();
  const startOfDay = startOfLocalDayIso();

  const [dueOrOverdue, inProgressOthers, completedToday] = await Promise.all([
    db('tasks')
      .where('status', '!=', 'done')
      .whereNotNull('due_date')
      .where('due_date', '<=', today)
      .orderByRaw(`${PRIORITY_RANK_SQL} DESC`)
      .orderBy('due_date', 'asc')
      .orderBy('id', 'asc'),
    db('tasks')
      .where('status', 'in_progress')
      .where(function () {
        this.whereNull('due_date').orWhere('due_date', '>', today);
      })
      .orderByRaw(`${PRIORITY_RANK_SQL} DESC`)
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'asc'),
    db('tasks')
      .where('status', 'done')
      .where('completed_at', '>=', startOfDay)
      .orderBy('completed_at', 'desc')
      .orderBy('id', 'desc'),
  ]);

  const enrich = async (list) => {
    const withTags = await attachTags(db, list);
    return attachSubtasks(db, withTags);
  };

  const [enrichedDue, enrichedInProgress, enrichedCompleted] = await Promise.all([
    enrich(dueOrOverdue),
    enrich(inProgressOthers),
    enrich(completedToday),
  ]);

  const result = enrichedDue.map((t) => ({
    ...t,
    is_overdue: t.due_date < today,
  }));

  res.json({
    date: today,
    tasks: result,
    in_progress_others: enrichedInProgress,
    completed_today: enrichedCompleted,
  });
}));

// GET /api/tasks/overdue - Overdue tasks
router.get('/overdue', asyncHandler(async (req, res) => {
  const db = getDb();
  const today = localToday();

  let tasks = await db('tasks')
    .where('status', '!=', 'done')
    .whereNotNull('due_date')
    .where('due_date', '<', today)
    .orderBy('due_date', 'asc')
    .orderByRaw(`${PRIORITY_RANK_SQL} DESC`);

  tasks = await attachTags(db, tasks);
  tasks = await attachSubtasks(db, tasks);

  res.json({ date: today, tasks });
}));

// GET /api/tasks - List tasks with filtering, search, pagination
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    status, priority, tag, search,
    due_before, due_after,
    sort = 'created_at', order = 'desc',
    page = 1, limit = 20,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const dueBefore = normalizeDate(due_before);
  const dueAfter = normalizeDate(due_after);
  if (dueBefore === undefined || dueAfter === undefined) {
    throw new HttpError(400, 'due_before / due_after must be dates in YYYY-MM-DD format');
  }

  const statuses = csv(status);
  const priorities = csv(priority);
  const tagIds = csv(tag).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const searchTerm = typeof search === 'string' && search.trim() ? `%${escapeLike(search.trim())}%` : null;

  const applyFilters = (qb) => {
    if (statuses.length) qb.whereIn('tasks.status', statuses);
    if (priorities.length) qb.whereIn('tasks.priority', priorities);
    if (searchTerm) {
      qb.where(function () {
        this.whereRaw("tasks.title LIKE ? ESCAPE '\\'", [searchTerm])
          .orWhereRaw("tasks.description LIKE ? ESCAPE '\\'", [searchTerm]);
      });
    }
    if (dueBefore) qb.where('tasks.due_date', '<=', dueBefore);
    if (dueAfter) qb.where('tasks.due_date', '>=', dueAfter);
    if (tagIds.length) {
      // 使用 EXISTS 子查询，避免 JOIN + GROUP BY 导致计数复杂且需要两次查询
      qb.whereExists(function () {
        this.select(db.raw('1'))
          .from('task_tags')
          .whereRaw('task_tags.task_id = tasks.id')
          .whereIn('task_tags.tag_id', tagIds);
      });
    }
    return qb;
  };

  const sortCol = ALLOWED_SORTS.includes(sort) ? sort : 'created_at';
  const sortOrder = String(order).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const [{ count }] = await applyFilters(db('tasks')).count('* as count');
  const total = Number(count) || 0;

  const query = applyFilters(db('tasks')).select('tasks.*');
  if (sortCol === 'priority') {
    query.orderByRaw(`${PRIORITY_RANK_SQL} ${sortOrder}`);
  } else if (sortCol === 'due_date') {
    // 无截止日期的任务始终排在最后
    query.orderByRaw(`tasks.due_date IS NULL, tasks.due_date ${sortOrder}`);
  } else {
    query.orderBy(`tasks.${sortCol}`, sortOrder);
  }
  query.orderBy('tasks.id', 'desc').limit(limitNum).offset(offset);

  let tasks = await query;
  tasks = await attachTags(db, tasks);
  tasks = await attachSubtasks(db, tasks);

  res.json({
    data: tasks,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
}));

// POST /api/tasks - Create a task
router.post('/', asyncHandler(async (req, res) => {
  const errors = validateTaskInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const db = getDb();
  const { title, description, status, priority, due_date, recurrence, recurrence_end, tags, subtasks } = req.body;
  const now = new Date().toISOString();
  const finalStatus = status || 'todo';

  const id = await db.transaction(async (trx) => {
    const tagIds = await resolveTagIds(trx, tags);

    const [newId] = await trx('tasks').insert({
      title: title.trim(),
      description: description || '',
      status: finalStatus,
      priority: priority || 'medium',
      due_date: normalizeDate(due_date),
      recurrence: recurrence || 'none',
      recurrence_end: normalizeDate(recurrence_end),
      completed_at: finalStatus === 'done' ? now : null,
      created_at: now,
      updated_at: now,
    });

    await insertSubtasks(trx, newId, subtasks, now);
    await replaceTaskTags(trx, newId, tagIds);
    return newId;
  });

  const createdTask = await getTaskDetail(db, id);
  triggerWebhook('task.created', createdTask);
  broadcastEvent('task.created', { taskId: id });

  res.status(201).json(createdTask);
}));

// POST /api/tasks/batch - Batch operations
router.post('/batch', asyncHandler(async (req, res) => {
  const errors = validateBatchInput(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const db = getDb();
  const { action, value } = req.body;
  const ids = [...new Set(req.body.ids.map(Number))];
  const now = new Date().toISOString();

  const result = await db.transaction(async (trx) => {
    const tasks = await trx('tasks').whereIn('id', ids);
    if (tasks.length === 0) {
      throw new HttpError(404, 'No matching tasks found');
    }
    const validIds = tasks.map((t) => t.id);
    const notFound = ids.filter((id) => !validIds.includes(id));
    const spawned = [];
    let affected = 0;

    if (action === 'update_status') {
      for (const task of tasks) {
        if (task.status === value) continue;
        await trx('tasks').where('id', task.id).update({
          status: value,
          updated_at: now,
          ...completionFields(task.status, value, now),
        });
        affected += 1;
        if (value === 'done') {
          const next = await spawnNextOccurrence(trx, task, now);
          if (next) spawned.push(next);
        }
      }
    } else if (action === 'update_priority') {
      affected = await trx('tasks').whereIn('id', validIds).update({ priority: value, updated_at: now });
    } else if (action === 'delete') {
      affected = await trx('tasks').whereIn('id', validIds).del();
    }

    return { tasks, notFound, spawned, affected };
  });

  // 事务提交后再推送 Webhook
  if (action === 'delete') {
    result.tasks.forEach((t) => triggerWebhook('task.deleted', t));
  } else if (action === 'update_status') {
    result.tasks
      .filter((t) => t.status !== value)
      .forEach((t) => {
        const updated = { ...t, status: value };
        triggerWebhook('task.updated', updated);
        if (value === 'done') triggerWebhook('task.completed', updated);
      });
    for (const next of result.spawned) {
      triggerWebhook('task.created', await getTaskWithTags(db, next.id));
    }
  } else {
    result.tasks.forEach((t) => triggerWebhook('task.updated', { ...t, priority: value }));
  }
  broadcastEvent('task.batch', { action, affected: result.affected });

  res.json({
    message: `Batch ${action} completed`,
    affected: result.affected,
    not_found: result.notFound,
    next_occurrences: result.spawned,
  });
}));

// GET /api/tasks/:id - Get a single task with tags, subtasks and notes
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const task = await getTaskDetail(getDb(), id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
}));

// PUT /api/tasks/:id - Update a task (partial update)
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const errors = validateTaskInput(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  const db = getDb();
  const now = new Date().toISOString();

  const outcome = await db.transaction(async (trx) => {
    const task = await trx('tasks').where({ id }).first();
    if (!task) return null;

    const updates = {};
    const body = req.body;
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description || '';
    if (body.status !== undefined) updates.status = body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.due_date !== undefined) updates.due_date = normalizeDate(body.due_date);
    if (body.recurrence !== undefined) updates.recurrence = body.recurrence;
    if (body.recurrence_end !== undefined) updates.recurrence_end = normalizeDate(body.recurrence_end);
    Object.assign(updates, completionFields(task.status, body.status, now));
    updates.updated_at = now;

    if (body.tags !== undefined) {
      const tagIds = await resolveTagIds(trx, body.tags);
      await replaceTaskTags(trx, id, tagIds);
    }

    await trx('tasks').where('id', id).update(updates);

    const becameDone = body.status === 'done' && task.status !== 'done';
    let next = null;
    if (becameDone) {
      // 以更新后的字段为准（例如同时修改了重复规则或截止日期）
      next = await spawnNextOccurrence(trx, { ...task, ...updates, id }, now);
    }
    return { becameDone, next };
  });

  if (!outcome) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const updatedTask = await getTaskDetail(db, id);
  triggerWebhook('task.updated', updatedTask);
  if (outcome.becameDone) triggerWebhook('task.completed', updatedTask);

  const response = { ...updatedTask };
  if (outcome.next) {
    response.next_occurrence = outcome.next;
    triggerWebhook('task.created', await getTaskWithTags(db, outcome.next.id));
  }
  broadcastEvent('task.updated', { taskId: id });

  res.json(response);
}));

// DELETE /api/tasks/:id - Delete a task (subtasks / notes / tag links cascade)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const db = getDb();
  const task = await getTaskWithTags(db, id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  await db('tasks').where('id', id).del();
  triggerWebhook('task.deleted', task);
  broadcastEvent('task.deleted', { taskId: id });
  res.json({ message: 'Task deleted successfully' });
}));

module.exports = router;
