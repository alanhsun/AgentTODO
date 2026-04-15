const BaseSkill = require('../BaseSkill');
const axios = require('axios');

// 为什么需要 BASE_URL？因为我们的 CLI 相当于一个遥控器，它需要知道服务器（主机）的具体地址才能发指令。
const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3300/api';

/**
 * 创建任务技能 (CreateTaskSkill)
 * 作用：在系统中新建一个任务。就像给跑腿小哥下发一张新的订单。
 */
class CreateTaskSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'create_task'; // 这是你在命令行里敲的命令名字
    this.description = '创建一个新任务或周期性习惯。';
  }

  /**
   * 参数验证：检查用户给的指令参数对不对。
   * 为什么要做这一步？为了防止给了空订单或者格式不对的订单，导致后端直接报错。
   * @param {Object} args - 你在命令行传入的参数
   */
  validate(args) {
    // 必须要有个标题才能叫任务，否则拦下来并报错
    if (!args || !args.title) {
      throw new Error('任务标题 (title) 是必填项');
    }
    return args;
  }

  /**
   * 执行逻辑：真正干活的地方。
   */
  async execute(args) {
    try {
      // 1. 整理我们要发给后端的包裹（数据 payload）
      const payload = {
        title: args.title,
        priority: args.priority || 'medium', // 默认优先级是中等
        recurrence: args.recurrence || 'none', // 默认不重复
      };
      
      // 如果有其他可选参数（比如截止日期、子任务），也一并塞进包裹里
      if (args.due_date) payload.due_date = args.due_date;
      if (args.subtasks) payload.subtasks = args.subtasks;
      if (args.tags) payload.tags = args.tags;

      // 2. 为什么用 axios？它像是一个可靠的快递员，帮我们把包裹发给后端的 /tasks 接口。
      const res = await axios.post(`${BASE_URL}/tasks`, payload);
      
      // 3. 返回成功的结果给命令行界面
      return { message: "任务创建成功", data: res.data };
    } catch (error) {
      // 为什么需要 handleError？为了捕获网络断开等意外，并友好地提示你。
      return this.handleError(error);
    }
  }
}

module.exports = CreateTaskSkill;
