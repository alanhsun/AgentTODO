const API_BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });

  // 代理错误、服务未启动等情况下响应体可能不是 JSON，避免抛出晦涩的解析错误
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = (data && (data.error || data.errors?.join(', '))) || `请求失败 (${res.status} ${res.statusText})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return qs.toString();
}

const json = (method, body, extra) => ({ method, body: JSON.stringify(body), ...extra });

// Tasks
export const tasksApi = {
  list: (params = {}, opts = {}) => request(`/tasks?${toQuery(params)}`, opts),
  get: (id, opts = {}) => request(`/tasks/${id}`, opts),
  create: (body) => request('/tasks', json('POST', body)),
  update: (id, body) => request(`/tasks/${id}`, json('PUT', body)),
  delete: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  batch: (body) => request('/tasks/batch', json('POST', body)),
  // AI endpoints
  summary: (opts = {}) => request('/tasks/summary', opts),
  today: (opts = {}) => request('/tasks/today', opts),
  overdue: (opts = {}) => request('/tasks/overdue', opts),
  // Subtasks
  listSubtasks: (taskId) => request(`/tasks/${taskId}/subtasks`),
  addSubtask: (taskId, title) => request(`/tasks/${taskId}/subtasks`, json('POST', { title })),
  updateSubtask: (taskId, id, data) => request(`/tasks/${taskId}/subtasks/${id}`, json('PUT', data)),
  deleteSubtask: (taskId, id) => request(`/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' }),
  // Notes
  listNotes: (taskId) => request(`/tasks/${taskId}/notes`),
  addNote: (taskId, content, source = 'user') => request(`/tasks/${taskId}/notes`, json('POST', { content, source })),
  deleteNote: (taskId, id) => request(`/tasks/${taskId}/notes/${id}`, { method: 'DELETE' }),
};

// Tags
export const tagsApi = {
  list: (opts = {}) => request('/tags', opts),
  create: (body) => request('/tags', json('POST', body)),
  update: (id, body) => request(`/tags/${id}`, json('PUT', body)),
  delete: (id) => request(`/tags/${id}`, { method: 'DELETE' }),
};

// Backup
export const backupApi = {
  export: () => request('/backup/export'),
  import: (body) => request('/backup/import', json('POST', body)),
};
