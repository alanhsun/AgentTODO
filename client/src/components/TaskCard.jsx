const PRIORITY_LABELS = { low: '低', medium: '中', high: '高', urgent: '紧急' };
const STATUS_LABELS = { todo: '待办', in_progress: '进行中', done: '已完成' };
const STATUS_ICONS = { todo: '○', in_progress: '◐', done: '●' };

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d - now;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  const formatted = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });

  if (days < 0) return { text: `已过期 ${formatted}`, className: 'overdue' };
  if (days === 0) return { text: `今天`, className: 'due-today' };
  if (days === 1) return { text: `明天`, className: 'due-soon' };
  if (days <= 3) return { text: `${days}天后`, className: 'due-soon' };
  return { text: formatted, className: '' };
}

const RECURRENCE_LABELS = { daily: '每天', weekly: '每周', monthly: '每月' };

export default function TaskCard({ task, onEdit, onStatusChange, onSelect, selected, draggable, onDragStart }) {
  const dateInfo = formatDate(task.due_date);
  const subtaskTotal = Number(task.subtask_progress?.total || 0);
  const subtaskCompleted = Number(task.subtask_progress?.completed || 0);
  const subtaskPercent = subtaskTotal > 0 ? Math.round((subtaskCompleted / subtaskTotal) * 100) : 0;

  const handleStatusClick = (e) => {
    e.stopPropagation();
    const nextStatus = {
      todo: 'in_progress',
      in_progress: 'done',
      done: 'todo',
    };
    onStatusChange(task.id, nextStatus[task.status]);
  };

  return (
    <div
      className={`task-card priority-${task.priority} ${task.status === 'done' ? 'completed' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => onEdit(task)}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="task-card-header">
        <button className="status-toggle" onClick={handleStatusClick} title={`切换状态: ${STATUS_LABELS[task.status]}`}>
          <span className={`status-icon status-${task.status}`}>{STATUS_ICONS[task.status]}</span>
        </button>
        <div className="task-card-content">
          <h3 className="task-title">{task.title}</h3>
          {task.description && <p className="task-desc">{task.description}</p>}
        </div>
        <label className="task-checkbox" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onSelect(task.id)} />
          <span className="checkmark"></span>
        </label>
      </div>

      {subtaskTotal > 0 && (
        <div className="task-subtask-progress" aria-label={`子任务完成 ${subtaskCompleted}/${subtaskTotal}`}>
          <div className="task-subtask-progress-label">
            <span>子任务</span>
            <span>{subtaskCompleted}/{subtaskTotal}</span>
          </div>
          <div
            className="task-subtask-progress-track"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax={subtaskTotal}
            aria-valuenow={subtaskCompleted}
          >
            <span style={{ width: `${subtaskPercent}%` }} />
          </div>
        </div>
      )}

      <div className="task-card-footer">
        <div className="task-meta">
          <span className={`priority-badge priority-${task.priority}`}>
            {PRIORITY_LABELS[task.priority]}
          </span>
          {task.recurrence && task.recurrence !== 'none' && (
            <span className="recurrence-badge">🔄 {RECURRENCE_LABELS[task.recurrence]}</span>
          )}
          {dateInfo && (
            <span className={`due-badge ${dateInfo.className}`}>
              {dateInfo.text}
            </span>
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
    </div>
  );
}
