import { RECURRENCE_LABELS } from './taskOptions.js';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function parseDateParts(value) {
  if (typeof value !== 'string') return null;

  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, stamp: date.getTime() };
}

function getDateParts(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return { year, month, day, stamp: Date.UTC(year, month - 1, day) };
}

function parseCreatedAt(value) {
  if (value instanceof Date) return getDateParts(value);
  if (typeof value !== 'string') return null;

  // SQLite CURRENT_TIMESTAMP values are UTC but omit both the T separator and Z suffix.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);

  return getDateParts(date);
}

export function getRecurrenceLabel(recurrence) {
  return recurrence === 'none' ? '' : (RECURRENCE_LABELS[recurrence] || '');
}

export function taskOccursOnDate(task, date) {
  const target = getDateParts(date);
  if (!target) return false;

  const recurrence = task.recurrence || 'none';
  const due = parseDateParts(task?.due_date);
  if (recurrence === 'none') return Boolean(due && target.stamp === due.stamp);

  const start = parseCreatedAt(task?.created_at);
  if (!start) return false;
  if (target.stamp < start.stamp) return false;
  if (due && target.stamp > due.stamp) return false;

  const elapsedDays = Math.round((target.stamp - start.stamp) / 86400000);

  if (recurrence === 'daily') return true;
  if (recurrence === 'weekdays') {
    const dayOfWeek = new Date(target.stamp).getUTCDay();
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }
  if (recurrence === 'weekly') return elapsedDays % 7 === 0;
  if (recurrence === 'monthly') return target.day === start.day;

  return target.stamp === start.stamp;
}
