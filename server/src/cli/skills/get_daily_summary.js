const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class GetDailySummarySkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_daily_summary';
    this.description = '获取当前任务的完整统计概览（总数、今日待办数、逾期数统计）。';
  }

  async execute() {
    try {
      const res = await httpClient.get('/tasks/summary');
      return res.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = GetDailySummarySkill;
