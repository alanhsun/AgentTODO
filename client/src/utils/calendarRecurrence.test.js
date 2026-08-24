import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecurrenceLabel, taskOccursOnDate } from './calendarRecurrence.js';

const localDate = (year, month, day) => new Date(year, month - 1, day);

test('one-time tasks only occur on their due date', () => {
  const task = { due_date: '2026-08-24', recurrence: 'none' };
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 24)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 25)), false);
});

test('daily tasks occur from the creation date through the inclusive due date', () => {
  const task = {
    created_at: '2026-08-24T03:00:00',
    due_date: '2026-08-26',
    recurrence: 'daily',
  };

  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 23)), false);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 24)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 25)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 26)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 27)), false);
});

test('weekly tasks occur every seven days from the creation date', () => {
  const task = {
    created_at: '2026-08-24T03:00:00',
    due_date: '2026-09-07',
    recurrence: 'weekly',
  };
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 30)), false);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 31)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 9, 7)), true);
});

test('weekday tasks occur Monday through Friday within the task date range', () => {
  const task = {
    created_at: '2026-08-22T03:00:00', // Saturday
    due_date: '2026-08-31',
    recurrence: 'weekdays',
  };

  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 22)), false);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 24)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 28)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 29)), false);
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 31)), true);
  assert.equal(taskOccursOnDate(task, localDate(2026, 9, 1)), false);
});

test('monthly tasks use the original day of month and skip shorter months', () => {
  const task = {
    created_at: '2026-01-31T03:00:00',
    due_date: '2026-03-31',
    recurrence: 'monthly',
  };
  assert.equal(taskOccursOnDate(task, localDate(2026, 2, 28)), false);
  assert.equal(taskOccursOnDate(task, localDate(2026, 3, 31)), true);
});

test('recurring tasks without a due date continue indefinitely', () => {
  const task = { created_at: '2026-08-24T03:00:00', recurrence: 'daily' };
  assert.equal(taskOccursOnDate(task, localDate(2027, 8, 24)), true);
});

test('recurring tasks require a valid creation time', () => {
  assert.equal(taskOccursOnDate({ due_date: '2026-08-25', recurrence: 'daily' }, localDate(2026, 8, 24)), false);
  assert.equal(taskOccursOnDate({ created_at: 'invalid', recurrence: 'daily' }, localDate(2026, 8, 24)), false);
});

test('one-time date-time values are matched by their date portion', () => {
  const task = { due_date: '2026-08-24T12:00:00.000Z', recurrence: 'none' };
  assert.equal(taskOccursOnDate(task, localDate(2026, 8, 24)), true);
});

test('returns readable recurrence labels', () => {
  assert.equal(getRecurrenceLabel('daily'), '每天');
  assert.equal(getRecurrenceLabel('weekdays'), '每个工作日');
  assert.equal(getRecurrenceLabel('weekly'), '每周');
  assert.equal(getRecurrenceLabel('monthly'), '每月');
  assert.equal(getRecurrenceLabel('none'), '');
});
