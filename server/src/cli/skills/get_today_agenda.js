const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class GetTodayAgendaSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_today_agenda';
    this.description = '获取今日到期以及已逾期的所有任务详情（含子任务进度）。';
  }

  async execute() {
    try {
      const res = await httpClient.get('/tasks/today');
      return res.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = GetTodayAgendaSkill;
