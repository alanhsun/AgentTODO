const BaseSkill = require('../BaseSkill');
const axios = require('axios');
const { BASE_URL, REQUEST_OPTIONS } = require('../config');

// 允许更新的字段；传 null 可清空 due_date / recurrence_end
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'due_date', 'recurrence', 'recurrence_end', 'tags'];

/**
 * 更新任务技能 (UpdateTaskSkill)
 * 作用：修改已经存在的任务（比如改个名字、换个截止日期）。
 * 就像把跑腿小哥手上的旧订单改一改。
 */
class UpdateTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'update_task'; // 命令行调用的名字
    this.description = '更新已有任务的属性（如标题、描述、状态、优先级、重复频率、截止日期、标签）。';
    this.parameters = {
      task_id: '必填，任务 ID',
      title: '可选，新标题',
      description: '可选，新描述',
      status: '可选，todo | in_progress | done',
      priority: '可选，low | medium | high | urgent',
      due_date: '可选，YYYY-MM-DD；传 null 清空',
      recurrence: '可选，none | daily | weekly | monthly',
      recurrence_end: '可选，YYYY-MM-DD；传 null 清空',
      tags: '可选，标签 ID 数组（会整体替换原有标签）',
    };
  }

  /**
   * 参数验证：检查用户给的指令参数对不对。
   * 为什么需要这个？因为如果不告诉程序“要改哪一个任务”（没有任务ID），程序会一头雾水。
   */
  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    return args;
  }

  /**
   * 执行逻辑：真正干活的地方。
   */
  async execute(args) {
    try {
      // 1. 把所有需要改的字段塞进 payload 里（显式传入 null 也算，用于清空日期）
      const payload = {};
      for (const field of UPDATABLE_FIELDS) {
        if (args[field] !== undefined) payload[field] = args[field];
      }

      // 如果一个属性都没填，直接拦下来，避免浪费一次网络请求
      if (Object.keys(payload).length === 0) {
        throw new Error("没有提供任何需要更新的字段");
      }

      // 2. 发起 PUT 请求，把新的内容告诉后端
      const res = await axios.put(`${BASE_URL}/tasks/${args.task_id}`, payload, REQUEST_OPTIONS);

      // 3. 把结果返回给你看
      return { message: "任务更新成功", data: res.data };
    } catch (error) {
      // 遇到报错统一处理
      return this.handleError(error);
    }
  }
}

module.exports = UpdateTaskSkill;
