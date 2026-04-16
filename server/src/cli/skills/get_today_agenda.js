const BaseSkill = require('../BaseSkill');
const axios = require('axios');

// 为什么需要 BASE_URL？因为我们需要知道服务器的具体地址才能发请求。
const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3301/api';

/**
 * 获取今日待办技能 (GetTodayAgendaSkill)
 * 作用：查出你今天必须完成的任务，以及那些昨天忘了做（已经逾期）的任务。
 */
class GetTodayAgendaSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_today_agenda'; // 命令行调用的名字
    this.description = '获取今日到期以及已逾期的所有任务详情（含子任务进度）。';
  }

  /**
   * 执行逻辑：真正干活的地方。
   */
  async execute(args) {
    try {
      // 去后端的 /tasks/today 接口获取今天的任务列表
      const res = await axios.get(`${BASE_URL}/tasks/today`);
      return res.data;
    } catch (error) {
      // 遇到报错，交给基类统一处理，保证输出格式一致
      return this.handleError(error);
    }
  }
}

module.exports = GetTodayAgendaSkill;
