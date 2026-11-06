import { useState } from 'react';
import { tasksApi } from '../api';
import { parseLocalDate, daysFromToday } from '../utils/date';

const PRIORITY_LABELS = { low: '低', medium: '中', high: '高', urgent: '紧急' };
const STATUS_LABELS = { todo: '待办', in_progress: '进行中', done: '已完成' };
const STATUS_ICONS = { todo: '○', in_progress: '◐', done: '●' };
const NEXT_STATUS = { todo: 'in_progress', in_progress: 'done', done: 'todo' };
const RECURRENCE_LABELS = { daily: '每天', weekly: '每周', monthly: '每月' };

function formatDue(dateStr, isDone) {
  const date = parseLocalDate(dateStr);
  if (!date) return null;
  const days = daysFromToday(dateStr);
  const formatted = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  // 已完成的任务不再提示逾期/临近
  if (isDone) return { text: formatted, className: '' };
  if (days < 0) return { text: `已过期 ${formatted}`, className: 'overdue' };
  if (days === 0) return { text: '今天', className: 'due-today' };
  if (days === 1) return { text: '明天', className: 'due-soon' };
  if (days <= 3) return { text: `${days}天后`, className: 'due-soon' };
  return { text: formatted, className: '' };
}

export default function TaskCard({
  task,
  onEdit,
  onStatusChange,
  onSelect,
  selected,
  draggable,
  onDragStart,
  onSubtaskChange,
  defaultExpanded = false,
}) {
  const [subtasksOpen, setSubtasksOpen] = useState(defaultExpanded);
  const [togglingMap, setTogglingMap] = useState({});
  const [quickTitle, setQuickTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  const isDone = task.status === 'done';
  const dateInfo = formatDue(task.due_date, isDone);

  const rawSubtasks = task.subtasks || [];
  const subtasks = rawSubtasks.map((s) => (
    s.id in togglingMap ? { ...s, completed: togglingMap[s.id] } : s
  ));
  const progress = subtasks.length > 0
    ? { total: subtasks.length, completed: subtasks.filter((s) => s.completed).length }
    : task.subtask_progress;

  const handleStatusClick = (e) => {
    e.stopPropagation();
    onStatusChange(task.id, NEXT_STATUS[task.status]);
  };

  const handleBadgeClick = (e) => {
    e.stopPropagation();
    setSubtasksOpen((prev) => !prev);
  };

  const handleInlineSubtaskToggle = async (subtask) => {
    const nextCompleted = !subtask.completed;
    setTogglingMap((prev) => ({ ...prev, [subtask.id]: nextCompleted }));
    try {
      await tasksApi.updateSubtask(task.id, subtask.id, { completed: nextCompleted });
      onSubtaskChange?.();
    } catch (err) {
      alert(`更新子任务失败: ${err.message}`);
    } finally {
      setTogglingMap((prev) => {
        const next = { ...prev };
        delete next[subtask.id];
        return next;
      });
    }
  };

  const handleQuickAddSubtask = async (e) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title || addingSubtask) return;
    setAddingSubtask(true);
    try {
      await tasksApi.addSubtask(task.id, title);
      setQuickTitle('');
      onSubtaskChange?.();
    } catch (err) {
      alert(`添加子任务失败: ${err.message}`);
    } finally {
      setAddingSubtask(false);
    }
  };

  return (
    <div
      className={`task-card priority-${task.priority} ${isDone ? 'completed' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => onEdit(task)}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="task-card-header">
        <button
          className="status-toggle"
          onClick={handleStatusClick}
          title={`当前: ${STATUS_LABELS[task.status]}，点击切换为 ${STATUS_LABELS[NEXT_STATUS[task.status]]}`}
          aria-label={`切换状态，当前${STATUS_LABELS[task.status]}`}
        >
          <span className={`status-icon status-${task.status}`}>{STATUS_ICONS[task.status]}</span>
        </button>
        <div className="task-card-content">
          <h3 className="task-title">{task.title}</h3>
          {task.description && <p className="task-desc">{task.description}</p>}
        </div>
        {onSelect && (
          <label className="task-checkbox" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={Boolean(selected)} onChange={() => onSelect(task.id)} aria-label="选择任务" />
            <span className="checkmark"></span>
          </label>
        )}
      </div>

      <div className="task-card-footer">
        <div className="task-meta">
          <span className={`priority-badge priority-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.recurrence && task.recurrence !== 'none' && (
            <span className="recurrence-badge">↻ {RECURRENCE_LABELS[task.recurrence]}</span>
          )}
          {dateInfo && (
            <span className={`due-badge ${dateInfo.className}`}>
              {dateInfo.text}
            </span>
          )}
          {progress && progress.total > 0 && (
            <button
              type="button"
              className={`subtask-progress-badge ${progress.completed === progress.total ? 'complete' : ''} ${subtasksOpen ? 'open' : ''}`}
              title={`点击${subtasksOpen ? '收起' : '展开'}子任务 (${progress.completed}/${progress.total})`}
              onClick={handleBadgeClick}
            >
              <span>☑ {progress.completed}/{progress.total}</span>
              <span className="subtask-badge-caret">{subtasksOpen ? '▾' : '▸'}</span>
            </button>
          )}
        </div>
        {task.tags && task.tags.length > 0 && (
          <div className="task-tags">
            {task.tags.map((tag) => (
              <span key={tag.id} className="tag-badge" style={{ '--tag-color': tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {subtasksOpen && subtasks.length > 0 && (
        <div className="card-subtasks" onClick={(e) => e.stopPropagation()}>
          <ul className="card-subtask-list">
            {subtasks.map((s) => (
              <li key={s.id} className={`card-subtask-item ${s.completed ? 'done' : ''}`}>
                <label className="card-subtask-check">
                  <input
                    type="checkbox"
                    checked={s.completed}
                    onChange={() => handleInlineSubtaskToggle(s)}
                  />
                  <span>{s.title}</span>
                </label>
              </li>
            ))}
          </ul>
          <form className="card-subtask-form" onSubmit={handleQuickAddSubtask}>
            <input
              type="text"
              className="card-subtask-input"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="+ 追加子任务，按回车保存..."
              maxLength={255}
              disabled={addingSubtask}
            />
          </form>
        </div>
      )}
    </div>
  );
}
