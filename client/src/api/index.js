const API_BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.errors?.join(', ') || 'Request failed');
  }
  return data;
}

// Tasks
export const tasksApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, v); });
    return request(`/tasks?${qs.toString()}`);
  },
  get: (id) => request(`/tasks/${id}`),
  create: (body) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  batch: (body) => request('/tasks/batch', { method: 'POST', body: JSON.stringify(body) }),
  // AI endpoints
  summary: () => request('/tasks/summary'),
  today: () => request('/tasks/today'),
  overdue: () => request('/tasks/overdue'),
  // Subtasks
  listSubtasks: (taskId) => request(`/tasks/${taskId}/subtasks`),
  addSubtask: (taskId, title) => request(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
  updateSubtask: (taskId, id, data) => request(`/tasks/${taskId}/subtasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubtask: (taskId, id) => request(`/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' }),
  // Notes
  listNotes: (taskId) => request(`/tasks/${taskId}/notes`),
  addNote: (taskId, content, source = 'user') => request(`/tasks/${taskId}/notes`, { method: 'POST', body: JSON.stringify({ content, source }) }),
  deleteNote: (taskId, id) => request(`/tasks/${taskId}/notes/${id}`, { method: 'DELETE' }),
};

// Tags
export const tagsApi = {
  list: () => request('/tags'),
  create: (body) => request('/tags', { method: 'POST', body: JSON.stringify(body) }),
  update: (id, body) => request(`/tags/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id) => request(`/tags/${id}`, { method: 'DELETE' }),
};

// Backup
export const backupApi = {
  export: () => request('/backup/export'),
  import: (body) => request('/backup/import', { method: 'POST', body: JSON.stringify(body) }),
};

