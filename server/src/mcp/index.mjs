import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const API_URL = (process.env.AGENTTODO_URL || 'http://127.0.0.1:3301/api').replace(/\/$/, '');
const API_TOKEN = process.env.AGENTTODO_API_TOKEN || '';
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.AGENTTODO_TIMEOUT_MS || '10000', 10);

async function apiRequest(method, path, body, query) {
  const url = new URL(`${API_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(Number.isFinite(REQUEST_TIMEOUT_MS) ? REQUEST_TIMEOUT_MS : 10000),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) {
    const details = Array.isArray(payload.errors) ? `: ${payload.errors.join('; ')}` : '';
    throw new Error(`${payload.error || `AgentTODO returned HTTP ${response.status}`}${details}`);
  }
  return payload;
}

function toolResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

function buildServer() {
  const server = new McpServer({ name: 'agenttodo', version: '1.1.0' });
  const register = (name, description, inputSchema, handler, readOnly = false) => {
    server.registerTool(name, {
      description,
      inputSchema,
      annotations: { readOnlyHint: readOnly, destructiveHint: false },
    }, async (args) => {
      try {
        return toolResult(await handler(args));
      } catch (error) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
          isError: true,
        };
      }
    });
  };

  register(
    'get_daily_summary',
    '获取任务总览、今日未完成发生次数和逾期数量。',
    z.object({}),
    () => apiRequest('GET', '/tasks/summary'),
    true,
  );
  register(
    'get_today_agenda',
    '获取今天实际发生的重复任务以及已逾期任务。',
    z.object({}),
    () => apiRequest('GET', '/tasks/today'),
    true,
  );
  register(
    'get_user_tags',
    '获取已有标签；创建或修改任务前用它规范分类。',
    z.object({}),
    () => apiRequest('GET', '/tags'),
    true,
  );
  register(
    'search_tasks',
    '按标题或描述搜索任务，写入前用它确认任务 ID 并避免重名歧义。',
    z.object({
      search: z.string().min(1),
      status: z.enum(['todo', 'in_progress', 'done']).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    ({ search, status, limit }) => apiRequest('GET', '/tasks', undefined, { search, status, limit }),
    true,
  );
  register(
    'get_task_context',
    '一次获取任务、标签、子任务、笔记、附件元数据和近期重复完成记录。',
    z.object({ task_id: z.number().int().positive() }),
    ({ task_id: taskId }) => apiRequest('GET', `/tasks/${taskId}/context`),
    true,
  );
  register(
    'create_task',
    '创建任务；重复任务从创建日开始，到 due_date 为止。',
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      recurrence: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']).default('none'),
      subtasks: z.array(z.string().min(1).max(255)).optional(),
      tags: z.array(z.number().int().positive()).optional(),
    }),
    (args) => apiRequest('POST', '/tasks', args),
  );
  register(
    'update_task',
    '修改任务基本信息；先搜索并确认 task_id。',
    z.object({
      task_id: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      status: z.enum(['todo', 'in_progress', 'done']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      recurrence: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']).optional(),
      tags: z.array(z.number().int().positive()).optional(),
    }),
    ({ task_id: taskId, ...updates }) => apiRequest('PUT', `/tasks/${taskId}`, updates),
  );
  register(
    'add_task_progress_note',
    '原子记录笔记、完成子任务、更新状态，或完成某一天的重复任务。重试时复用 request_id。',
    z.object({
      task_id: z.number().int().positive(),
      note_content: z.string().min(1).max(10000).optional(),
      complete_subtasks: z.array(z.number().int().positive()).optional(),
      task_status: z.enum(['todo', 'in_progress', 'done']).optional(),
      occurrence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      occurrence_completed: z.boolean().optional(),
      request_id: z.string().min(1).max(100).optional(),
    }),
    ({ task_id: taskId, ...progress }) => apiRequest('POST', `/tasks/${taskId}/progress`, {
      ...progress,
      source: 'ai',
    }),
  );

  return server;
}

const handle = serveStdio(buildServer);
console.error(`AgentTODO MCP ready; API: ${API_URL}`);

process.on('SIGINT', () => {
  void handle.close();
});
