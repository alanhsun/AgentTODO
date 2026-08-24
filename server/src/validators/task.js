const { parseDateOnly } = require('../utils/recurrence');

const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const VALID_RECURRENCES = ['none', 'daily', 'weekdays', 'weekly', 'monthly'];

function validateTaskInput(data, isUpdate = false) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['Request body must be a JSON object'];
  }

  if (!isUpdate && (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0)) {
    errors.push('Title is required and must be a non-empty string');
  }
  if (data.title !== undefined) {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      if (isUpdate) errors.push('Title must be a non-empty string');
    } else if (data.title.length > 255) {
      errors.push('Title must be 255 characters or less');
    }
  }

  if (data.description !== undefined && typeof data.description !== 'string') {
    errors.push('description must be a string');
  }

  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
    errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (data.due_date !== undefined && data.due_date !== null) {
    if (!parseDateOnly(data.due_date)) {
      errors.push('due_date must be a valid YYYY-MM-DD date');
    }
  }

  if (data.recurrence !== undefined && !VALID_RECURRENCES.includes(data.recurrence)) {
    errors.push(`recurrence must be one of: ${VALID_RECURRENCES.join(', ')}`);
  }

  if (data.recurrence_end !== undefined && data.recurrence_end !== null) {
    if (!parseDateOnly(data.recurrence_end)) {
      errors.push('recurrence_end must be a valid YYYY-MM-DD date');
    }
  }

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      errors.push('tags must be an array of tag IDs');
    } else if (data.tags.some((tagId) => !Number.isInteger(tagId) || tagId <= 0)) {
      errors.push('tags must contain only positive integer tag IDs');
    } else if (new Set(data.tags).size !== data.tags.length) {
      errors.push('tags must not contain duplicate IDs');
    }
  }

  if (data.subtasks !== undefined) {
    if (!Array.isArray(data.subtasks)) {
      errors.push('subtasks must be an array');
    } else if (data.subtasks.some((subtask) => {
      const title = typeof subtask === 'string' ? subtask : subtask?.title;
      return typeof title !== 'string' || title.trim().length === 0 || title.length > 255;
    })) {
      errors.push('each subtask must have a non-empty title of 255 characters or less');
    }
  }

  return errors;
}

function validateBatchInput(data) {
  const errors = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return ['Request body must be a JSON object'];
  }

  if (!data.action || !['update_status', 'update_priority', 'delete'].includes(data.action)) {
    errors.push('action must be one of: update_status, update_priority, delete');
  }

  if (!data.ids || !Array.isArray(data.ids) || data.ids.length === 0) {
    errors.push('ids must be a non-empty array of task IDs');
  } else if (data.ids.length > 100) {
    errors.push('ids must contain no more than 100 task IDs');
  } else if (data.ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    errors.push('ids must contain only positive integer task IDs');
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
};
