const BaseSkill = require('../BaseSkill');
const axios = require('axios');

// 为什么需要 BASE_URL？因为这是后端服务的主机地址。
const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3300/api';

/**
 * 更新任务技能 (UpdateTaskSkill)
 * 作用：修改已经存在的任务（比如改个名字、换个截止日期）。
 * 就像把跑腿小哥手上的旧订单改一改。
 */
class UpdateTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'update_task'; // 命令行调用的名字
    this.description = '更新已有任务的属性（如标题、优先级、重复频率、截止日期）。';
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
      // 1. 把所有需要改的字段塞进 payload 里
      const payload = {};
      if (args.title) payload.title = args.title;
      if (args.priority) payload.priority = args.priority;
      if (args.due_date) payload.due_date = args.due_date;
      if (args.recurrence) payload.recurrence = args.recurrence;
      if (args.tags) payload.tags = args.tags;

      // 如果一个属性都没填，直接拦下来，避免浪费一次网络请求
      if (Object.keys(payload).length === 0) {
        throw new Error("没有提供任何需要更新的字段");
      }

      // 2. 发起 PUT 请求，把新的内容告诉后端
      const res = await axios.put(`${BASE_URL}/tasks/${args.task_id}`, payload);
      
      // 3. 把结果返回给你看
      return { message: "任务更新成功", data: res.data };
    } catch (error) {
      // 遇到报错统一处理
      return this.handleError(error);
    }
  }
}

module.exports = UpdateTaskSkill;
