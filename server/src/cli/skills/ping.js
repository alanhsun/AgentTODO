const BaseSkill = require('../BaseSkill');

class PingSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'ping';
    this.description = '测试 CLI 通信是否正常的简单技能';
  }

  execute(args) {
    return {
      reply: 'pong!',
      you_sent: args,
      time: new Date().toISOString(),
    };
  }
}

module.exports = PingSkill;
