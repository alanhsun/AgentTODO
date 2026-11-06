import { useState, useMemo } from 'react';
import { formatLocalDate } from '../utils/date';

const DAYS_OF_WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export default function CalendarBoard({ tasks, onEdit }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  // 按日期预先分组（一次遍历），避免每个格子都遍历全部任务
  const tasksByDate = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      if (!t.due_date) return;
      const key = t.due_date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
  }, [tasks]);

  const todayKey = formatLocalDate(new Date());

  return (
    <div className="calendar-board">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button className="btn btn-sm btn-ghost" onClick={prevMonth} aria-label="上个月">&lt;</button>
          <button className="btn btn-sm btn-ghost" onClick={goToday}>今天</button>
          <button className="btn btn-sm btn-ghost" onClick={nextMonth} aria-label="下个月">&gt;</button>
        </div>
        <h2 className="calendar-title">{year}年 {month + 1}月</h2>
      </div>

      <div className="calendar-grid">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="calendar-day-header">{d}</div>
        ))}
        {days.map((date, idx) => {
          const key = date ? formatLocalDate(date) : null;
          const dayTasks = key ? tasksByDate.get(key) || [] : [];
          const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);
          return (
            <div key={idx} className={`calendar-cell ${date ? '' : 'empty'} ${key === todayKey ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}>
              {date && (
                <>
                  <div className="calendar-date-number">{date.getDate()}</div>
                  <div className="calendar-day-tasks">
                    {dayTasks.map(task => (
                      <div
                        key={task.id}
                        className={`calendar-task status-${task.status} priority-${task.priority}`}
                        onClick={() => onEdit(task)}
                        title={task.title}
                      >
                        <span className="task-title-trunc">{task.title}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
