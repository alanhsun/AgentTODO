const BaseSkill = require('../BaseSkill');
const axios = require('axios');
const { BASE_URL, REQUEST_OPTIONS } = require('../config');

/**
 * 获取任务详情技能 (GetTaskSkill)
 * 作用：查看单个任务的全部信息：标签、子任务（含 ID 与完成状态）以及历史进展笔记。
 */
class GetTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_task';
    this.description = '获取单个任务的完整详情（标签、子任务列表及 ID、进展笔记）。';
    this.parameters = {
      task_id: '必填，任务 ID',
    };
  }

  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    return args;
  }

  async execute(args) {
    try {
      const res = await axios.get(`${BASE_URL}/tasks/${args.task_id}`, REQUEST_OPTIONS);
      return res.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = GetTaskSkill;
