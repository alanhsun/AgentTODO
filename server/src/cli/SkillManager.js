const fs = require('fs');
const path = require('path');

/**
 * 技能管理器 (SkillManager)
 * 就像一个“工具管理员”，负责注册、卸载和热加载技能。
 */
class SkillManager {
  /**
   * @param {string} skillsDir - 技能文件夹路径
   * @param {Object} [options]
   * @param {Function|null} [options.log] - 普通日志输出函数，传 null 静默（单次执行模式下保证 stdout 只有 JSON）
   * @param {Function|null} [options.error] - 错误日志输出函数
   */
  constructor(skillsDir, options = {}) {
    this.skillsDir = skillsDir;
    // 存储所有已加载的技能，格式为 { "skill_name": SkillInstance }
    this.skills = new Map();
    this.log = options.log === undefined ? console.log : options.log;
    this.error = options.error === undefined ? console.error : options.error;
  }

  _log(...args) {
    if (this.log) this.log(...args);
  }

  _error(...args) {
    if (this.error) this.error(...args);
  }

  /**
   * 加载指定目录下的所有技能
   */
  loadSkills() {
    if (!fs.existsSync(this.skillsDir)) return;

    const files = fs.readdirSync(this.skillsDir).sort();
    for (const file of files) {
      if (file.endsWith('.js')) {
        this.registerSkill(file);
      }
    }
  }

  /**
   * 注册单个技能
   * @param {string} filename - 技能文件名 (如 get_daily_summary.js)
   */
  registerSkill(filename) {
    const fullPath = path.join(this.skillsDir, filename);
    try {
      // 核心机制：如果是热加载，需要先清除 require 缓存
      const resolved = require.resolve(fullPath);
      if (require.cache[resolved]) {
        delete require.cache[resolved];
      }

      // 引入技能类并实例化
      const SkillClass = require(fullPath);
      if (typeof SkillClass !== 'function') {
        throw new Error('技能文件必须导出一个类 (module.exports = XxxSkill)');
      }
      const skillInstance = new SkillClass();
      if (!skillInstance.name || typeof skillInstance.execute !== 'function') {
        throw new Error('技能必须包含 name 属性和 execute 方法');
      }
      if (this.skills.has(skillInstance.name)) {
        this._error(`[SkillManager] 技能名称重复，${filename} 将覆盖已加载的 ${skillInstance.name}`);
      }

      // 将技能存入管理器
      this.skills.set(skillInstance.name, skillInstance);
      this._log(`[SkillManager] 技能已加载: ${skillInstance.name}`);
    } catch (error) {
      this._error(`[SkillManager] 无法加载技能文件 ${filename}:`, error.message);
    }
  }

  /**
   * 卸载技能
   * @param {string} skillName - 技能名称
   */
  unregisterSkill(skillName) {
    if (this.skills.has(skillName)) {
      this.skills.delete(skillName);
      this._log(`[SkillManager] 技能已卸载: ${skillName}`);
      return true;
    }
    return false;
  }

  /**
   * 热加载机制：重新加载所有的技能
   */
  reloadAll() {
    this._log('[SkillManager] 正在热加载所有技能...');
    this.skills.clear();
    this.loadSkills();
    this._log('[SkillManager] 热加载完成。');
  }

  /**
   * 获取某个技能实例
   */
  getSkill(skillName) {
    return this.skills.get(skillName);
  }

  /**
   * 获取所有可用技能列表（用于生成帮助信息）
   */
  listSkills() {
    const list = [];
    for (const skill of this.skills.values()) {
      list.push({ name: skill.name, description: skill.description, parameters: skill.parameters || {} });
    }
    return list;
  }

  /**
   * 执行技能：参数校验 + 执行，统一返回结果对象。
   * 校验失败或执行抛错时返回 { status: 'error', ... }，不会抛异常。
   */
  async runSkill(skillName, args = {}) {
    const skill = this.getSkill(skillName);
    if (!skill) {
      return { status: 'error', skill: skillName, message: `找不到技能 "${skillName}"，可用技能: ${[...this.skills.keys()].join(', ')}` };
    }
    try {
      const validArgs = skill.validate(args); // 1. 验证参数
      return await skill.execute(validArgs); // 2. 执行逻辑
    } catch (error) {
      return typeof skill.handleError === 'function'
        ? skill.handleError(error)
        : { status: 'error', skill: skillName, message: error.message };
    }
  }
}

module.exports = SkillManager;
