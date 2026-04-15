const BaseSkill = require('../BaseSkill');

describe('BaseSkill 测试 (基础技能模板)', () => {
  let skill;

  // 每次测试前，重新创建一个新的技能实例
  beforeEach(() => {
    skill = new BaseSkill();
  });

  test('默认应该有名字和描述', () => {
    expect(skill.name).toBe('base_skill');
    expect(skill.description).toBeDefined();
  });

  test('validate 方法默认应该原样返回传入的参数', () => {
    const args = { title: '买咖啡' };
    expect(skill.validate(args)).toEqual(args);
  });

  test('execute 方法默认应该抛出错误 (提醒子类必须实现)', async () => {
    // 因为执行方法是个异步(Promise)，所以用 rejects 捕获报错
    await expect(skill.execute({})).rejects.toThrow('必须在子类中实现 execute 方法');
  });

  test('handleError 能够把报错信息打包成漂亮的格式', () => {
    const error = new Error('网络断了');
    const result = skill.handleError(error);

    expect(result).toEqual({
      status: 'error',
      skill: 'base_skill',
      message: '网络断了'
    });
  });
});
