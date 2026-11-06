const BaseSkill = require('../BaseSkill');
const axios = require('axios');
const { BASE_URL, REQUEST_OPTIONS } = require('../config');

const FILTER_KEYS = ['search', 'status', 'priority', 'tag', 'due_before', 'due_after', 'sort', 'order', 'page'];
const DEFAULT_LIMIT = 20;

/**
 * 搜索任务技能 (SearchTasksSkill)
 * 作用：按关键词、状态、优先级、标签或日期范围查找任务。
 * 当用户说"把写报告那个任务标记完成"时，AI 需要先用它找到任务 ID。
 */
class SearchTasksSkill extends BaseSkill {
  constructor() {
    super();
    this.name = 'search_tasks';
    this.description = '按关键词 / 状态 / 优先级 / 标签 / 日期范围搜索任务，用于在更新前定位任务 ID。';
    this.parameters = {
      search: '可选，匹配标题和描述的关键词',
      status: '可选，todo | in_progress | done，多个用逗号分隔',
      priority: '可选，low | medium | high | urgent，多个用逗号分隔',
      tag: '可选，标签 ID，多个用逗号分隔',
      due_before: '可选，YYYY-MM-DD',
      due_after: '可选，YYYY-MM-DD',
      sort: '可选，created_at | updated_at | due_date | priority | title | status',
      order: '可选，asc | desc',
      limit: `可选，返回条数，默认 ${DEFAULT_LIMIT}`,
    };
  }

  validate(args) {
    return args && typeof args === 'object' ? args : {};
  }

  async execute(args) {
    try {
      const params = { limit: args.limit || DEFAULT_LIMIT };
      for (const key of FILTER_KEYS) {
        const value = args[key];
        if (value === undefined || value === null || value === '') continue;
        params[key] = Array.isArray(value) ? value.join(',') : value;
      }
      const res = await axios.get(`${BASE_URL}/tasks`, { ...REQUEST_OPTIONS, params });
      const { data, pagination } = res.data;
      // 精简输出，减少 AI 上下文占用
      return {
        total: pagination.total,
        returned: data.length,
        tasks: data.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          recurrence: t.recurrence,
          tags: (t.tags || []).map((tag) => tag.name),
          subtask_progress: t.subtask_progress,
        })),
      };
    } catch (error) {
      return this.handleError(error);
    }
  }
}

module.exports = SearchTasksSkill;
