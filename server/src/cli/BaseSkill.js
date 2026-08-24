class BaseSkill {
  constructor() {
    this.name = 'base_skill';
    this.description = '这是一个基础技能';
  }

  validate(args) {
    return args;
  }

  async execute() {
    throw new Error('必须在子类中实现 execute 方法');
  }

  handleError(error) {
    return {
      status: 'error',
      skill: this.name,
      message: error.message || '未知错误',
    };
  }
}

module.exports = BaseSkill;
