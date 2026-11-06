import { useState } from 'react';
import TaskCard from './TaskCard';

const COLUMNS = [
  { key: 'todo', label: '待办', icon: '○', color: 'var(--text-secondary)' },
  { key: 'in_progress', label: '进行中', icon: '◐', color: 'var(--accent)' },
  { key: 'done', label: '已完成', icon: '●', color: 'var(--success)' },
];

export default function KanbanBoard({ tasks, onEdit, onStatusChange, onSelect, selectedIds, onSubtaskChange }) {
  const grouped = { todo: [], in_progress: [], done: [] };
  tasks.forEach((t) => { if (grouped[t.status]) grouped[t.status].push(t); });

  const [dragOverCol, setDragOverCol] = useState(null);

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, colKey) => {
    e.preventDefault(); // allow drop
    if (dragOverCol !== colKey) {
      setDragOverCol(colKey);
    }
  };

  const handleDragLeave = (e, colKey) => {
    // 在列内的子元素之间移动也会触发 dragleave，只有真正离开列时才取消高亮
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverCol === colKey) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e, colKey) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskIdString = e.dataTransfer.getData('taskId');
    if (taskIdString) {
      const taskId = parseInt(taskIdString, 10);
      const draggedTask = tasks.find((t) => t.id === taskId);
      if (draggedTask && draggedTask.status !== colKey) {
        onStatusChange(taskId, colKey);
      }
    }
  };

  return (
    <div className="kanban-board">
      {COLUMNS.map((col) => (
        <div key={col.key} className={`kanban-column kanban-col-${col.key}`}>
          <div className="kanban-column-header">
            <span className="kanban-col-icon" style={{ color: col.color }}>{col.icon}</span>
            <span className="kanban-col-title">{col.label}</span>
            <span className="kanban-col-count">{grouped[col.key].length}</span>
          </div>
          <div
            className={`kanban-column-body ${dragOverCol === col.key ? 'drag-over' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={(e) => handleDragLeave(e, col.key)}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {grouped[col.key].length === 0 && (
              <div className="kanban-empty">暂无任务或拖拽至此</div>
            )}
            {grouped[col.key].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEdit}
                onStatusChange={onStatusChange}
                onSelect={onSelect}
                selected={selectedIds.includes(task.id)}
                onSubtaskChange={onSubtaskChange}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
