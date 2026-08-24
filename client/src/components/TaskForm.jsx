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

function createInitialForm(task) {
  return {
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    due_date: task?.due_date ? task.due_date.split('T')[0] : '',
    recurrence: task?.recurrence || 'none',
    recurrence_end: task?.recurrence_end ? task.recurrence_end.split('T')[0] : '',
    tags: task?.tags?.map((tag) => tag.id) || [],
    subtasks: [],
  };
}

export default function TaskForm({ task, tags, onSubmit, onCancel, onSubtasksChanged }) {
  const [form, setForm] = useState(() => createInitialForm(task));
  const [newSubtask, setNewSubtask] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  const [subtasksLoading, setSubtasksLoading] = useState(Boolean(task));
  const [subtaskError, setSubtaskError] = useState('');
  const [showCompletedSubtasks, setShowCompletedSubtasks] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [busySubtaskId, setBusySubtaskId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    if (!task) return undefined;

    let active = true;
    Promise.all([
      tasksApi.listSubtasks(task.id),
      tasksApi.listNotes(task.id),
    ])
      .then(([loadedSubtasks, loadedNotes]) => {
        if (!active) return;
        setSubtasks(loadedSubtasks);
        setNotes(loadedNotes);
      })
      .catch((err) => {
        if (active) setSubtaskError(`加载子任务失败：${err.message}`);
      })
      .finally(() => {
        if (active) setSubtasksLoading(false);
      });

    return () => { active = false; };
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

  const notifySubtasksChanged = () => {
    onSubtasksChanged?.();
  };

  const addSubtask = async () => {
    const title = newSubtask.trim();
    if (!title) return;

    if (!task) {
      setForm((prev) => ({
        ...prev,
        subtasks: [...prev.subtasks, title],
      }));
      setNewSubtask('');
      return;
    }

    setBusySubtaskId('new');
    setSubtaskError('');
    try {
      const added = await tasksApi.addSubtask(task.id, title);
      setSubtasks((prev) => [...prev, added]);
      setNewSubtask('');
      notifySubtasksChanged();
    } catch (error) {
      setSubtaskError(error.message);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const removeSubtask = (index) => {
    setForm((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((_, i) => i !== index),
    }));
  };

  const toggleSubtask = async (subtask) => {
    setBusySubtaskId(subtask.id);
    setSubtaskError('');
    try {
      const updated = await tasksApi.updateSubtask(task.id, subtask.id, {
        completed: !subtask.completed,
      });
      setSubtasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      notifySubtasksChanged();
    } catch (error) {
      setSubtaskError(error.message);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const beginRenameSubtask = (subtask) => {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskTitle(subtask.title);
  };

  const saveSubtaskTitle = async () => {
    const subtaskId = editingSubtaskId;
    const title = editingSubtaskTitle.trim();
    if (!subtaskId) return;

    const existing = subtasks.find((item) => item.id === subtaskId);
    setEditingSubtaskId(null);
    if (!title || title === existing?.title) return;

    setBusySubtaskId(subtaskId);
    setSubtaskError('');
    try {
      const updated = await tasksApi.updateSubtask(task.id, subtaskId, { title });
      setSubtasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      notifySubtasksChanged();
    } catch (error) {
      setSubtaskError(error.message);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const deleteExistingSubtask = async (subtask) => {
    if (!confirm(`确定删除子任务“${subtask.title}”吗？`)) return;
    setBusySubtaskId(subtask.id);
    setSubtaskError('');
    try {
      await tasksApi.deleteSubtask(task.id, subtask.id);
      setSubtasks((prev) => prev.filter((item) => item.id !== subtask.id));
      notifySubtasksChanged();
    } catch (error) {
      setSubtaskError(error.message);
    } finally {
      setBusySubtaskId(null);
    }
  };

  const incompleteSubtasks = subtasks.filter((subtask) => !subtask.completed);
  const completedSubtasks = subtasks.filter((subtask) => subtask.completed);
  const visibleSubtasks = showCompletedSubtasks
    ? [...incompleteSubtasks, ...completedSubtasks]
    : incompleteSubtasks;

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

          {/* Existing subtasks — managed independently while editing */}
          {task && (
            <div className="form-group subtask-manager">
              <div className="subtask-section-header">
                <label>子任务</label>
                {subtasks.length > 0 && (
                  <span className="subtask-count">
                    {completedSubtasks.length}/{subtasks.length} 已完成
                  </span>
                )}
              </div>

              {subtasks.length > 0 && (
                <div
                  className="subtask-progress-track"
                  role="progressbar"
                  aria-valuemin="0"
                  aria-valuemax={subtasks.length}
                  aria-valuenow={completedSubtasks.length}
                  aria-label="子任务完成进度"
                >
                  <span style={{ width: `${(completedSubtasks.length / subtasks.length) * 100}%` }} />
                </div>
              )}

              <div className="subtask-input-row">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="添加子任务..."
                  maxLength={255}
                  disabled={busySubtaskId === 'new'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={addSubtask}
                  disabled={!newSubtask.trim() || busySubtaskId === 'new'}
                >
                  添加
                </button>
              </div>

              {subtaskError && <p className="subtask-error" role="alert">{subtaskError}</p>}
              {subtasksLoading ? (
                <p className="subtask-empty">正在加载子任务...</p>
              ) : subtasks.length === 0 ? (
                <p className="subtask-empty">暂无子任务，可以从上方快速添加。</p>
              ) : (
                <>
                  <ul className="subtask-list editable-subtask-list">
                    {visibleSubtasks.map((subtask) => (
                      <li key={subtask.id} className={`subtask-item ${subtask.completed ? 'completed' : ''}`}>
                        <input
                          className="subtask-toggle"
                          type="checkbox"
                          checked={Boolean(subtask.completed)}
                          disabled={busySubtaskId === subtask.id}
                          onChange={() => toggleSubtask(subtask)}
                          aria-label={`标记“${subtask.title}”${subtask.completed ? '未完成' : '完成'}`}
                        />
                        {editingSubtaskId === subtask.id ? (
                          <input
                            className="subtask-rename-input"
                            value={editingSubtaskTitle}
                            maxLength={255}
                            autoFocus
                            onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                            onBlur={saveSubtaskTitle}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        ) : (
                          <span className="subtask-title">{subtask.title}</span>
                        )}
                        <div className="subtask-actions">
                          <button
                            type="button"
                            className="btn-icon-sm"
                            onClick={() => beginRenameSubtask(subtask)}
                            disabled={busySubtaskId === subtask.id}
                            aria-label={`修改“${subtask.title}”`}
                            title="修改"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="btn-icon-sm"
                            onClick={() => deleteExistingSubtask(subtask)}
                            disabled={busySubtaskId === subtask.id}
                            aria-label={`删除“${subtask.title}”`}
                            title="删除"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {completedSubtasks.length > 0 && (
                    <button
                      type="button"
                      className="subtask-completed-toggle"
                      onClick={() => setShowCompletedSubtasks((value) => !value)}
                    >
                      {showCompletedSubtasks ? '收起' : '展开'}已完成子任务（{completedSubtasks.length}）
                    </button>
                  )}

                  {incompleteSubtasks.length === 0 && task.status !== 'done' && (
                    <p className="subtask-complete-hint">全部子任务已完成，可将主任务标记为完成。</p>
                  )}
                </>
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
