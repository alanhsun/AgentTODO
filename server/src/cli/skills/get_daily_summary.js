const BaseSkill = require('../BaseSkill');
const axios = require('axios');

// 为什么需要 BASE_URL？因为我们的 CLI 相当于一个遥控器，它需要知道服务器（主机）的具体地址才能发指令。
const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3300/api';

/**
 * 获取每日总结技能 (GetDailySummarySkill)
 * 作用：让 AI 助手获取当前任务的整体统计信息（总数、今日待办数、逾期数），了解你的整体进度。
 */
class GetDailySummarySkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_daily_summary'; // 这是你在命令行里敲的命令名字
    this.description = '获取当前任务的完整统计概览（总数、今日待办数、逾期数统计）。';
  }

  /**
   * 执行逻辑：真正干活的地方。去后端拉取数据。
   * @param {Object} args - 验证后的参数（此技能不需要额外参数）
   */
  async execute(args) {
    try {
      // 为什么用 axios？因为它是 Node.js 里发 HTTP 请求最方便的工具。
      // 它就像一个可靠的快递员，帮我们去后端的 /tasks/summary 接口取数据包裹。
      const res = await axios.get(`${BASE_URL}/tasks/summary`);
      return res.data;
    } catch (error) {
      // 为什么需要 handleError？为了捕获网络断开或者服务器死机等意外，并友好地提示你，而不是让整个程序崩溃。
      return this.handleError(error);
    }
  }
}

module.exports = GetDailySummarySkill;
