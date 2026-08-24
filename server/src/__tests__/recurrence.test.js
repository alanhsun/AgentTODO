const { taskOccursOnDate, taskIsOverdueOnDate } = require('../utils/recurrence');

const TIME_ZONE = 'Asia/Shanghai';

test('backend expands a daily task from creation through the inclusive due date', () => {
  const task = {
    created_at: '2026-08-24T00:00:00.000Z',
    due_date: '2026-08-26',
    recurrence: 'daily',
  };
  expect(taskOccursOnDate(task, '2026-08-23', TIME_ZONE)).toBe(false);
  expect(taskOccursOnDate(task, '2026-08-24', TIME_ZONE)).toBe(true);
  expect(taskOccursOnDate(task, '2026-08-26', TIME_ZONE)).toBe(true);
  expect(taskOccursOnDate(task, '2026-08-27', TIME_ZONE)).toBe(false);
});

test('backend expands weekday, weekly, and monthly schedules without creating rows', () => {
  const base = { created_at: '2026-08-24T00:00:00.000Z', due_date: '2026-10-31' };
  expect(taskOccursOnDate({ ...base, recurrence: 'weekdays' }, '2026-08-28', TIME_ZONE)).toBe(true);
  expect(taskOccursOnDate({ ...base, recurrence: 'weekdays' }, '2026-08-29', TIME_ZONE)).toBe(false);
  expect(taskOccursOnDate({ ...base, recurrence: 'weekly' }, '2026-08-31', TIME_ZONE)).toBe(true);
  expect(taskOccursOnDate({ ...base, recurrence: 'weekly' }, '2026-09-01', TIME_ZONE)).toBe(false);
  expect(taskOccursOnDate({ ...base, recurrence: 'monthly' }, '2026-09-24', TIME_ZONE)).toBe(true);
});

test('a task becomes overdue only after its inclusive end date', () => {
  const task = { status: 'todo', due_date: '2026-08-26', recurrence: 'daily' };
  expect(taskIsOverdueOnDate(task, '2026-08-26')).toBe(false);
  expect(taskIsOverdueOnDate(task, '2026-08-27')).toBe(true);
  expect(taskIsOverdueOnDate({ ...task, status: 'done' }, '2026-08-27')).toBe(false);
});
