const fs = require('fs');
const path = require('path');

class SkillManager {
  constructor(skillsDir) {
    this.skillsDir = skillsDir;
    this.skills = new Map();
  }

  loadSkills() {
    if (!fs.existsSync(this.skillsDir)) return;

    fs.readdirSync(this.skillsDir)
      .filter((file) => file.endsWith('.js'))
      .forEach((file) => this.registerSkill(file));
  }

  registerSkill(filename) {
    const fullPath = path.join(this.skillsDir, filename);
    try {
      const resolvedPath = require.resolve(fullPath);
      delete require.cache[resolvedPath];
      const SkillClass = require(resolvedPath);
      const skillInstance = new SkillClass();
      this.skills.set(skillInstance.name, skillInstance);
      console.log(`[SkillManager] 技能已加载: ${skillInstance.name}`);
    } catch (error) {
      console.error(`[SkillManager] 无法加载技能文件 ${filename}:`, error.message);
    }
  }

  unregisterSkill(skillName) {
    if (this.skills.has(skillName)) {
      this.skills.delete(skillName);
      console.log(`[SkillManager] 技能已卸载: ${skillName}`);
      return true;
    }
    return false;
  }

  reloadAll() {
    console.log('[SkillManager] 正在热加载所有技能...');
    this.skills.clear();
    this.loadSkills();
    console.log('[SkillManager] 热加载完成。');
  }

  getSkill(skillName) {
    return this.skills.get(skillName);
  }

  listSkills() {
    return [...this.skills.values()].map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
  }
}

module.exports = SkillManager;
