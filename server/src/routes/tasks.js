const express = require('express');
const { getDb } = require('../db');
const { validateTaskInput, validateBatchInput } = require('../validators/task');
const { triggerWebhook } = require('../services/webhookService');

const router = express.Router();

// GET /api/tasks/summary - AI-friendly task overview
router.get('/summary', async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const [total] = await db('tasks').count('* as count');
    const [todo] = await db('tasks').where({ status: 'todo' }).count('* as count');
    const [inProgress] = await db('tasks').where({ status: 'in_progress' }).count('* as count');
    const [done] = await db('tasks').where({ status: 'done' }).count('* as count');
    const [overdue] = await db('tasks')
      .where('status', '!=', 'done')
      .whereNotNull('due_date')
      .where('due_date', '<', today)
      .count('* as count');
    const [dueToday] = await db('tasks')
      .where('status', '!=', 'done')
      .where('due_date', today)
      .count('* as count');
    const [urgent] = await db('tasks').where({ priority: 'urgent' })
      .where('status', '!=', 'done').count('* as count');
    const [high] = await db('tasks').where({ priority: 'high' })
      .where('status', '!=', 'done').count('* as count');

    res.json({
      total: total.count,
      by_status: { todo: todo.count, in_progress: inProgress.count, done: done.count },
      overdue: overdue.count,
      due_today: dueToday.count,
      by_priority: { urgent: urgent.count, high: high.count },
      date: today,
    });
  } catch (err) {
    console.error('GET /tasks/summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/today - Today's agenda
router.get('/today', async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const tasks = await db('tasks')
      .where('status', '!=', 'done')
      .where(function () {
        this.where('due_date', today)
          .orWhere('due_date', '<', today);
      })
      .whereNotNull('due_date')
      .orderBy('priority', 'desc')
      .orderBy('due_date', 'asc');

    const taskIds = tasks.map(t => t.id);
    const subtaskStats = taskIds.length > 0
      ? await db('subtasks').whereIn('task_id', taskIds)
          .select('task_id')
          .count('* as total')
          .sum({ completed: db.raw("CASE WHEN completed = 1 THEN 1 ELSE 0 END") })
          .groupBy('task_id')
      : [];
    const statsMap = {};
    subtaskStats.forEach(s => { statsMap[s.task_id] = { total: s.total, completed: s.completed || 0 }; });

    const result = tasks.map(t => ({
      ...t,
      subtask_progress: statsMap[t.id] || null,
    }));

    res.json({ date: today, tasks: result });
  } catch (err) {
    console.error('GET /tasks/today error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/overdue - Overdue tasks
router.get('/overdue', async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const tasks = await db('tasks')
      .where('status', '!=', 'done')
      .whereNotNull('due_date')
      .where('due_date', '<', today)
      .orderBy('due_date', 'asc');

    res.json({ date: today, tasks });
  } catch (err) {
    console.error('GET /tasks/overdue error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks - List tasks with filtering, search, pagination
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const {
      status, priority, tag, search,
      due_before, due_after,
      sort = 'created_at', order = 'desc',
      page = 1, limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let query = db('tasks');
    let countQuery = db('tasks');

    if (status) {
      const statuses = status.split(',');
      query = query.whereIn('tasks.status', statuses);
      countQuery = countQuery.whereIn('tasks.status', statuses);
    }
    if (priority) {
      const priorities = priority.split(',');
      query = query.whereIn('tasks.priority', priorities);
      countQuery = countQuery.whereIn('tasks.priority', priorities);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      query = query.where(function () {
        this.where('tasks.title', 'like', searchTerm)
          .orWhere('tasks.description', 'like', searchTerm);
      });
      countQuery = countQuery.where(function () {
        this.where('tasks.title', 'like', searchTerm)
          .orWhere('tasks.description', 'like', searchTerm);
      });
    }
    if (due_before) {
      query = query.where('tasks.due_date', '<=', due_before);
      countQuery = countQuery.where('tasks.due_date', '<=', due_before);
    }
    if (due_after) {
      query = query.where('tasks.due_date', '>=', due_after);
      countQuery = countQuery.where('tasks.due_date', '>=', due_after);
    }
    if (tag) {
      const tagIds = tag.split(',').map(Number);
      query = query
        .join('task_tags', 'tasks.id', 'task_tags.task_id')
        .whereIn('task_tags.tag_id', tagIds)
        .groupBy('tasks.id');
      countQuery = countQuery
        .join('task_tags', 'tasks.id', 'task_tags.task_id')
        .whereIn('task_tags.tag_id', tagIds)
        .groupBy('tasks.id');
    }

    const allowedSorts = ['created_at', 'updated_at', 'due_date', 'priority', 'title', 'status'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';

    const [totalResult] = await countQuery.count('* as count');
    const total = tag ? (await countQuery).length : totalResult.count;

    const tasks = await query
      .select('tasks.*')
      .orderBy(`tasks.${sortCol}`, sortOrder)
      .limit(limitNum)
      .offset(offset);

    // Fetch tags for each task
    const taskIds = tasks.map((t) => t.id);
    const taskTags = taskIds.length > 0
      ? await db('task_tags')
          .join('tags', 'task_tags.tag_id', 'tags.id')
          .whereIn('task_tags.task_id', taskIds)
          .select('task_tags.task_id', 'tags.id', 'tags.name', 'tags.color')
      : [];

    const tagMap = {};
    taskTags.forEach((tt) => {
      if (!tagMap[tt.task_id]) tagMap[tt.task_id] = [];
      tagMap[tt.task_id].push({ id: tt.id, name: tt.name, color: tt.color });
    });

    const result = tasks.map((t) => ({
      ...t,
      tags: tagMap[t.id] || [],
    }));

    res.json({
      data: result,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: typeof total === 'number' ? total : parseInt(total, 10),
        totalPages: Math.ceil((typeof total === 'number' ? total : parseInt(total, 10)) / limitNum),
      },
    });
  } catch (err) {
    console.error('GET /tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks - Create a task
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const errors = validateTaskInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const { title, description, status, priority, due_date, recurrence, recurrence_end, tags, subtasks } = req.body;
    const now = new Date().toISOString();

    const [id] = await db('tasks').insert({
      title: title.trim(),
      description: description || '',
      status: status || 'todo',
      priority: priority || 'medium',
      due_date: due_date || null,
      recurrence: recurrence || 'none',
      recurrence_end: recurrence_end || null,
      created_at: now,
      updated_at: now,
    });

    // Create subtasks if provided
    if (subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
      const subtaskRows = subtasks.map((s, i) => ({
        task_id: id,
        title: typeof s === 'string' ? s : s.title,
        completed: false,
        sort_order: i,
        created_at: now,
      }));
      await db('subtasks').insert(subtaskRows);
    }

    // Assign tags
    if (tags && tags.length > 0) {
      const tagRows = tags.map((tagId) => ({ task_id: id, tag_id: tagId }));
      await db('task_tags').insert(tagRows);
    }

    const task = await db('tasks').where('id', id).first();
    const taskTagsResult = await db('task_tags')
      .join('tags', 'task_tags.tag_id', 'tags.id')
      .where('task_tags.task_id', id)
      .select('tags.id', 'tags.name', 'tags.color');

    const createdTask = { ...task, tags: taskTagsResult };
    triggerWebhook('task.created', createdTask);
    
    res.status(201).json(createdTask);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id - Get a single task
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const task = await db('tasks').where({ id: req.params.id }).first();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const tags = await db('task_tags')
      .join('tags', 'task_tags.tag_id', 'tags.id')
      .where('task_tags.task_id', task.id)
      .select('tags.id', 'tags.name', 'tags.color');

    res.json({ ...task, tags });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id - Update a task
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const errors = validateTaskInput(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const task = await db('tasks').where({ id: req.params.id }).first();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates = {};
    const allowedFields = ['title', 'description', 'status', 'priority', 'due_date', 'recurrence', 'recurrence_end'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'title' ? req.body[field].trim() : req.body[field];
      }
    });
    updates.updated_at = new Date().toISOString();

    await db('tasks').where('id', req.params.id).update(updates);

    // Update tags if provided
    if (req.body.tags !== undefined) {
      await db('task_tags').where('task_id', req.params.id).del();
      if (req.body.tags.length > 0) {
        const tagRows = req.body.tags.map((tagId) => ({ task_id: parseInt(req.params.id), tag_id: tagId }));
        await db('task_tags').insert(tagRows);
      }
    }

    const updated = await db('tasks').where('id', req.params.id).first();
    const tags = await db('task_tags')
      .join('tags', 'task_tags.tag_id', 'tags.id')
      .where('task_tags.task_id', req.params.id)
      .select('tags.id', 'tags.name', 'tags.color');

    const finalUpdatedTask = { ...updated, tags };
    triggerWebhook('task.updated', finalUpdatedTask);

    res.json(finalUpdatedTask);
  } catch (err) {
    console.error('PUT /tasks/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id - Delete a task
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const task = await db('tasks').where({ id: req.params.id }).first();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db('tasks').where('id', req.params.id).del();
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/batch - Batch operations
router.post('/batch', async (req, res) => {
  try {
    const db = getDb();
    const errors = validateBatchInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const { action, ids, value } = req.body;
    const tasks = await db('tasks').whereIn('id', ids);
    const validIds = tasks.map((t) => t.id);

    if (validIds.length === 0) {
      return res.status(404).json({ error: 'No matching tasks found' });
    }

    let affected = 0;

    if (action === 'update_status') {
      affected = await db('tasks')
        .whereIn('id', validIds)
        .update({ status: value, updated_at: new Date().toISOString() });
    } else if (action === 'update_priority') {
      affected = await db('tasks')
        .whereIn('id', validIds)
        .update({ priority: value, updated_at: new Date().toISOString() });
    } else if (action === 'delete') {
      affected = await db('tasks').whereIn('id', validIds).del();
    }

    res.json({ message: `Batch ${action} completed`, affected });
  } catch (err) {
    console.error('POST /tasks/batch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
