const BaseSkill = require('../BaseSkill');

/**
 * Ping 测试技能
 * 这是一个非常简单的技能，用来测试 CLI 通信是否畅通。
 * 相当于你喊了一声“Ping”，它就回一句“Pong”。
 */
class PingSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'ping';
    this.description = '测试 CLI 通信是否正常的简单技能';
  }

  /**
   * 执行逻辑
   */
  async execute(args) {
    // 简单地把收到的参数和当前时间返回
    return {
      reply: 'pong!',
      you_sent: args,
      time: new Date().toISOString()
    };
  }
}

module.exports = PingSkill;
