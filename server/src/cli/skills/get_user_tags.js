const BaseSkill = require('../BaseSkill');
const axios = require('axios');

// 为什么需要 BASE_URL？有了它，我们就知道包裹该往哪个地址寄了。
const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3301/api';

/**
 * 获取可用标签技能 (GetUserTagsSkill)
 * 作用：查出目前系统里存在的所有标签（比如：工作、学习、生活）。
 * 创建新任务前，可以先看看有哪些标签能用，免得重复创建。
 */
class GetUserTagsSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'get_user_tags'; // 命令行调用的名字
    this.description = '获取全部可用标签。在创建任务前应参考已有标签。';
  }

  /**
   * 执行逻辑：真正干活的地方。
   */
  async execute(args) {
    try {
      // 找后端要所有的标签数据
      const res = await axios.get(`${BASE_URL}/tags`);
      return res.data;
    } catch (error) {
      // 遇到报错，交给基类统一处理
      return this.handleError(error);
    }
  }
}

module.exports = GetUserTagsSkill;
