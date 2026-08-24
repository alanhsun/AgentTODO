const { dateInTimeZone } = require('./date');

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(stamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;

  return { year, month, day, stamp, value };
}

function createdDate(task, timeZone) {
  if (!task?.created_at) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(task.created_at)
    ? `${task.created_at.replace(' ', 'T')}Z`
    : task.created_at;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parseDateOnly(dateInTimeZone(parsed, timeZone));
}

function recurrenceEnd(task) {
  return parseDateOnly(task?.due_date || task?.recurrence_end || '');
}

function taskOccursOnDate(task, date, timeZone = 'Asia/Shanghai') {
  const target = parseDateOnly(date);
  if (!target) return false;

  const recurrence = task?.recurrence || 'none';
  const due = parseDateOnly(task?.due_date || '');
  if (recurrence === 'none') return Boolean(due && target.stamp === due.stamp);

  const start = createdDate(task, timeZone);
  const end = recurrenceEnd(task);
  if (!start || target.stamp < start.stamp) return false;
  if (end && target.stamp > end.stamp) return false;

  const elapsedDays = Math.round((target.stamp - start.stamp) / 86400000);
  if (recurrence === 'daily') return true;
  if (recurrence === 'weekdays') {
    const weekday = new Date(target.stamp).getUTCDay();
    return weekday >= 1 && weekday <= 5;
  }
  if (recurrence === 'weekly') return elapsedDays % 7 === 0;
  if (recurrence === 'monthly') return target.day === start.day;
  return false;
}

function taskIsOverdueOnDate(task, date) {
  const target = parseDateOnly(date);
  if (!target || task?.status === 'done') return false;
  const end = recurrenceEnd(task);
  return Boolean(end && end.stamp < target.stamp);
}

module.exports = {
  parseDateOnly,
  taskOccursOnDate,
  taskIsOverdueOnDate,
};
