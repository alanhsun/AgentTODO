const fs = require('fs');
const path = require('path');

/**
 * 技能管理器 (SkillManager)
 * 就像一个“工具管理员”，负责注册、卸载和热加载技能。
 */
class SkillManager {
  constructor(skillsDir) {
    this.skillsDir = skillsDir;
    // 存储所有已加载的技能，格式为 { "skill_name": SkillInstance }
    this.skills = new Map();
  }

  /**
   * 加载指定目录下的所有技能
   */
  loadSkills() {
    if (!fs.existsSync(this.skillsDir)) return;

    const files = fs.readdirSync(this.skillsDir);
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
      if (require.cache[require.resolve(fullPath)]) {
        delete require.cache[require.resolve(fullPath)];
      }

      // 引入技能类并实例化
      const SkillClass = require(fullPath);
      const skillInstance = new SkillClass();

      // 将技能存入管理器
      this.skills.set(skillInstance.name, skillInstance);
      console.log(`[SkillManager] 技能已加载: ${skillInstance.name}`);
    } catch (error) {
      console.error(`[SkillManager] 无法加载技能文件 ${filename}:`, error.message);
    }
  }

  /**
   * 卸载技能
   * @param {string} skillName - 技能名称
   */
  unregisterSkill(skillName) {
    if (this.skills.has(skillName)) {
      this.skills.delete(skillName);
      console.log(`[SkillManager] 技能已卸载: ${skillName}`);
      return true;
    }
    return false;
  }

  /**
   * 热加载机制：重新加载所有的技能
   */
  reloadAll() {
    console.log('[SkillManager] 正在热加载所有技能...');
    this.skills.clear();
    this.loadSkills();
    console.log('[SkillManager] 热加载完成。');
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
    for (const [name, skill] of this.skills.entries()) {
      list.push({ name: skill.name, description: skill.description });
    }
    return list;
  }
}

module.exports = SkillManager;
