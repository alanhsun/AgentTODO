const CreateTaskSkill = require('../skills/create_task');
const axios = require('axios');

// 让 Jest 接管(Mock)真实的 axios，这样测试时不会真的向网络发请求
jest.mock('axios');

describe('CreateTaskSkill 测试 (创建任务技能)', () => {
  let skill;

  beforeEach(() => {
    skill = new CreateTaskSkill();
    // 清除上一次测试的模拟请求记录
    jest.clearAllMocks();
  });

  test('参数里如果不写 title(标题)，应该被拦截并报错', () => {
    // 没传任何参数
    expect(() => skill.validate()).toThrow('任务标题 (title) 是必填项');
    
    // 传了参数，但没有 title
    const badArgs = { priority: 'high' };
    expect(() => skill.validate(badArgs)).toThrow('任务标题 (title) 是必填项');
  });

  test('如果参数正确，应该把请求发给正确的服务器接口', async () => {
    // 假设后端成功返回了以下数据：
    const mockResponse = { data: { id: 99, title: '买咖啡' } };
    axios.post.mockResolvedValue(mockResponse); // 让假的 axios 直接返回这句话

    // AI 给的指令
    const args = { title: '买咖啡', priority: 'high' };
    
    // 执行技能
    const result = await skill.execute(args);

    // 检查一：确保假 axios 被叫去跑腿了，而且去了正确的地址
    expect(axios.post).toHaveBeenCalledWith('http://localhost:3301/api/tasks', {
      title: '买咖啡',
      priority: 'high',
      recurrence: 'none' // 技能自带的默认值
    }, expect.objectContaining({ timeout: expect.any(Number) })); // 第三个参数是请求配置（超时）

    // 检查二：执行结果是不是我们想要的
    expect(result).toEqual({
      message: '任务创建成功',
      data: mockResponse.data
    });
  });

  test('后端返回校验错误时，把后端给出的具体原因带回给 AI', async () => {
    const error = new Error('Request failed with status code 400');
    error.response = { status: 400, data: { errors: ['Priority must be one of: low, medium, high, urgent'] } };
    axios.post.mockRejectedValue(error);

    const result = await skill.execute({ title: '买咖啡', priority: 'super' });
    expect(result).toEqual({
      status: 'error',
      skill: 'create_task',
      http_status: 400,
      message: 'Priority must be one of: low, medium, high, urgent',
      details: ['Priority must be one of: low, medium, high, urgent'],
    });
  });
});
