/**
 * 任务领域服务：封装多个路由共享的查询与业务规则
 */
const { HttpError } = require('../utils/http');
const { nextOccurrenceDate } = require('../utils/date');
const { isPositiveIntegerLike, subtaskTitle } = require('../validators/task');

// 优先级按业务含义排序，而不是按字母序（字母序会得到 high < low < medium < urgent）
const PRIORITY_RANK_SQL =
  "CASE tasks.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END";

function serializeSubtask(s) {
  return { ...s, completed: Boolean(s.completed) };
}

/** 批量附加标签（单次查询，避免 N+1） */
async function attachTags(db, tasks) {
  if (tasks.length === 0) return tasks;
  const rows = await db('task_tags')
    .join('tags', 'task_tags.tag_id', 'tags.id')
    .whereIn('task_tags.task_id', tasks.map((t) => t.id))
    .select('task_tags.task_id', 'tags.id', 'tags.name', 'tags.color')
    .orderBy('tags.name');
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.task_id)) map.set(r.task_id, []);
    map.get(r.task_id).push({ id: r.id, name: r.name, color: r.color });
  });
  return tasks.map((t) => ({ ...t, tags: map.get(t.id) || [] }));
}

/** 批量附加子任务进度 { total, completed }，没有子任务时为 null */
async function attachSubtaskProgress(db, tasks) {
  if (tasks.length === 0) return tasks;
  const rows = await db('subtasks')
    .whereIn('task_id', tasks.map((t) => t.id))
    .select('task_id')
    .count('* as total')
    .sum({ completed: db.raw('CASE WHEN completed = 1 THEN 1 ELSE 0 END') })
    .groupBy('task_id');
  const map = new Map();
  rows.forEach((r) => map.set(r.task_id, { total: Number(r.total), completed: Number(r.completed) || 0 }));
  return tasks.map((t) => ({ ...t, subtask_progress: map.get(t.id) || null }));
}

/** 批量附加完整子任务列表及进度 { total, completed }（供 AI 勾选或前端卡片内直接展开勾选） */
async function attachSubtasks(db, tasks) {
  if (tasks.length === 0) return tasks;
  const rows = await db('subtasks')
    .whereIn('task_id', tasks.map((t) => t.id))
    .orderBy(['task_id', 'sort_order', 'id']);
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.task_id)) map.set(r.task_id, []);
    map.get(r.task_id).push(serializeSubtask(r));
  });
  return tasks.map((t) => {
    const subtasks = map.get(t.id) || [];
    return {
      ...t,
      subtasks,
      subtask_progress: subtasks.length > 0
        ? { total: subtasks.length, completed: subtasks.filter((s) => s.completed).length }
        : null,
    };
  });
}

/** 获取单个任务（含标签），不存在返回 null */
async function getTaskWithTags(db, id) {
  const task = await db('tasks').where({ id }).first();
  if (!task) return null;
  const [withTags] = await attachTags(db, [task]);
  return withTags;
}

/** 获取任务完整详情：标签 + 子任务 + 进度 + 笔记 */
async function getTaskDetail(db, id) {
  const task = await getTaskWithTags(db, id);
  if (!task) return null;
  const [withSubtasks] = await attachSubtasks(db, [task]);
  const subtasks = withSubtasks.subtasks;
  const notes = await db('task_notes').where('task_id', id).orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }]);
  return {
    ...withSubtasks,
    subtask_progress: subtasks.length > 0
      ? { total: subtasks.length, completed: subtasks.filter((s) => s.completed).length }
      : null,
    notes,
  };
}

/**
 * 规范化并校验标签 ID 列表：去重、转为整数，并确认全部存在。
 * 不存在的 ID 返回 400（而不是被外键约束拒绝后变成 500）。
 */
async function resolveTagIds(db, rawIds) {
  if (!Array.isArray(rawIds)) return [];
  const ids = [...new Set(rawIds.filter(isPositiveIntegerLike).map(Number))];
  if (ids.length === 0) return [];
  const existing = await db('tags').whereIn('id', ids).pluck('id');
  const missing = ids.filter((id) => !existing.includes(id));
  if (missing.length > 0) {
    throw new HttpError(400, `Unknown tag id(s): ${missing.join(', ')}`);
  }
  return ids;
}

async function replaceTaskTags(trx, taskId, tagIds) {
  await trx('task_tags').where('task_id', taskId).del();
  if (tagIds.length > 0) {
    await trx('task_tags').insert(tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId })));
  }
}

async function insertSubtasks(trx, taskId, items, now) {
  if (!Array.isArray(items) || items.length === 0) return;
  const rows = items.map((s, i) => ({
    task_id: taskId,
    title: subtaskTitle(s).trim(),
    completed: false,
    sort_order: i + 1,
    created_at: now,
  }));
  await trx('subtasks').insert(rows);
}

/** 根据状态变化计算 completed_at 字段 */
function completionFields(prevStatus, nextStatus, now) {
  if (nextStatus === undefined || nextStatus === prevStatus) return {};
  return { completed_at: nextStatus === 'done' ? now : null };
}

/**
 * 周期任务完成时，自动生成下一次实例：
 * - 复制标题、描述、优先级、重复规则、标签；子任务重置为未完成
 * - 下一次到期日严格晚于今天；超过 recurrence_end 则不再生成
 * - 已完成的旧实例不再保留重复规则，避免反复勾选导致重复生成
 *
 * @returns {Promise<{id:number, due_date:string}|null>}
 */
async function spawnNextOccurrence(trx, task, now) {
  if (!task.recurrence || task.recurrence === 'none') return null;

  const nextDue = nextOccurrenceDate(task.due_date, task.recurrence);
  if (!nextDue) return null;

  await trx('tasks').where('id', task.id).update({ recurrence: 'none', recurrence_end: null });

  if (task.recurrence_end && nextDue > task.recurrence_end) return null;

  const [newId] = await trx('tasks').insert({
    title: task.title,
    description: task.description || '',
    status: 'todo',
    priority: task.priority,
    due_date: nextDue,
    recurrence: task.recurrence,
    recurrence_end: task.recurrence_end || null,
    created_at: now,
    updated_at: now,
  });

  const tagIds = await trx('task_tags').where('task_id', task.id).pluck('tag_id');
  if (tagIds.length > 0) {
    await trx('task_tags').insert(tagIds.map((tagId) => ({ task_id: newId, tag_id: tagId })));
  }

  const subtasks = await trx('subtasks').where('task_id', task.id).orderBy(['sort_order', 'id']);
  if (subtasks.length > 0) {
    await trx('subtasks').insert(subtasks.map((s, i) => ({
      task_id: newId,
      title: s.title,
      completed: false,
      sort_order: i + 1,
      created_at: now,
    })));
  }

  return { id: newId, due_date: nextDue };
}

module.exports = {
  PRIORITY_RANK_SQL,
  serializeSubtask,
  attachTags,
  attachSubtaskProgress,
  attachSubtasks,
  getTaskWithTags,
  getTaskDetail,
  resolveTagIds,
  replaceTaskTags,
  insertSubtasks,
  completionFields,
  spawnNextOccurrence,
};
