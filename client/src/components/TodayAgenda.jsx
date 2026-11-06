import { useState } from 'react';
import TaskCard from './TaskCard';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatAgendaDate(dateStr) {
  const todayStr = dateStr || new Date().toISOString().slice(0, 10);
  const [y, m, d] = todayStr.split('-').map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1);
  const weekday = WEEKDAYS[dateObj.getDay()] || '';
  return `${todayStr} · ${weekday}`;
}

export default function TodayAgenda({
  agenda,
  loading,
  onEdit,
  onStatusChange,
  onSelect,
  selectedIds,
  onSubtaskChange,
  onCreate,
}) {
  const [copied, setCopied] = useState(false);

  const overdueTasks = (agenda?.tasks || []).filter((t) => t.is_overdue);
  const dueTodayTasks = (agenda?.tasks || []).filter((t) => !t.is_overdue);
  const inProgressOthers = agenda?.in_progress_others || [];
  const focusTasks = [...dueTodayTasks, ...inProgressOthers];
  const completedToday = agenda?.completed_today || [];

  const handleCopyReport = async () => {
    const dateLabel = formatAgendaDate(agenda?.date);
    const lines = [`# 今日任务台账 (${dateLabel})`, ''];

    if (overdueTasks.length > 0) {
      lines.push(`## 逾期未清 (${overdueTasks.length})`);
      overdueTasks.forEach((t) => {
        const sub = t.subtask_progress?.total
          ? ` [${t.subtask_progress.completed}/${t.subtask_progress.total}]`
          : '';
        lines.push(`- [ ] ${t.title}${sub} (截止: ${t.due_date?.split('T')[0] || '-'})`);
      });
      lines.push('');
    }

    lines.push(`## 今日焦点 (${focusTasks.length})`);
    if (focusTasks.length === 0) {
      lines.push('- 暂无待推进焦点任务');
    } else {
      focusTasks.forEach((t) => {
        const sub = t.subtask_progress?.total
          ? ` [${t.subtask_progress.completed}/${t.subtask_progress.total}]`
          : '';
        const statusMark = t.status === 'in_progress' ? '◐ ' : '';
        lines.push(`- [ ] ${statusMark}${t.title}${sub}`);
      });
    }
    lines.push('');

    lines.push(`## 今日已结 (${completedToday.length})`);
    if (completedToday.length === 0) {
      lines.push('- 暂无今日完成记录');
    } else {
      completedToday.forEach((t) => {
        lines.push(`- [x] ${t.title}`);
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors in non-secure context
    }
  };

  if (loading && overdueTasks.length === 0 && focusTasks.length === 0 && completedToday.length === 0) {
    return (
      <div className="today-agenda">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>正在装载今日台账...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="today-agenda">
      {/* 顶部日历纪要横幅 */}
      <div className="agenda-brief">
        <div className="agenda-brief-main">
          <div className="agenda-brief-date">
            今日台账 · {formatAgendaDate(agenda?.date)}
          </div>
          <div className="agenda-brief-summary">
            <span>今日焦点 <strong>{focusTasks.length}</strong> 项</span>
            {overdueTasks.length > 0 && (
              <span className="agenda-brief-overdue">
                · 逾期未清 <strong>{overdueTasks.length}</strong> 项需优先处理
              </span>
            )}
            <span> · 今日已结 <strong>{completedToday.length}</strong> 项</span>
          </div>
        </div>
        <div className="agenda-brief-actions">
          <button type="button" className="btn btn-sm btn-ghost" onClick={handleCopyReport}>
            {copied ? '✓ 已复制日报' : '复制今日日报'}
          </button>
        </div>
      </div>

      {/* 第一分栏：逾期未清 */}
      {overdueTasks.length > 0 && (
        <section className="agenda-section agenda-overdue">
          <header className="agenda-section-header">
            <span className="agenda-section-dot overdue" />
            <h2 className="agenda-section-title">逾期未清</h2>
            <span className="agenda-section-sub">OVERDUE</span>
            <span className="agenda-section-count">{overdueTasks.length}</span>
          </header>
          <div className="agenda-section-list">
            {overdueTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEdit}
                onStatusChange={onStatusChange}
                onSelect={onSelect}
                selected={selectedIds.includes(task.id)}
                onSubtaskChange={onSubtaskChange}
                defaultExpanded
              />
            ))}
          </div>
        </section>
      )}

      {/* 第二分栏：今日焦点（今日到期 + 进行中） */}
      <section className="agenda-section agenda-focus">
        <header className="agenda-section-header">
          <span className="agenda-section-dot focus" />
          <h2 className="agenda-section-title">今日焦点</h2>
          <span className="agenda-section-sub">DUE TODAY &amp; IN PROGRESS</span>
          <span className="agenda-section-count">{focusTasks.length}</span>
        </header>
        {focusTasks.length === 0 ? (
          <div className="agenda-empty">
            <p>今日暂无到期或进行中的任务。可将任务状态设为「进行中」或指定今日截止日期。</p>
            <button type="button" className="btn btn-sm" onClick={onCreate}>
              + 新建任务
            </button>
          </div>
        ) : (
          <div className="agenda-section-list">
            {focusTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEdit}
                onStatusChange={onStatusChange}
                onSelect={onSelect}
                selected={selectedIds.includes(task.id)}
                onSubtaskChange={onSubtaskChange}
                defaultExpanded
              />
            ))}
          </div>
        )}
      </section>

      {/* 第三分栏：今日已结 */}
      <section className="agenda-section agenda-completed">
        <header className="agenda-section-header">
          <span className="agenda-section-dot completed" />
          <h2 className="agenda-section-title">今日已结</h2>
          <span className="agenda-section-sub">COMPLETED TODAY</span>
          <span className="agenda-section-count">{completedToday.length}</span>
        </header>
        {completedToday.length === 0 ? (
          <div className="agenda-empty subtle">
            <p>今日尚无归档完成的任务，完成一项勾选一项。</p>
          </div>
        ) : (
          <div className="agenda-section-list">
            {completedToday.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={onEdit}
                onStatusChange={onStatusChange}
                onSelect={onSelect}
                selected={selectedIds.includes(task.id)}
                onSubtaskChange={onSubtaskChange}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
