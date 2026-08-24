import { useState } from 'react';
import { CheckmarkCircle20Filled, Circle20Regular, CircleHalfFill20Regular } from '@fluentui/react-icons';
import TaskCard from './TaskCard';

const COLUMNS = [
  { key: 'todo', label: '待办', Icon: Circle20Regular, color: 'var(--text-secondary)' },
  { key: 'in_progress', label: '进行中', Icon: CircleHalfFill20Regular, color: 'var(--accent)' },
  { key: 'done', label: '已完成', Icon: CheckmarkCircle20Filled, color: 'var(--success)' },
];

export default function KanbanBoard({ tasks, onEdit, onStatusChange, onSelect, selectedIds }) {
  const grouped = {
    todo: tasks.filter((t) => t.status === 'todo'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    done: tasks.filter((t) => t.status === 'done'),
  };

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
      {COLUMNS.map((col) => {
        const ColumnIcon = col.Icon;
        return (
        <div key={col.key} className={`kanban-column kanban-col-${col.key}`}>
          <div className="kanban-column-header">
            <span className="kanban-col-icon" style={{ color: col.color }}><ColumnIcon /></span>
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
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
              />
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}
