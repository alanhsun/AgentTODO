const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class GetUserTagsSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_user_tags';
    this.description = '获取全部可用标签。在创建任务前应参考已有标签。';
  }

  async execute() {
    try {
      const res = await httpClient.get('/tags');
      return res.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = GetUserTagsSkill;
