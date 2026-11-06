const request = require('supertest');
const axios = require('axios');

jest.mock('axios');

const app = require('../app');
const { initDb, closeDb, getDb } = require('../db');
const { flushWebhooks } = require('../services/webhookService');
const { formatLocalDate } = require('../utils/date');

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

const api = () => request(app);

async function createTask(body) {
  const res = await api().post('/api/tasks').send(body);
  if (res.status !== 201) throw new Error(`createTask failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createTag(name, color) {
  const res = await api().post('/api/tags').send({ name, color });
  return res.body;
}

beforeAll(async () => {
  await initDb();
});

afterAll(async () => {
  await flushWebhooks();
  await closeDb();
});

beforeEach(async () => {
  await flushWebhooks();
  const db = getDb();
  for (const t of ['task_tags', 'subtasks', 'task_notes', 'tasks', 'tags', 'webhooks']) {
    await db(t).del();
  }
  jest.clearAllMocks();
  axios.post.mockResolvedValue({ status: 200 });
});

describe('Tasks CRUD', () => {
  test('创建任务时同时写入子任务和标签，并返回完整详情', async () => {
    const tag = await createTag('工作', '#3b82f6');
    const task = await createTask({
      title: '  写周报  ',
      priority: 'high',
      due_date: '2026-03-10',
      tags: [tag.id],
      subtasks: ['收集数据', { title: '撰写' }],
    });

    expect(task.title).toBe('写周报');
    expect(task.tags).toEqual([{ id: tag.id, name: '工作', color: '#3b82f6' }]);
    expect(task.subtasks.map((s) => s.title)).toEqual(['收集数据', '撰写']);
    expect(task.subtasks[0].completed).toBe(false);
    expect(task.subtask_progress).toEqual({ total: 2, completed: 0 });
    expect(task.notes).toEqual([]);
  });

  test('引用不存在的标签返回 400，且不会留下半成品任务（事务回滚）', async () => {
    const res = await api().post('/api/tasks').send({ title: 'x', tags: [999], subtasks: ['a'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/999/);
    const [{ count }] = await getDb()('tasks').count('* as count');
    expect(Number(count)).toBe(0);
  });

  test('严格校验日期格式，并接受 ISO datetime（取日期部分）', async () => {
    const bad = await api().post('/api/tasks').send({ title: 'x', due_date: '2026-02-30' });
    expect(bad.status).toBe(400);

    const fuzzy = await api().post('/api/tasks').send({ title: 'x', due_date: 'next friday' });
    expect(fuzzy.status).toBe(400);

    const iso = await createTask({ title: 'x', due_date: '2026-03-10T09:30:00.000Z' });
    expect(iso.due_date).toBe('2026-03-10');
  });

  test('更新时 title 类型错误返回 400 而不是 500', async () => {
    const task = await createTask({ title: 'a' });
    const res = await api().put(`/api/tasks/${task.id}`).send({ title: 123 });
    expect(res.status).toBe(400);
  });

  test('可以把 due_date 置空', async () => {
    const task = await createTask({ title: 'a', due_date: '2026-03-10' });
    const res = await api().put(`/api/tasks/${task.id}`).send({ due_date: null });
    expect(res.status).toBe(200);
    expect(res.body.due_date).toBeNull();
  });

  test('非法 ID 返回 400，不存在的任务返回 404', async () => {
    expect((await api().get('/api/tasks/abc')).status).toBe(400);
    expect((await api().get('/api/tasks/99999')).status).toBe(404);
    expect((await api().put('/api/tasks/99999').send({ title: 'x' })).status).toBe(404);
    expect((await api().delete('/api/tasks/99999')).status).toBe(404);
  });

  test('删除任务会级联删除子任务、笔记和标签关联（外键已开启）', async () => {
    const tag = await createTag('t1');
    const task = await createTask({ title: 'a', tags: [tag.id], subtasks: ['s1', 's2'] });
    await api().post(`/api/tasks/${task.id}/notes`).send({ content: 'note' });

    const res = await api().delete(`/api/tasks/${task.id}`);
    expect(res.status).toBe(200);

    const db = getDb();
    for (const table of ['subtasks', 'task_notes', 'task_tags']) {
      const [{ count }] = await db(table).count('* as count');
      expect(Number(count)).toBe(0);
    }
    const tags = await api().get('/api/tags');
    expect(tags.body[0].task_count).toBe(0);
  });

  test('completed_at 随状态变化自动维护', async () => {
    const task = await createTask({ title: 'a' });
    expect(task.completed_at).toBeNull();
    const done = await api().put(`/api/tasks/${task.id}`).send({ status: 'done' });
    expect(done.body.completed_at).toEqual(expect.any(String));
    const reopened = await api().put(`/api/tasks/${task.id}`).send({ status: 'todo' });
    expect(reopened.body.completed_at).toBeNull();
  });
});

describe('List / filter / sort', () => {
  test('按优先级排序使用业务顺序而不是字母顺序', async () => {
    for (const p of ['low', 'urgent', 'medium', 'high']) {
      await createTask({ title: p, priority: p });
    }
    const desc = await api().get('/api/tasks?sort=priority&order=desc');
    expect(desc.body.data.map((t) => t.priority)).toEqual(['urgent', 'high', 'medium', 'low']);
    const asc = await api().get('/api/tasks?sort=priority&order=asc');
    expect(asc.body.data.map((t) => t.priority)).toEqual(['low', 'medium', 'high', 'urgent']);
  });

  test('按截止日期排序时无日期的任务排在最后', async () => {
    await createTask({ title: 'none' });
    await createTask({ title: 'late', due_date: '2026-05-01' });
    await createTask({ title: 'early', due_date: '2026-01-01' });
    const res = await api().get('/api/tasks?sort=due_date&order=asc');
    expect(res.body.data.map((t) => t.title)).toEqual(['early', 'late', 'none']);
  });

  test('标签筛选 + 分页总数正确', async () => {
    const a = await createTag('A');
    const b = await createTag('B');
    await createTask({ title: '1', tags: [a.id] });
    await createTask({ title: '2', tags: [a.id, b.id] });
    await createTask({ title: '3', tags: [b.id] });
    await createTask({ title: '4' });

    const res = await api().get(`/api/tasks?tag=${a.id}&limit=1`);
    expect(res.body.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(res.body.data).toHaveLength(1);

    const multi = await api().get(`/api/tasks?tag=${a.id},${b.id}`);
    expect(multi.body.pagination.total).toBe(3);
  });

  test('搜索会转义 LIKE 通配符', async () => {
    await createTask({ title: '完成 50% 进度' });
    await createTask({ title: '完成 500 个' });
    const res = await api().get(`/api/tasks?search=${encodeURIComponent('50%')}`);
    expect(res.body.data.map((t) => t.title)).toEqual(['完成 50% 进度']);
  });

  test('列表项包含子任务进度与子任务数组', async () => {
    const task = await createTask({ title: 'a', subtasks: ['x', 'y'] });
    await api().put(`/api/tasks/${task.id}/subtasks/${task.subtasks[0].id}`).send({ completed: true });
    const res = await api().get('/api/tasks');
    expect(res.body.data[0].subtask_progress).toEqual({ total: 2, completed: 1 });
    expect(res.body.data[0].subtasks).toEqual([
      expect.objectContaining({ title: 'x', completed: true }),
      expect.objectContaining({ title: 'y', completed: false }),
    ]);
  });

  test('非法日期过滤参数返回 400', async () => {
    const res = await api().get('/api/tasks?due_before=tomorrow');
    expect(res.status).toBe(400);
  });
});

describe('AI endpoints', () => {
  test('summary 使用本地日期统计逾期 / 今日 / 今日完成', async () => {
    await createTask({ title: 'overdue', due_date: daysFromToday(-2), priority: 'urgent' });
    await createTask({ title: 'today', due_date: daysFromToday(0), priority: 'high' });
    await createTask({ title: 'future', due_date: daysFromToday(3) });
    const done = await createTask({ title: 'done', due_date: daysFromToday(-5) });
    await api().put(`/api/tasks/${done.id}`).send({ status: 'done' });

    const res = await api().get('/api/tasks/summary');
    expect(res.body).toMatchObject({
      total: 4,
      by_status: { todo: 3, in_progress: 0, done: 1 },
      overdue: 1,
      due_today: 1,
      completed_today: 1,
      by_priority: { urgent: 1, high: 1 },
      date: daysFromToday(0),
    });
  });

  test('today 返回今日到期、逾期、其他进行中及今日已完成任务，附带子任务列表', async () => {
    await createTask({ title: 'overdue', due_date: daysFromToday(-1), priority: 'low', subtasks: ['s'] });
    await createTask({ title: 'today-urgent', due_date: daysFromToday(0), priority: 'urgent' });
    await createTask({ title: 'future', due_date: daysFromToday(1) });
    await createTask({ title: 'wip-no-due', status: 'in_progress', priority: 'high', subtasks: ['step-1'] });
    await createTask({ title: 'done-today', due_date: daysFromToday(0), status: 'done' });

    const res = await api().get('/api/tasks/today');
    expect(res.body.tasks.map((t) => t.title)).toEqual(['today-urgent', 'overdue']);
    const overdue = res.body.tasks[1];
    expect(overdue.is_overdue).toBe(true);
    expect(overdue.subtasks[0]).toMatchObject({ title: 's', completed: false });
    expect(overdue.subtask_progress).toEqual({ total: 1, completed: 0 });

    expect(res.body.in_progress_others.map((t) => t.title)).toEqual(['wip-no-due']);
    expect(res.body.in_progress_others[0].subtasks[0]).toMatchObject({ title: 'step-1', completed: false });
    expect(res.body.completed_today.map((t) => t.title)).toEqual(['done-today']);
  });

  test('overdue 只返回未完成的逾期任务', async () => {
    await createTask({ title: 'a', due_date: daysFromToday(-1) });
    await createTask({ title: 'b', due_date: daysFromToday(0) });
    const res = await api().get('/api/tasks/overdue');
    expect(res.body.tasks.map((t) => t.title)).toEqual(['a']);
  });
});

describe('Recurring tasks', () => {
  test('完成每日任务后自动生成下一次实例（复制标签、重置子任务）', async () => {
    const tag = await createTag('习惯');
    const task = await createTask({
      title: '晨跑', recurrence: 'daily', due_date: daysFromToday(0), tags: [tag.id], subtasks: ['热身'],
    });
    await api().put(`/api/tasks/${task.id}/subtasks/${task.subtasks[0].id}`).send({ completed: true });

    const res = await api().put(`/api/tasks/${task.id}`).send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.recurrence).toBe('none');
    expect(res.body.next_occurrence).toEqual({ id: expect.any(Number), due_date: daysFromToday(1) });

    const next = (await api().get(`/api/tasks/${res.body.next_occurrence.id}`)).body;
    expect(next).toMatchObject({ title: '晨跑', status: 'todo', recurrence: 'daily', due_date: daysFromToday(1) });
    expect(next.tags.map((t) => t.id)).toEqual([tag.id]);
    expect(next.subtasks).toEqual([expect.objectContaining({ title: '热身', completed: false })]);

    // 反复切换状态不会重复生成
    await api().put(`/api/tasks/${task.id}`).send({ status: 'todo' });
    const again = await api().put(`/api/tasks/${task.id}`).send({ status: 'done' });
    expect(again.body.next_occurrence).toBeUndefined();
    const [{ count }] = await getDb()('tasks').count('* as count');
    expect(Number(count)).toBe(2);
  });

  test('逾期多天的周期任务完成后，下一次落在未来', async () => {
    const task = await createTask({ title: 'x', recurrence: 'daily', due_date: daysFromToday(-5) });
    const res = await api().put(`/api/tasks/${task.id}`).send({ status: 'done' });
    expect(res.body.next_occurrence.due_date).toBe(daysFromToday(1));
  });

  test('超过 recurrence_end 不再生成', async () => {
    const task = await createTask({
      title: 'x', recurrence: 'weekly', due_date: daysFromToday(0), recurrence_end: daysFromToday(3),
    });
    const res = await api().put(`/api/tasks/${task.id}`).send({ status: 'done' });
    expect(res.body.next_occurrence).toBeUndefined();
  });

  test('批量标记完成同样触发周期生成，并报告不存在的 ID', async () => {
    const a = await createTask({ title: 'a', recurrence: 'daily', due_date: daysFromToday(0) });
    const b = await createTask({ title: 'b' });
    const res = await api().post('/api/tasks/batch').send({ action: 'update_status', ids: [a.id, b.id, 99999], value: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.affected).toBe(2);
    expect(res.body.not_found).toEqual([99999]);
    expect(res.body.next_occurrences).toHaveLength(1);
  });
});

describe('Batch', () => {
  test('批量删除与参数校验', async () => {
    const a = await createTask({ title: 'a' });
    const b = await createTask({ title: 'b' });
    expect((await api().post('/api/tasks/batch').send({ action: 'delete', ids: ['x'] })).status).toBe(400);
    const res = await api().post('/api/tasks/batch').send({ action: 'delete', ids: [a.id, b.id] });
    expect(res.body.affected).toBe(2);
    expect((await api().post('/api/tasks/batch').send({ action: 'delete', ids: [a.id] })).status).toBe(404);
  });
});

describe('Subtasks & notes', () => {
  test('子任务增删改', async () => {
    const task = await createTask({ title: 'a' });
    const created = await api().post(`/api/tasks/${task.id}/subtasks`).send({ title: 'step' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'step', completed: false, sort_order: 1 });

    expect((await api().put(`/api/tasks/${task.id}/subtasks/${created.body.id}`).send({})).status).toBe(400);
    expect((await api().put(`/api/tasks/${task.id}/subtasks/${created.body.id}`).send({ title: 5 })).status).toBe(400);

    const toggled = await api().put(`/api/tasks/${task.id}/subtasks/${created.body.id}`).send({ completed: true });
    expect(toggled.body.completed).toBe(true);

    expect((await api().delete(`/api/tasks/${task.id}/subtasks/${created.body.id}`)).status).toBe(200);
    expect((await api().delete(`/api/tasks/${task.id}/subtasks/${created.body.id}`)).status).toBe(404);
    expect((await api().get('/api/tasks/99999/subtasks')).status).toBe(404);
  });

  test('笔记增删并校验内容', async () => {
    const task = await createTask({ title: 'a' });
    expect((await api().post(`/api/tasks/${task.id}/notes`).send({ content: '  ' })).status).toBe(400);
    const note = await api().post(`/api/tasks/${task.id}/notes`).send({ content: '卡住了', source: 'ai' });
    expect(note.body).toMatchObject({ content: '卡住了', source: 'ai' });
    const list = await api().get(`/api/tasks/${task.id}/notes`);
    expect(list.body).toHaveLength(1);
    expect((await api().delete(`/api/tasks/${task.id}/notes/${note.body.id}`)).status).toBe(200);
  });
});

describe('Tags', () => {
  test('名称冲突返回 409，颜色格式校验', async () => {
    const a = await createTag('A');
    await createTag('B');
    expect((await api().post('/api/tags').send({ name: 'A' })).status).toBe(409);
    expect((await api().put(`/api/tags/${a.id}`).send({ name: 'B' })).status).toBe(409);
    expect((await api().post('/api/tags').send({ name: 'C', color: 'red' })).status).toBe(400);
    expect((await api().put(`/api/tags/${a.id}`).send({ name: 'A' })).status).toBe(200);
  });

  test('删除标签会移除任务上的关联', async () => {
    const tag = await createTag('A');
    const task = await createTask({ title: 'a', tags: [tag.id] });
    await api().delete(`/api/tags/${tag.id}`);
    const res = await api().get(`/api/tasks/${task.id}`);
    expect(res.body.tags).toEqual([]);
  });
});

describe('Webhooks', () => {
  test('注册、推送、更新与删除', async () => {
    expect((await api().post('/api/webhooks').send({ name: 'x', url: 'not-a-url' })).status).toBe(400);
    expect((await api().post('/api/webhooks').send({ name: 'x', url: 'http://a', events: ['bogus'] })).status).toBe(400);

    const hook = await api().post('/api/webhooks').send({
      name: 'agent', url: 'http://localhost:9999/hook', events: ['task.created', 'task.completed'],
    });
    expect(hook.status).toBe(201);
    expect(hook.body.events).toEqual(['task.created', 'task.completed']);
    expect(hook.body.is_active).toBe(true);

    const task = await createTask({ title: 'a' });
    await api().put(`/api/tasks/${task.id}`).send({ status: 'done' });
    await flushWebhooks();

    const events = axios.post.mock.calls.map(([, body]) => body.event);
    expect(events).toEqual(['task.created', 'task.completed']);
    expect(axios.post.mock.calls[0][0]).toBe('http://localhost:9999/hook');

    const disabled = await api().put(`/api/webhooks/${hook.body.id}`).send({ is_active: false });
    expect(disabled.body.is_active).toBe(false);

    expect((await api().delete(`/api/webhooks/${hook.body.id}`)).status).toBe(200);
    expect((await api().get('/api/webhooks')).body).toEqual([]);
  });
});

describe('Backup', () => {
  test('导出后再导入可以完整还原数据', async () => {
    const tag = await createTag('A');
    await createTask({ title: 'a', tags: [tag.id], subtasks: ['s'] });
    const exported = (await api().get('/api/backup/export')).body;
    expect(exported.data.tasks).toHaveLength(1);

    await createTask({ title: 'to be replaced' });
    const res = await api().post('/api/backup/import').send(exported);
    expect(res.status).toBe(200);
    expect(res.body.imported).toMatchObject({ tasks: 1, tags: 1, task_tags: 1, subtasks: 1 });

    const list = await api().get('/api/tasks');
    expect(list.body.data.map((t) => t.title)).toEqual(['a']);
    expect(list.body.data[0].tags[0].name).toBe('A');
  });

  test('非法备份格式返回 400，且不会清空现有数据', async () => {
    await createTask({ title: 'keep' });
    expect((await api().post('/api/backup/import').send({ foo: 1 })).status).toBe(400);
    expect((await api().post('/api/backup/import').send({ data: { tasks: 'x' } })).status).toBe(400);
    const dangling = { data: { task_tags: [{ task_id: 1, tag_id: 1 }] } };
    expect((await api().post('/api/backup/import').send(dangling)).status).toBe(400);
    const list = await api().get('/api/tasks');
    expect(list.body.data.map((t) => t.title)).toEqual(['keep']);
  });
});

describe('App-level behaviour', () => {
  test('畸形 JSON 返回 400', async () => {
    const res = await api().post('/api/tasks').set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid JSON/);
  });

  test('未知 API 路由返回 JSON 404', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Not found/);
  });

  test('健康检查', async () => {
    const res = await api().get('/api/health');
    expect(res.body.status).toBe('ok');
  });

  test('SSE /api/events 建立连接并在任务写入时推送实时事件', async () => {
    const http = require('http');
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const received = [];
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/events`, (res) => {
          expect(res.headers['content-type']).toMatch(/text\/event-stream/);
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
            for (const line of lines) {
              const payload = JSON.parse(line.slice(6));
              received.push(payload);
              if (payload.type === 'connected') {
                createTask({ title: 'sse-live-task' }).catch(reject);
              } else if (payload.type === 'task.created') {
                req.destroy();
                resolve();
              }
            }
          });
        });
        req.on('error', (err) => {
          if (err.code !== 'ECONNRESET') reject(err);
        });
      });

      expect(received[0].type).toBe('connected');
      expect(received.some((e) => e.type === 'task.created')).toBe(true);
    } finally {
      const { closeAllEventClients } = require('../services/eventService');
      closeAllEventClients();
      await new Promise((r) => server.close(r));
    }
  });
});
