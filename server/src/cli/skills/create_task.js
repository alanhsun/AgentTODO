const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class CreateTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'create_task';
    this.description = '创建一个新任务或周期性习惯。';
  }

  validate(args) {
    if (!args || !args.title) {
      throw new Error('任务标题 (title) 是必填项');
    }
    return args;
  }

  async execute(args) {
    try {
      const payload = {
        title: args.title,
        priority: args.priority || 'medium',
        recurrence: args.recurrence || 'none',
      };

      if (args.due_date) payload.due_date = args.due_date;
      if (args.subtasks) payload.subtasks = args.subtasks;
      if (args.tags) payload.tags = args.tags;

      const res = await httpClient.post('/tasks', payload);

      return { message: '任务创建成功', data: res.data };
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = CreateTaskSkill;
