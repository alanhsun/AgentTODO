const { normalizeDate } = require('../utils/date');

const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_RECURRENCES = ['none', 'daily', 'weekly', 'monthly'];
const VALID_BATCH_ACTIONS = ['update_status', 'update_priority', 'delete'];

const MAX_TITLE_LENGTH = 255;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveIntegerLike(value) {
  const n = Number(value);
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isInteger(n) && n > 0;
}

function subtaskTitle(item) {
  if (typeof item === 'string') return item;
  if (isPlainObject(item) && typeof item.title === 'string') return item.title;
  return null;
}

function validateTaskInput(data, isUpdate = false) {
  const errors = [];

  if (!isPlainObject(data)) {
    return ['Request body must be a JSON object'];
  }

  if (data.title !== undefined || !isUpdate) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      errors.push('Title is required and must be a non-empty string');
    } else if (data.title.trim().length > MAX_TITLE_LENGTH) {
      errors.push(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
    }
  }

  if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') {
    errors.push('description must be a string');
  }

  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
    errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (data.due_date !== undefined && normalizeDate(data.due_date) === undefined) {
    errors.push('due_date must be a valid date in YYYY-MM-DD format');
  }

  if (data.recurrence !== undefined && !VALID_RECURRENCES.includes(data.recurrence)) {
    errors.push(`recurrence must be one of: ${VALID_RECURRENCES.join(', ')}`);
  }

  if (data.recurrence_end !== undefined && normalizeDate(data.recurrence_end) === undefined) {
    errors.push('recurrence_end must be a valid date in YYYY-MM-DD format');
  }

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags) || !data.tags.every(isPositiveIntegerLike)) {
      errors.push('tags must be an array of tag IDs (positive integers)');
    }
  }

  if (data.subtasks !== undefined && data.subtasks !== null) {
    if (!Array.isArray(data.subtasks)) {
      errors.push('subtasks must be an array of strings or { title } objects');
    } else {
      const bad = data.subtasks.some((s) => {
        const t = subtaskTitle(s);
        return t === null || t.trim().length === 0 || t.trim().length > MAX_TITLE_LENGTH;
      });
      if (bad) {
        errors.push(`each subtask must be a non-empty string (max ${MAX_TITLE_LENGTH} chars) or { title } object`);
      }
    }
  }

  return errors;
}

function validateBatchInput(data) {
  const errors = [];

  if (!isPlainObject(data)) {
    return ['Request body must be a JSON object'];
  }

  if (!data.action || !VALID_BATCH_ACTIONS.includes(data.action)) {
    errors.push(`action must be one of: ${VALID_BATCH_ACTIONS.join(', ')}`);
  }

  if (!Array.isArray(data.ids) || data.ids.length === 0 || !data.ids.every(isPositiveIntegerLike)) {
    errors.push('ids must be a non-empty array of task IDs');
  }

  if (data.action === 'update_status' && (!data.value || !VALID_STATUSES.includes(data.value))) {
    errors.push(`value must be one of: ${VALID_STATUSES.join(', ')} for update_status`);
  }

  if (data.action === 'update_priority' && (!data.value || !VALID_PRIORITIES.includes(data.value))) {
    errors.push(`value must be one of: ${VALID_PRIORITIES.join(', ')} for update_priority`);
  }

  return errors;
}

module.exports = {
  validateTaskInput,
  validateBatchInput,
  subtaskTitle,
  isPositiveIntegerLike,
  VALID_STATUSES,
  VALID_PRIORITIES,
  VALID_RECURRENCES,
  MAX_TITLE_LENGTH,
};
