const BaseSkill = require('../BaseSkill');
const axios = require('axios');

// 为什么需要 BASE_URL？这是后端服务的主机地址。
const BASE_URL = process.env.AGENTTODO_URL || 'http://localhost:3301/api';

/**
 * 记录任务进度技能 (AddTaskProgressNoteSkill)
 * 作用：在你做任务的过程中，记录你遇到了什么困难，或者把子任务打上对勾。
 * 就像是跑腿小哥向你实时汇报“我已经买好咖啡了，正准备送去”。
 */
class AddTaskProgressNoteSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'add_task_progress_note'; // 命令行调用的名字
    this.description = '记录任务进展、障碍，或标记子任务或主任务完成状态。';
  }

  /**
   * 参数验证：检查用户给的指令参数对不对。
   * 为什么要做这步？因为必须要知道给哪个任务（task_id）记笔记（note_content），不然没法工作。
   */
  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    if (!args.note_content) {
      throw new Error('进展描述 (note_content) 是必填项');
    }
    return args;
  }

  /**
   * 执行逻辑：真正干活的地方。这个技能可能会干好几件事情（比如记笔记的同时打对勾）。
   */
  async execute(args) {
    try {
      // 这个数组用来记录我们到底干了哪些活儿
      const results = [];
      const taskId = args.task_id;
      
      // 第一件事：给任务加一条笔记
      const noteRes = await axios.post(`${BASE_URL}/tasks/${taskId}/notes`, {
        content: args.note_content,
        source: 'ai' // 标记这是 AI（或命令行）写的笔记
      });
      results.push({ action: "note_added", data: noteRes.data });

      // 第二件事：如果有需要打对勾的子任务，就循环帮它们打上对勾
      if (args.complete_subtasks && Array.isArray(args.complete_subtasks)) {
        for (const sid of args.complete_subtasks) {
          // 对每个子任务发送更新请求
          await axios.put(`${BASE_URL}/tasks/${taskId}/subtasks/${sid}`, { completed: true });
        }
        results.push({ action: "subtasks_completed", ids: args.complete_subtasks });
      }

      // 第三件事：如果主任务整体做完了或者刚开始，更新整个任务的状态
      if (args.task_status) {
        await axios.put(`${BASE_URL}/tasks/${taskId}`, { status: args.task_status });
        results.push({ action: "status_updated", status: args.task_status });
      }

      // 最后把做完的活儿汇报给你
      return { message: "进度记录成功", actions: results };
    } catch (error) {
      // 捕获网络异常等错误，漂亮地打印出来
      return this.handleError(error);
    }
  }
}

module.exports = AddTaskProgressNoteSkill;
