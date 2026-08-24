const BaseSkill = require('../BaseSkill');
const httpClient = require('../httpClient');

class AddTaskProgressNoteSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'add_task_progress_note';
    this.description = '记录任务进展、障碍，或标记子任务或主任务完成状态。';
  }

  validate(args) {
    if (!args || !args.task_id) {
      throw new Error('任务ID (task_id) 是必填项');
    }
    if (!args.note_content) {
      throw new Error('进展描述 (note_content) 是必填项');
    }
    return args;
  }

  async execute(args) {
    try {
      const taskId = args.task_id;
      const response = await httpClient.post(`/tasks/${taskId}/progress`, {
        note_content: args.note_content,
        complete_subtasks: args.complete_subtasks,
        task_status: args.task_status,
        occurrence_date: args.occurrence_date,
        occurrence_completed: args.occurrence_completed,
        request_id: args.request_id,
        source: 'ai',
      });
      return { message: '进度记录成功', data: response.data };
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = AddTaskProgressNoteSkill;
