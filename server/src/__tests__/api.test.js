const request = require('supertest');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const TEST_ATTACHMENT_DIR = path.join(os.tmpdir(), `agenttodo-attachments-${process.pid}`);
process.env.ATTACHMENT_DIR = TEST_ATTACHMENT_DIR;

const app = require('../app');
const { initDb, getDb, closeDb } = require('../db');

describe('Task API and database integrity', () => {
  beforeAll(async () => {
    await fs.rm(TEST_ATTACHMENT_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_ATTACHMENT_DIR, { recursive: true });
    await initDb();
  });

  beforeEach(async () => {
    const db = getDb();
    await db('task_attachments').del();
    await db('task_tags').del();
    await db('subtasks').del();
    await db('task_notes').del();
    await db('tasks').del();
    await db('tags').del();
    await db('webhooks').del();
    await fs.rm(TEST_ATTACHMENT_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_ATTACHMENT_DIR, { recursive: true });
  });

  afterAll(async () => {
    await closeDb();
    await fs.rm(TEST_ATTACHMENT_DIR, { recursive: true, force: true });
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

  test('uploads, lists, downloads, counts, and deletes attachments', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '附件任务' });
    const upload = await request(app)
      .post(`/api/tasks/${created.body.id}/attachments`)
      .attach('file', Buffer.from('attachment contents'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(upload.status).toBe(201);
    expect(upload.body).toMatchObject({
      task_id: created.body.id,
      original_name: 'notes.txt',
      mime_type: 'text/plain',
      size: 19,
      preview_url: null,
    });
    expect(upload.body.stored_name).toBeUndefined();

    const attachments = await request(app).get(`/api/tasks/${created.body.id}/attachments`);
    expect(attachments.body).toHaveLength(1);

    const taskList = await request(app).get('/api/tasks');
    expect(taskList.body.data[0].attachment_count).toBe(1);

    const download = await request(app).get(upload.body.download_url);
    expect(download.status).toBe(200);
    expect(download.body.toString()).toBe('attachment contents');

    expect((await request(app).delete(`/api/tasks/${created.body.id}/attachments/${upload.body.id}`)).status).toBe(200);
    expect(await fs.readdir(TEST_ATTACHMENT_DIR)).toHaveLength(0);
  });

  test('removes attachment files when deleting a task', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '待删除附件任务' });
    const upload = await request(app)
      .post(`/api/tasks/${created.body.id}/attachments`)
      .attach('file', Buffer.from('temporary'), 'temporary.txt');
    expect(upload.status).toBe(201);

    expect((await request(app).delete(`/api/tasks/${created.body.id}`)).status).toBe(200);
    expect(await fs.readdir(TEST_ATTACHMENT_DIR)).toHaveLength(0);
  });

  test('exports and restores a full ZIP backup with attachment contents', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '完整备份任务' });
    const upload = await request(app)
      .post(`/api/tasks/${created.body.id}/attachments`)
      .attach('file', Buffer.from('preserved in zip'), 'backup-note.txt');
    expect(upload.status).toBe(201);

    const archive = await request(app)
      .get('/api/backup/export.zip')
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(archive.status).toBe(200);
    expect(archive.body.subarray(0, 2).toString()).toBe('PK');

    await request(app).delete(`/api/tasks/${created.body.id}`);
    expect((await request(app).get('/api/tasks')).body.data).toHaveLength(0);

    const restore = await request(app)
      .post('/api/backup/import.zip')
      .attach('backup', archive.body, {
        filename: 'agenttodo-backup.zip',
        contentType: 'application/zip',
      });
    expect(restore.status).toBe(200);

    const restoredTasks = await request(app).get('/api/tasks');
    expect(restoredTasks.body.data[0]).toMatchObject({ title: '完整备份任务', attachment_count: 1 });
    const restoredAttachments = await request(app).get(`/api/tasks/${created.body.id}/attachments`);
    expect(restoredAttachments.body).toHaveLength(1);
    const download = await request(app).get(restoredAttachments.body[0].download_url);
    expect(download.body.toString()).toBe('preserved in zip');
  });

  test('rejects an invalid ZIP backup without replacing current tasks', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '必须保留的任务' });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let restore;
    try {
      restore = await request(app)
        .post('/api/backup/import.zip')
        .attach('backup', Buffer.from('not a zip archive'), 'invalid.zip');
    } finally {
      consoleSpy.mockRestore();
    }

    expect(restore.status).toBe(400);
    const preserved = await request(app).get(`/api/tasks/${created.body.id}`);
    expect(preserved.status).toBe(200);
    expect(preserved.body.title).toBe('必须保留的任务');
  });

  test('validates update field types instead of returning a server error', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '原任务' });
    const response = await request(app).put(`/api/tasks/${created.body.id}`).send({ title: 123 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('Title must be a non-empty string');
  });
});
