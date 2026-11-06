const axios = require('axios');
const path = require('path');
const SkillManager = require('../SkillManager');
const UpdateTaskSkill = require('../skills/update_task');
const SearchTasksSkill = require('../skills/search_tasks');
const AddTaskProgressNoteSkill = require('../skills/add_task_progress_note');
const { parseCommandLine, parseArgs, isErrorResult } = require('../index');

jest.mock('axios');

beforeEach(() => jest.clearAllMocks());

describe('CLI 命令解析', () => {
  test('允许多个空格，并完整保留 JSON 参数里的空格', () => {
    expect(parseCommandLine('run   create_task   {"title": "写 周报"}')).toEqual({
      command: 'run', skillName: 'create_task', argsString: '{"title": "写 周报"}',
    });
    expect(parseCommandLine('list')).toEqual({ command: 'list', skillName: undefined, argsString: '' });
  });

  test('parseArgs 只接受 JSON 对象', () => {
    expect(parseArgs('')).toEqual({});
    expect(parseArgs('{"a":1}')).toEqual({ a: 1 });
    expect(() => parseArgs('[1]')).toThrow();
    expect(() => parseArgs('{bad')).toThrow();
  });

  test('isErrorResult', () => {
    expect(isErrorResult({ status: 'error' })).toBe(true);
    expect(isErrorResult({ status: 'ok' })).toBe(false);
    expect(isErrorResult(null)).toBe(false);
  });
});

describe('SkillManager.runSkill', () => {
  const manager = new SkillManager(path.join(__dirname, '..', 'skills'), { log: null, error: null });
  manager.loadSkills();

  test('加载全部内置技能（含参数说明）', () => {
    const names = manager.listSkills().map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining([
      'ping', 'create_task', 'update_task', 'add_task_progress_note',
      'get_daily_summary', 'get_today_agenda', 'get_user_tags', 'search_tasks', 'get_task',
    ]));
    const create = manager.listSkills().find((s) => s.name === 'create_task');
    expect(create.parameters.title).toBeDefined();
  });

  test('参数校验失败时返回错误对象而不是抛异常', async () => {
    const result = await manager.runSkill('create_task', {});
    expect(result).toMatchObject({ status: 'error', skill: 'create_task' });
  });

  test('未知技能返回错误对象', async () => {
    const result = await manager.runSkill('nope', {});
    expect(result.status).toBe('error');
  });
});

describe('UpdateTaskSkill', () => {
  test('允许显式传 null 清空截止日期，并支持更新状态和描述', async () => {
    axios.put.mockResolvedValue({ data: { id: 1 } });
    await new UpdateTaskSkill().execute({ task_id: 1, due_date: null, status: 'done', description: 'x' });
    expect(axios.put).toHaveBeenCalledWith(
      'http://localhost:3301/api/tasks/1',
      { due_date: null, status: 'done', description: 'x' },
      expect.any(Object),
    );
  });

  test('没有任何字段时返回错误', async () => {
    const result = await new UpdateTaskSkill().execute({ task_id: 1 });
    expect(result.status).toBe('error');
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe('SearchTasksSkill', () => {
  test('转发筛选参数并精简输出', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [{ id: 3, title: '写报告', status: 'todo', priority: 'high', due_date: null, recurrence: 'none', tags: [{ name: '工作' }], subtask_progress: null, description: 'long' }],
        pagination: { total: 1 },
      },
    });
    const result = await new SearchTasksSkill().execute({ search: '报告', status: ['todo', 'in_progress'] });
    expect(axios.get).toHaveBeenCalledWith('http://localhost:3301/api/tasks', expect.objectContaining({
      params: { limit: 20, search: '报告', status: 'todo,in_progress' },
    }));
    expect(result).toEqual({
      total: 1,
      returned: 1,
      tasks: [{ id: 3, title: '写报告', status: 'todo', priority: 'high', due_date: null, recurrence: 'none', tags: ['工作'], subtask_progress: null }],
    });
  });
});

describe('AddTaskProgressNoteSkill', () => {
  test('单个子任务失败不影响其它子任务，并返回周期任务的下一次实例', async () => {
    axios.post.mockResolvedValue({ data: { id: 10 } });
    const notFound = new Error('404');
    notFound.response = { status: 404, data: { error: 'Subtask not found' } };
    axios.put
      .mockResolvedValueOnce({ data: {} }) // subtask 1
      .mockRejectedValueOnce(notFound) // subtask 2
      .mockResolvedValueOnce({ data: { next_occurrence: { id: 99, due_date: '2026-03-11' } } }); // status

    const result = await new AddTaskProgressNoteSkill().execute({
      task_id: 5, note_content: '搞定了', complete_subtasks: [1, 2], task_status: 'done',
    });

    expect(result.actions).toEqual([
      { action: 'note_added', data: { id: 10 } },
      { action: 'subtasks_completed', ids: [1], failed: [{ id: 2, error: 'Subtask not found' }] },
      { action: 'status_updated', status: 'done', next_occurrence: { id: 99, due_date: '2026-03-11' } },
    ]);
  });

  test('校验 task_status 取值', () => {
    expect(() => new AddTaskProgressNoteSkill().validate({ task_id: 1, note_content: 'x', task_status: 'finished' }))
      .toThrow('task_status');
  });
});
