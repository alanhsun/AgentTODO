/**
 * 基础技能类 (BaseSkill)
 * 这是一个类似于“工具箱中通用工具的模板”。
 * 所有的具体技能（比如创建任务、查询任务）都需要继承这个模板。
 */
class BaseSkill {
  constructor() {
    this.name = 'base_skill';
    this.description = '这是一个基础技能';
  }

  /**
   * 参数验证：检查用户给的指令参数对不对。
   * @param {Object} args - 用户传入的参数
   * @returns {Object} 验证后、或者补全默认值的参数
   */
  validate(args) {
    return args;
  }

  /**
   * 执行逻辑：技能具体要做的事情。子类必须实现这个方法。
   * @param {Object} args - 验证后的参数
   * @returns {Promise<Object>} 执行结果
   */
  async execute(args) {
    throw new Error('必须在子类中实现 execute 方法');
  }

  /**
   * 错误处理：当技能执行失败时，统一的错误格式化。
   * @param {Error} error - 捕获到的错误
   * @returns {Object} 格式化后的错误信息
   */
  handleError(error) {
    return {
      status: 'error',
      skill: this.name,
      message: error.message || '未知错误',
    };
  }
}

module.exports = BaseSkill;
