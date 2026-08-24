const express = require('express');
const { getDb } = require('../db');
const { validateTaskInput, validateBatchInput } = require('../validators/task');
const { triggerWebhook } = require('../services/webhookService');
const config = require('../config');
const { dateInTimeZone } = require('../utils/date');
const { removeAttachmentFiles, serializeAttachment } = require('../utils/attachmentStorage');
const { parseDateOnly, taskOccursOnDate, taskIsOverdueOnDate } = require('../utils/recurrence');

const router = express.Router();
const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

async function getTaskContext(db, taskId) {
  const task = await db('tasks').where({ id: taskId }).first();
  if (!task) return null;

  const [tags, subtasks, notes, attachments, recentOccurrences] = await Promise.all([
    db('task_tags')
      .join('tags', 'task_tags.tag_id', 'tags.id')
      .where('task_tags.task_id', task.id)
      .select('tags.id', 'tags.name', 'tags.color'),
    db('subtasks').where({ task_id: task.id }).orderBy('sort_order', 'asc'),
    db('task_notes').where({ task_id: task.id }).orderBy('created_at', 'desc').limit(50),
    db('task_attachments').where({ task_id: task.id }).orderBy('created_at', 'desc'),
    db('task_occurrences').where({ task_id: task.id }).orderBy('occurrence_date', 'desc').limit(31),
  ]);

  return {
    ...task,
    tags,
    subtasks,
    notes,
    attachments: attachments.map(serializeAttachment),
    recent_occurrences: recentOccurrences,
  };
}

// GET /api/tasks/summary - AI-friendly task overview
router.get('/summary', async (req, res) => {
  try {
    const db = getDb();
    const today = dateInTimeZone(new Date(), config.appTimezone);

    const tasks = await db('tasks');
    const activeTasks = tasks.filter((task) => task.status !== 'done');
    const counts = tasks.reduce((result, task) => {
      result.byStatus[task.status] += 1;
      if (task.status !== 'done' && (task.priority === 'urgent' || task.priority === 'high')) {
        result.byPriority[task.priority] += 1;
      }
      return result;
    }, {
      byStatus: { todo: 0, in_progress: 0, done: 0 },
      byPriority: { urgent: 0, high: 0 },
    });
    const dueTodayTasks = activeTasks.filter((task) => taskOccursOnDate(task, today, config.appTimezone));
    const dueTodayIds = dueTodayTasks.map((task) => task.id);
    const completedTodayRows = dueTodayIds.length > 0
      ? await db('task_occurrences').whereIn('task_id', dueTodayIds).where({ occurrence_date: today })
      : [];
    const completedTodayIds = new Set(completedTodayRows.map((row) => Number(row.task_id)));
    const overdueCount = activeTasks.filter((task) => taskIsOverdueOnDate(task, today)).length;
    res.json({
      total: tasks.length,
      by_status: counts.byStatus,
      overdue: overdueCount,
      due_today: dueTodayTasks.filter((task) => !completedTodayIds.has(Number(task.id))).length,
      completed_today: completedTodayIds.size,
      by_priority: counts.byPriority,
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
    const today = dateInTimeZone(new Date(), config.appTimezone);

    const activeTasks = await db('tasks').where('status', '!=', 'done');
    const tasks = activeTasks
      .filter((task) => taskOccursOnDate(task, today, config.appTimezone) || taskIsOverdueOnDate(task, today))
      .sort((left, right) => {
        const priorityDifference = PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority];
        if (priorityDifference !== 0) return priorityDifference;
        return String(left.due_date || '').localeCompare(String(right.due_date || ''));
      });

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

    const completedRows = taskIds.length > 0
      ? await db('task_occurrences').whereIn('task_id', taskIds).where({ occurrence_date: today })
      : [];
    const completedIds = new Set(completedRows.map((row) => Number(row.task_id)));

    const result = tasks.map((task) => {
      const occursToday = taskOccursOnDate(task, today, config.appTimezone);
      return {
        ...task,
        subtask_progress: statsMap[task.id] || null,
        agenda_type: occursToday ? 'today' : 'overdue',
        occurrence_date: occursToday ? today : null,
        occurrence_completed: completedIds.has(Number(task.id)),
      };
    });

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
    const today = dateInTimeZone(new Date(), config.appTimezone);

    const activeTasks = await db('tasks').where('status', '!=', 'done');
    const tasks = activeTasks
      .filter((task) => taskIsOverdueOnDate(task, today))
      .sort((left, right) => String(left.due_date || '').localeCompare(String(right.due_date || '')));

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

    query = query.select('tasks.*');
    if (sortCol === 'priority') {
      query = query.orderByRaw(
        `CASE tasks.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END ${sortOrder.toUpperCase()}`
      );
    } else {
      query = query.orderBy(`tasks.${sortCol}`, sortOrder);
    }

    const tasks = await query.limit(limitNum).offset(offset);

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

    const subtaskStats = taskIds.length > 0
      ? await db('subtasks')
          .whereIn('task_id', taskIds)
          .select('task_id')
          .count('* as total')
          .sum({ completed: db.raw('CASE WHEN completed = 1 THEN 1 ELSE 0 END') })
          .groupBy('task_id')
      : [];
    const subtaskStatsMap = {};
    subtaskStats.forEach((stats) => {
      subtaskStatsMap[stats.task_id] = {
        total: Number(stats.total),
        completed: Number(stats.completed || 0),
      };
    });

    const attachmentStats = taskIds.length > 0
      ? await db('task_attachments')
          .whereIn('task_id', taskIds)
          .select('task_id')
          .count('* as total')
          .groupBy('task_id')
      : [];
    const attachmentCountMap = {};
    attachmentStats.forEach((stats) => {
      attachmentCountMap[stats.task_id] = Number(stats.total);
    });

    const result = tasks.map((t) => ({
      ...t,
      tags: tagMap[t.id] || [],
      subtask_progress: subtaskStatsMap[t.id] || null,
      attachment_count: attachmentCountMap[t.id] || 0,
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

    if (tags?.length > 0) {
      const existingTags = await db('tags').whereIn('id', tags).select('id');
      if (existingTags.length !== new Set(tags).size) {
        return res.status(400).json({ error: 'One or more tag IDs do not exist' });
      }
    }

    const createdTask = await db.transaction(async (trx) => {
      const [id] = await trx('tasks').insert({
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

      if (subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
        const subtaskRows = subtasks.map((s, i) => ({
          task_id: id,
          title: typeof s === 'string' ? s : s.title,
          completed: false,
          sort_order: i,
          created_at: now,
        }));
        await trx('subtasks').insert(subtaskRows);
      }

      if (tags && tags.length > 0) {
        const tagRows = tags.map((tagId) => ({ task_id: id, tag_id: tagId }));
        await trx('task_tags').insert(tagRows);
      }

      const task = await trx('tasks').where('id', id).first();
      const taskTagsResult = await trx('task_tags')
        .join('tags', 'task_tags.tag_id', 'tags.id')
        .where('task_tags.task_id', id)
        .select('tags.id', 'tags.name', 'tags.color');

      return { ...task, tags: taskTagsResult };
    });
    triggerWebhook('task.created', createdTask);
    
    res.status(201).json(createdTask);
  } catch (err) {
    console.error('POST /tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id/context - Compact task context for AI tools
router.get('/:id/context', async (req, res) => {
  try {
    const context = await getTaskContext(getDb(), req.params.id);
    if (!context) return res.status(404).json({ error: 'Task not found' });
    return res.json(context);
  } catch (err) {
    console.error('GET /tasks/:id/context error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks/:id/progress - Atomically record AI/user progress
router.post('/:id/progress', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const {
      note_content: noteContent,
      complete_subtasks: completeSubtasks,
      task_status: taskStatus,
      occurrence_date: occurrenceDate,
      occurrence_completed: occurrenceCompleted,
      source = 'ai',
      request_id: requestId,
    } = body;
    const errors = [];

    if (noteContent !== undefined
      && (typeof noteContent !== 'string' || !noteContent.trim() || noteContent.length > 10000)) {
      errors.push('note_content must be a non-empty string of 10000 characters or less');
    }
    if (completeSubtasks !== undefined && (
      !Array.isArray(completeSubtasks)
      || completeSubtasks.some((id) => !Number.isInteger(id) || id <= 0)
      || new Set(completeSubtasks).size !== completeSubtasks.length
    )) errors.push('complete_subtasks must contain unique positive integer IDs');
    if (taskStatus !== undefined && !['todo', 'in_progress', 'done'].includes(taskStatus)) {
      errors.push('task_status must be one of: todo, in_progress, done');
    }
    if ((occurrenceDate === undefined) !== (occurrenceCompleted === undefined)) {
      errors.push('occurrence_date and occurrence_completed must be provided together');
    } else if (occurrenceDate !== undefined && (!parseDateOnly(occurrenceDate) || typeof occurrenceCompleted !== 'boolean')) {
      errors.push('occurrence_date must be YYYY-MM-DD and occurrence_completed must be boolean');
    }
    if (!['user', 'ai'].includes(source)) errors.push('source must be user or ai');
    if (requestId !== undefined && (
      typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100
    )) errors.push('request_id must be a non-empty string of 100 characters or less');
    if (
      noteContent === undefined
      && completeSubtasks === undefined
      && taskStatus === undefined
      && occurrenceDate === undefined
    ) errors.push('At least one progress change is required');
    if (errors.length > 0) return res.status(400).json({ errors });

    const db = getDb();
    const taskId = Number(req.params.id);
    const now = new Date().toISOString();
    const normalizedRequestId = requestId?.trim();
    const outcome = await db.transaction(async (trx) => {
      const task = await trx('tasks').where({ id: taskId }).first();
      if (!task) return { notFound: true };

      if (normalizedRequestId) {
        const existingRequest = await trx('agent_requests').where({ request_id: normalizedRequestId }).first();
        if (existingRequest) {
          return Number(existingRequest.task_id) === taskId
            ? { duplicate: true }
            : { requestConflict: true };
        }
      }

      if (completeSubtasks?.length > 0) {
        const matchingSubtasks = await trx('subtasks')
          .where({ task_id: taskId })
          .whereIn('id', completeSubtasks)
          .select('id');
        if (matchingSubtasks.length !== completeSubtasks.length) return { invalidSubtasks: true };
      }

      if (occurrenceDate && !taskOccursOnDate(task, occurrenceDate, config.appTimezone)) {
        return { invalidOccurrence: true };
      }

      if (noteContent !== undefined) {
        await trx('task_notes').insert({
          task_id: taskId,
          content: noteContent.trim(),
          source,
          created_at: now,
        });
      }
      if (completeSubtasks?.length > 0) {
        await trx('subtasks')
          .where({ task_id: taskId })
          .whereIn('id', completeSubtasks)
          .update({ completed: 1 });
      }
      if (taskStatus !== undefined) {
        await trx('tasks').where({ id: taskId }).update({ status: taskStatus, updated_at: now });
      } else {
        await trx('tasks').where({ id: taskId }).update({ updated_at: now });
      }
      if (occurrenceDate !== undefined) {
        if (occurrenceCompleted) {
          await trx('task_occurrences').insert({
            task_id: taskId,
            occurrence_date: occurrenceDate,
            completed_at: now,
            source,
          }).onConflict(['task_id', 'occurrence_date']).merge({ completed_at: now, source });
        } else {
          await trx('task_occurrences').where({ task_id: taskId, occurrence_date: occurrenceDate }).del();
        }
      }
      if (normalizedRequestId) {
        await trx('agent_requests').insert({
          request_id: normalizedRequestId,
          task_id: taskId,
          action: 'task.progress',
          created_at: now,
        });
      }
      return { duplicate: false };
    });

    if (outcome.notFound) return res.status(404).json({ error: 'Task not found' });
    if (outcome.requestConflict) return res.status(409).json({ error: 'request_id was already used for another task' });
    if (outcome.invalidSubtasks) return res.status(400).json({ error: 'One or more subtask IDs do not belong to this task' });
    if (outcome.invalidOccurrence) return res.status(400).json({ error: 'The task does not occur on occurrence_date' });

    const context = await getTaskContext(db, taskId);
    if (!outcome.duplicate) triggerWebhook('task.updated', context);

    const retentionCutoff = new Date(Date.now() - (30 * 86400000)).toISOString();
    db('agent_requests').where('created_at', '<', retentionCutoff).del()
      .catch((error) => console.warn('Agent request cleanup failed:', error.message));

    return res.json({ ok: true, duplicate: outcome.duplicate, task: context });
  } catch (err) {
    console.error('POST /tasks/:id/progress error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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

    if (req.body.tags?.length > 0) {
      const existingTags = await db('tags').whereIn('id', req.body.tags).select('id');
      if (existingTags.length !== new Set(req.body.tags).size) {
        return res.status(400).json({ error: 'One or more tag IDs do not exist' });
      }
    }

    const updates = {};
    const allowedFields = ['title', 'description', 'status', 'priority', 'due_date', 'recurrence', 'recurrence_end'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'title' ? req.body[field].trim() : req.body[field];
      }
    });
    updates.updated_at = new Date().toISOString();

    const finalUpdatedTask = await db.transaction(async (trx) => {
      await trx('tasks').where('id', req.params.id).update(updates);

      if (req.body.tags !== undefined) {
        await trx('task_tags').where('task_id', req.params.id).del();
        if (req.body.tags.length > 0) {
          const tagRows = req.body.tags.map((tagId) => ({ task_id: parseInt(req.params.id, 10), tag_id: tagId }));
          await trx('task_tags').insert(tagRows);
        }
      }

      const updated = await trx('tasks').where('id', req.params.id).first();
      const updatedTags = await trx('task_tags')
        .join('tags', 'task_tags.tag_id', 'tags.id')
        .where('task_tags.task_id', req.params.id)
        .select('tags.id', 'tags.name', 'tags.color');

      return { ...updated, tags: updatedTags };
    });
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

    const attachments = await db('task_attachments')
      .where({ task_id: req.params.id })
      .select('stored_name');
    await db('tasks').where('id', req.params.id).del();
    await removeAttachmentFiles(attachments.map((attachment) => attachment.stored_name));
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
      const attachments = await db('task_attachments')
        .whereIn('task_id', validIds)
        .select('stored_name');
      affected = await db('tasks').whereIn('id', validIds).del();
      await removeAttachmentFiles(attachments.map((attachment) => attachment.stored_name));
    }

    res.json({ message: `Batch ${action} completed`, affected });
  } catch (err) {
    console.error('POST /tasks/batch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
