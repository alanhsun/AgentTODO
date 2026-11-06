const BaseSkill = require('../BaseSkill');
const axios = require('axios');
const { BASE_URL, REQUEST_OPTIONS } = require('../config');

const VALID_STATUSES = ['todo', 'in_progress', 'done'];

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
    this.parameters = {
      task_id: '必填，任务 ID',
      note_content: '必填，进展日志内容',
      complete_subtasks: '可选，要标记完成的子任务 ID 数组（可通过 get_task / get_today_agenda 获取）',
      task_status: '可选，todo | in_progress | done',
    };
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
    if (args.task_status !== undefined && !VALID_STATUSES.includes(args.task_status)) {
      throw new Error(`task_status 必须是 ${VALID_STATUSES.join(' | ')} 之一`);
    }
    if (args.complete_subtasks !== undefined && !Array.isArray(args.complete_subtasks)) {
      throw new Error('complete_subtasks 必须是子任务 ID 数组');
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
      }, REQUEST_OPTIONS);
      results.push({ action: "note_added", data: noteRes.data });

      // 第二件事：如果有需要打对勾的子任务，逐个打勾；单个失败不影响其它子任务，并如实汇报
      if (Array.isArray(args.complete_subtasks) && args.complete_subtasks.length > 0) {
        const completed = [];
        const failed = [];
        for (const sid of args.complete_subtasks) {
          try {
            await axios.put(`${BASE_URL}/tasks/${taskId}/subtasks/${sid}`, { completed: true }, REQUEST_OPTIONS);
            completed.push(sid);
          } catch (err) {
            failed.push({ id: sid, error: this.handleError(err).message });
          }
        }
        results.push({ action: "subtasks_completed", ids: completed, ...(failed.length ? { failed } : {}) });
      }

      // 第三件事：如果主任务整体做完了或者刚开始，更新整个任务的状态
      if (args.task_status) {
        const statusRes = await axios.put(`${BASE_URL}/tasks/${taskId}`, { status: args.task_status }, REQUEST_OPTIONS);
        const entry = { action: "status_updated", status: args.task_status };
        // 周期任务完成后，后端会自动生成下一次实例
        if (statusRes && statusRes.data && statusRes.data.next_occurrence) {
          entry.next_occurrence = statusRes.data.next_occurrence;
        }
        results.push(entry);
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
