const path = require('path');
const fs = require('fs');
const SkillManager = require('../SkillManager');

describe('SkillManager 测试 (技能管理员)', () => {
  // 我们专门建一个测试用的文件夹，里面放一个假技能
  const testSkillsDir = path.join(__dirname, 'test_skills');
  let manager;

  // 在所有测试开始前，准备好测试环境（建文件夹和假文件）
  beforeAll(() => {
    if (!fs.existsSync(testSkillsDir)) {
      fs.mkdirSync(testSkillsDir, { recursive: true });
    }
    
    // 写一个假技能文件 dummy.js
    const dummyCode = `
      const BaseSkill = require('../../BaseSkill');
      class DummySkill extends BaseSkill {
        constructor() { super(); this.name = 'dummy'; this.description = '测试用假技能'; }
        async execute() { return 'dummy_result'; }
      }
      module.exports = DummySkill;
    `;
    fs.writeFileSync(path.join(testSkillsDir, 'dummy.js'), dummyCode);
  });

  // 在所有测试结束后，打扫战场（删掉测试文件夹）
  afterAll(() => {
    fs.rmSync(testSkillsDir, { recursive: true, force: true });
  });

  // 每次测试前，重新聘请一个技能管理员
  beforeEach(() => {
    manager = new SkillManager(testSkillsDir);
  });

  test('能够成功从文件夹中加载技能', () => {
    manager.loadSkills();
    expect(manager.skills.size).toBe(1); // 应该加载了刚刚写的假技能
    expect(manager.getSkill('dummy')).toBeDefined(); // 应该能通过名字找到它
  });

  test('能够列出所有技能菜单', () => {
    manager.loadSkills();
    const list = manager.listSkills();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('dummy');
    expect(list[0].description).toBe('测试用假技能');
  });

  test('能够卸载不用的技能', () => {
    manager.loadSkills();
    const result = manager.unregisterSkill('dummy');
    expect(result).toBe(true); // 卸载成功返回 true
    expect(manager.skills.size).toBe(0); // 技能库应该空了
  });
});
