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

export default function TaskForm({ task, tags, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    recurrence: 'none',
    recurrence_end: '',
    tags: [],
    subtasks: [],
  });
  const [newSubtask, setNewSubtask] = useState('');
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || '',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        recurrence: task.recurrence || 'none',
        recurrence_end: task.recurrence_end ? task.recurrence_end.split('T')[0] : '',
        tags: task.tags?.map((t) => t.id) || [],
        subtasks: [],
      });
      tasksApi.listNotes(task.id)
        .then(setNotes)
        .catch((err) => console.error('Failed to load notes:', err));
    }
  }, [task]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      due_date: form.due_date || null,
      recurrence_end: form.recurrence_end || null,
    };
    // Only include subtasks on create (not edit)
    if (task) delete data.subtasks;
    onSubmit(data);
  };

  const toggleTag = (tagId) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter((id) => id !== tagId)
        : [...prev.tags, tagId],
    }));
  };

  const addSubtask = () => {
    if (newSubtask.trim()) {
      setForm((prev) => ({
        ...prev,
        subtasks: [...prev.subtasks, newSubtask.trim()],
      }));
      setNewSubtask('');
    }
  };

  const removeSubtask = (index) => {
    setForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index),
    }));
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !task) return;
    try {
      const addedNote = await tasksApi.addNote(task.id, newNote.trim(), 'user');
      setNotes((prev) => [addedNote, ...prev]);
      setNewNote('');
    } catch (error) {
      console.error('Failed to add note:', error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{task ? '编辑任务' : '新建任务'}</h2>
          <button className="btn-icon" onClick={onCancel} aria-label="关闭">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="task-title">标题</label>
            <input
              id="task-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="输入任务标题..."
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="task-desc">描述</label>
            <textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="输入任务描述（可选）..."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-status">状态</label>
              <select id="task-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="task-priority">优先级</label>
              <select id="task-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="task-due">截止日期</label>
              <input
                id="task-due"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>

          {/* Recurrence */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="task-recurrence">重复</label>
              <select id="task-recurrence" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
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
                  onChange={(e) => setForm({ ...form, recurrence_end: e.target.value })}
                  placeholder="可选"
                />
              </div>
            )}
          </div>

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

          {/* Subtasks — only on create */}
          {!task && (
            <div className="form-group">
              <label>子任务</label>
              <div className="subtask-input-row">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="添加子任务..."
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); }}}
                />
                <button type="button" className="btn btn-sm btn-ghost" onClick={addSubtask}>+</button>
              </div>
              {form.subtasks.length > 0 && (
                <ul className="subtask-list">
                  {form.subtasks.map((s, i) => (
                    <li key={i} className="subtask-item">
                      <span>○ {s}</span>
                      <button type="button" className="btn-icon-sm" onClick={() => removeSubtask(i)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* History / Notes - only on edit */}
          {task && (
            <div className="form-group task-history">
              <label>任务进度与纪要</label>
              
              <div className="subtask-input-row" style={{marginBottom: '1rem'}}>
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
                <ul className="notes-list" style={{listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem'}}>
                  {notes.map((note) => (
                    <li key={note.id} style={{marginBottom: '10px', padding: '8px', background: 'var(--surface-color)', borderRadius: '6px', borderLeft: note.source==='ai' ? '3px solid var(--tag-blue)' : '3px solid var(--text-muted)'}}>
                      <div className="note-meta" style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '4px'}}>
                        <span className="note-source">{note.source === 'ai' ? '🤖 Agent' : '👤 You'}</span>
                        <span className="note-time">{new Date(note.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="note-content" style={{color: 'var(--text-color)'}}>{note.content}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-notes-text" style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>暂时没有历史记录。</p>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
            <button type="submit" className="btn btn-primary">
              {task ? '保存修改' : '创建任务'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
