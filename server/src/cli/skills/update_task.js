const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class UpdateTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'update_task';
    this.description = '更新已有任务的属性（如标题、优先级、重复频率、截止日期）。';
  }

  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    return args;
  }

  async execute(args) {
    try {
      const payload = {};
      for (const field of ['title', 'priority', 'due_date', 'recurrence', 'tags']) {
        if (args[field] !== undefined) payload[field] = args[field];
      }

      if (Object.keys(payload).length === 0) {
        throw new Error('没有提供任何需要更新的字段');
      }

      const res = await httpClient.put(`/tasks/${args.task_id}`, payload);

      return { message: '任务更新成功', data: res.data };
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = UpdateTaskSkill;
