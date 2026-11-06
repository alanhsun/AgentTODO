import { useState, useEffect } from 'react';
import { tasksApi } from '../api';

const PRIORITY_OPTIONS = [
  { value: 'low', label: '低', color: 'var(--priority-low)' },
  { value: 'medium', label: '中', color: 'var(--priority-medium)' },
  { value: 'high', label: '高', color: 'var(--priority-high)' },
  { value: 'urgent', label: '紧急', color: 'var(--priority-urgent)' },
];

const STATUS_OPTIONS = [
  { value: 'todo', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'done', label: '已完成' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const dateOnly = (value) => (value ? value.split('T')[0] : '');

function initialForm(task) {
  return {
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    due_date: dateOnly(task?.due_date),
    recurrence: task?.recurrence || 'none',
    recurrence_end: dateOnly(task?.recurrence_end),
    tags: task?.tags?.map((t) => t.id) || [],
    subtasks: [],
  };
}

/**
 * 任务表单（新建 / 编辑）。
 * 父组件应通过 key={task?.id ?? 'new'} 渲染，以便切换任务时重新初始化表单状态。
 *
 * @param {object} props
 * @param {object|null} props.task - 编辑中的任务；为空表示新建
 * @param {(data: object) => Promise<void>} props.onSubmit
 * @param {() => void} props.onCancel
 * @param {(task: object) => Promise<void>} [props.onDelete]
 * @param {() => void} [props.onChanged] - 编辑模式下子任务 / 笔记发生变化时通知父组件刷新列表
 */
export default function TaskForm({ task, tags, onSubmit, onCancel, onDelete, onChanged, liveVersion = 0 }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState(() => initialForm(task));
  const [newSubtask, setNewSubtask] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  // 编辑模式：一次请求拉取子任务与进展笔记（SSE 推送 liveVersion 递增时自动同步）
  useEffect(() => {
    if (!task) return undefined;
    const controller = new AbortController();
    tasksApi.get(task.id, { signal: controller.signal })
      .then((detail) => {
        setSubtasks(detail.subtasks || []);
        setNotes(detail.notes || []);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(`加载任务详情失败: ${err.message}`);
      });
    return () => controller.abort();
  }, [task, liveVersion]);

  // Esc 关闭弹窗
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const data = {
      ...form,
      title: form.title.trim(),
      due_date: form.due_date || null,
      recurrence_end: form.recurrence !== 'none' ? (form.recurrence_end || null) : null,
    };
    // Only include subtasks on create (edit mode manages them live via API)
    if (isEdit) delete data.subtasks;
    setSaving(true);
    setError('');
    try {
      await onSubmit(data);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const toggleTag = (tagId) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter((id) => id !== tagId)
        : [...prev.tags, tagId],
    }));
  };

  // ---- Subtasks ----
  const addSubtask = async () => {
    const title = newSubtask.trim();
    if (!title) return;
    if (!isEdit) {
      setForm((prev) => ({ ...prev, subtasks: [...prev.subtasks, title] }));
      setNewSubtask('');
      return;
    }
    try {
      const created = await tasksApi.addSubtask(task.id, title);
      setSubtasks((prev) => [...prev, created]);
      setNewSubtask('');
      onChanged?.();
    } catch (err) {
      setError(`添加子任务失败: ${err.message}`);
    }
  };

  const removeDraftSubtask = (index) => {
    setForm((prev) => ({ ...prev, subtasks: prev.subtasks.filter((_, i) => i !== index) }));
  };

  const toggleSubtask = async (subtask) => {
    const completed = !subtask.completed;
    setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, completed } : s)));
    try {
      await tasksApi.updateSubtask(task.id, subtask.id, { completed });
      onChanged?.();
    } catch (err) {
      setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? { ...s, completed: !completed } : s)));
      setError(`更新子任务失败: ${err.message}`);
    }
  };

  const deleteSubtask = async (subtask) => {
    try {
      await tasksApi.deleteSubtask(task.id, subtask.id);
      setSubtasks((prev) => prev.filter((s) => s.id !== subtask.id));
      onChanged?.();
    } catch (err) {
      setError(`删除子任务失败: ${err.message}`);
    }
  };

  // ---- Notes ----
  const handleAddNote = async () => {
    if (!newNote.trim() || !task) return;
    try {
      const addedNote = await tasksApi.addNote(task.id, newNote.trim(), 'user');
      setNotes((prev) => [addedNote, ...prev]);
      setNewNote('');
    } catch (err) {
      setError(`添加记录失败: ${err.message}`);
    }
  };

  const handleDeleteNote = async (note) => {
    if (!confirm('确定删除这条记录？')) return;
    try {
      await tasksApi.deleteNote(task.id, note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      setError(`删除记录失败: ${err.message}`);
    }
  };

  const completedCount = subtasks.filter((s) => s.completed).length;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="task-form-title">
        <div className="modal-header">
          <h2 id="task-form-title">{isEdit ? '编辑任务' : '新建任务'}</h2>
          <button className="btn-icon" onClick={onCancel} aria-label="关闭">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-body">
          <div className="form-group">
            <label htmlFor="task-title">标题</label>
            <input
              id="task-title"
              type="text"
              value={form.title}
              onChange={update('title')}
              placeholder="输入任务标题..."
              maxLength={255}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="task-desc">描述</label>
            <textarea
              id="task-desc"
              value={form.description}
              onChange={update('description')}
              placeholder="输入任务描述（可选）..."
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-status">状态</label>
              <select id="task-status" value={form.status} onChange={update('status')}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="task-priority">优先级</label>
              <select id="task-priority" value={form.priority} onChange={update('priority')}>
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="task-due">截止日期</label>
              <input id="task-due" type="date" value={form.due_date} onChange={update('due_date')} />
            </div>
          </div>

          {/* Recurrence */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-recurrence">重复</label>
              <select id="task-recurrence" value={form.recurrence} onChange={update('recurrence')}>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {form.recurrence !== 'none' && (
              <div className="form-group">
                <label htmlFor="task-recurrence-end">重复截止</label>
                <input
                  id="task-recurrence-end"
                  type="date"
                  value={form.recurrence_end}
                  onChange={update('recurrence_end')}
                  placeholder="可选"
                />
              </div>
            )}
          </div>
          {form.recurrence !== 'none' && (
            <p className="form-hint">完成后将自动生成下一次任务（复制标签与子任务）。</p>
          )}

          {tags && tags.length > 0 && (
            <div className="form-group">
              <label>标签</label>
              <div className="tag-selector">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`tag-chip ${form.tags.includes(tag.id) ? 'selected' : ''}`}
                    style={{ '--tag-color': tag.color }}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subtasks */}
          <div className="form-group">
            <label>
              子任务
              {isEdit && subtasks.length > 0 && (
                <span className="label-meta"> {completedCount}/{subtasks.length}</span>
              )}
            </label>
            <div className="subtask-input-row">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="添加子任务..."
                maxLength={255}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
              />
              <button type="button" className="btn btn-sm btn-ghost" onClick={addSubtask}>+</button>
            </div>

            {!isEdit && form.subtasks.length > 0 && (
              <ul className="subtask-list">
                {form.subtasks.map((s, i) => (
                  <li key={`${i}-${s}`} className="subtask-item">
                    <span>○ {s}</span>
                    <button type="button" className="btn-icon-sm" onClick={() => removeDraftSubtask(i)} aria-label="移除子任务">✕</button>
                  </li>
                ))}
              </ul>
            )}

            {isEdit && subtasks.length > 0 && (
              <ul className="subtask-list">
                {subtasks.map((s) => (
                  <li key={s.id} className={`subtask-item ${s.completed ? 'done' : ''}`}>
                    <label className="subtask-check">
                      <input type="checkbox" checked={s.completed} onChange={() => toggleSubtask(s)} />
                      <span>{s.title}</span>
                    </label>
                    <button type="button" className="btn-icon-sm" onClick={() => deleteSubtask(s)} aria-label="删除子任务">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* History / Notes - only on edit */}
          {isEdit && (
            <div className="form-group task-history">
              <label>任务进度与纪要</label>

              <div className="subtask-input-row">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="追加一条手写进度或备注..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <button type="button" className="btn btn-sm btn-ghost" onClick={handleAddNote}>
                  记录
                </button>
              </div>

              {notes.length > 0 ? (
                <ul className="notes-list">
                  {notes.map((note) => (
                    <li key={note.id} className={`note-item ${note.source === 'ai' ? 'from-ai' : ''}`}>
                      <div className="note-meta">
                        <span className="note-source">{note.source === 'ai' ? 'AI 助手' : '手写记录'}</span>
                        <span className="note-time">
                          {new Date(note.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          <button type="button" className="btn-icon-sm" onClick={() => handleDeleteNote(note)} aria-label="删除记录">✕</button>
                        </span>
                      </div>
                      <div className="note-content">{note.content}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-notes-text">暂时没有历史记录。</p>
              )}
            </div>
          )}
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            {isEdit && onDelete && (
              <button
                type="button"
                className="btn btn-danger modal-actions-left"
                onClick={() => onDelete(task)}
                disabled={saving}
              >
                删除任务
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : isEdit ? '保存修改' : '创建任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
