const request = require('supertest');
const app = require('../app');
const { initDb, getDb, closeDb } = require('../db');

describe('Task API and database integrity', () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    const db = getDb();
    await db('task_tags').del();
    await db('subtasks').del();
    await db('task_notes').del();
    await db('tasks').del();
    await db('tags').del();
    await db('webhooks').del();
  });

  afterAll(async () => {
    await closeDb();
  });

  test('enables foreign keys and cascades task relationships', async () => {
    const db = getDb();
    const [{ foreign_keys: foreignKeys }] = await db.raw('PRAGMA foreign_keys');
    expect(foreignKeys).toBe(1);

    const tagResponse = await request(app).post('/api/tags').send({ name: '工作', color: '#3366ff' });
    const taskResponse = await request(app).post('/api/tasks').send({
      title: '带关联的任务',
      tags: [tagResponse.body.id],
      subtasks: ['第一步'],
    });

    expect(taskResponse.status).toBe(201);
    expect(await db('task_tags').where({ task_id: taskResponse.body.id })).toHaveLength(1);
    expect(await db('subtasks').where({ task_id: taskResponse.body.id })).toHaveLength(1);

    expect((await request(app).delete(`/api/tasks/${taskResponse.body.id}`)).status).toBe(200);
    expect(await db('task_tags').where({ task_id: taskResponse.body.id })).toHaveLength(0);
    expect(await db('subtasks').where({ task_id: taskResponse.body.id })).toHaveLength(0);
  });

  test('rejects unknown tags without leaving a partial task', async () => {
    const db = getDb();
    const response = await request(app).post('/api/tasks').send({ title: '无效标签', tags: [999999] });

    expect(response.status).toBe(400);
    expect(await db('tasks').where({ title: '无效标签' })).toHaveLength(0);
  });

  test('sorts priority by business importance', async () => {
    for (const priority of ['medium', 'low', 'urgent', 'high']) {
      await request(app).post('/api/tasks').send({ title: priority, priority });
    }

    const response = await request(app).get('/api/tasks').query({ sort: 'priority', order: 'desc' });
    expect(response.status).toBe(200);
    expect(response.body.data.map((task) => task.priority)).toEqual(['urgent', 'high', 'medium', 'low']);
  });

  test('includes subtask progress in the regular task list', async () => {
    const created = await request(app).post('/api/tasks').send({
      title: '带进度的任务',
      subtasks: ['第一步', '第二步'],
    });
    const db = getDb();
    const firstSubtask = await db('subtasks').where({ task_id: created.body.id }).orderBy('sort_order').first();
    await request(app)
      .put(`/api/tasks/${created.body.id}/subtasks/${firstSubtask.id}`)
      .send({ completed: true });

    const response = await request(app).get('/api/tasks');

    expect(response.status).toBe(200);
    expect(response.body.data[0].subtask_progress).toEqual({ total: 2, completed: 1 });
  });

  test('validates update field types instead of returning a server error', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '原任务' });
    const response = await request(app).put(`/api/tasks/${created.body.id}`).send({ title: 123 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('Title must be a non-empty string');
  });
});
