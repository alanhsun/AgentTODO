import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Button,
  FluentProvider,
  Skeleton,
  SkeletonItem,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components';
import {
  Add20Regular,
  ArrowReset20Regular,
  Board20Regular,
  Calendar20Regular,
  CheckmarkCircle20Filled,
  CheckmarkSquare24Regular,
  Circle20Regular,
  CircleHalfFill20Regular,
  ClipboardTaskListLtr20Regular,
  Delete20Regular,
  DocumentArrowDown20Regular,
  DocumentArrowUp20Regular,
  List20Regular,
  Navigation20Regular,
  Person20Regular,
  Tag20Regular,
  WeatherMoon20Regular,
  WeatherSunny20Regular,
} from '@fluentui/react-icons';
import { tasksApi, backupApi } from '../api';
import { useTasks, useTags, useTaskSummary } from '../hooks/useTasks';
import TaskCard from '../components/TaskCard';
import TaskForm from '../components/TaskForm';
import FilterBar from '../components/FilterBar';
import TagManager from '../components/TagManager';
import KanbanBoard from '../components/KanbanBoard';
import CalendarBoard from '../components/CalendarBoard';

function TaskListSkeleton() {
  return (
    <Skeleton className="task-list-skeleton" aria-label="正在加载任务">
      {[0, 1, 2].map((item) => (
        <div className="task-skeleton-row" key={item}>
          <SkeletonItem shape="circle" size={20} />
          <div className="task-skeleton-copy">
            <SkeletonItem size={16} />
            <SkeletonItem size={12} />
          </div>
        </div>
      ))}
    </Skeleton>
  );
}

export default function Dashboard() {
  const [filters, setFilters] = useState({ sort: 'created_at', order: 'desc', page: 1, limit: 20 });
  const [viewMode, setViewMode] = useState('list');
  const { tasks, pagination, loading, refetch } = useTasks(viewMode === 'list' ? filters : null);
  const { summary, refetch: refetchSummary } = useTaskSummary();
  const { tags, refetch: refetchTags } = useTags();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Kanban and calendar need every matching task, regardless of status.
  const kanbanFilters = useMemo(() => ({ ...filters, page: 1, status: '' }), [filters]);
  const { tasks: kanbanTasks, loading: kanbanLoading, refetch: kanbanRefetch } = useTasks(
    viewMode === 'kanban' || viewMode === 'calendar' ? kanbanFilters : null,
    { allPages: true },
  );

  const getIncompleteSubtaskCount = async (taskId) => {
    const subtasks = await tasksApi.listSubtasks(taskId);
    return subtasks.filter((subtask) => !subtask.completed).length;
  };

  const confirmTaskCompletion = async (taskId) => {
    const incompleteCount = await getIncompleteSubtaskCount(taskId);
    return incompleteCount === 0
      || confirm(`还有 ${incompleteCount} 个子任务未完成，仍要完成主任务吗？`);
  };

  const handleCreateOrUpdate = async (data) => {
    try {
      if (editingTask) {
        if (data.status === 'done' && editingTask.status !== 'done'
          && !(await confirmTaskCompletion(editingTask.id))) {
          return;
        }
        await tasksApi.update(editingTask.id, data);
      } else {
        await tasksApi.create(data);
      }
      setShowForm(false);
      setEditingTask(null);
      refetch();
      refetchSummary();
      if (viewMode === 'kanban' || viewMode === 'calendar') kanbanRefetch();
      refetchTags();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  const handleStatusChange = async (id, status) => {
    try {
      if (status === 'done' && !(await confirmTaskCompletion(id))) return;
      await tasksApi.update(id, { status });
      refetch();
      refetchSummary();
      if (viewMode === 'kanban' || viewMode === 'calendar') kanbanRefetch();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSubtasksChanged = () => {
    refetch();
    if (viewMode === 'kanban' || viewMode === 'calendar') kanbanRefetch();
  };

  const handleAttachmentsChanged = () => {
    refetch();
    if (viewMode === 'kanban' || viewMode === 'calendar') kanbanRefetch();
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBatchAction = async (action, value) => {
    if (selectedIds.length === 0) return;
    setBatchLoading(true);
    try {
      if (action === 'update_status' && value === 'done') {
        const incompleteCounts = await Promise.all(selectedIds.map(getIncompleteSubtaskCount));
        const affectedTasks = incompleteCounts.filter((count) => count > 0).length;
        const incompleteTotal = incompleteCounts.reduce((sum, count) => sum + count, 0);
        if (affectedTasks > 0
          && !confirm(`所选任务中有 ${affectedTasks} 项包含共 ${incompleteTotal} 个未完成子任务，仍要全部标记完成吗？`)) {
          return;
        }
      }
      await tasksApi.batch({ action, ids: selectedIds, value });
      setSelectedIds([]);
      refetch();
      refetchSummary();
      if (viewMode === 'kanban' || viewMode === 'calendar') kanbanRefetch();
      refetchTags();
    } catch (err) {
      alert(err.message);
    } finally {
      setBatchLoading(false);
    }
  };

  const handlePageChange = (page) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleExport = async () => {
    try {
      const blob = await backupApi.exportFull();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agenttodo-full-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(err) {
      alert('导出备份失败: ' + err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    e.target.value = null;
    if(!file) return;
    if(!confirm('确定要导入这个备份文件吗？这将覆盖当前的所有任务、附件和设置。')) return;

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        await backupApi.importFull(file);
      } else {
        const data = JSON.parse(await file.text());
        await backupApi.import(data);
      }
      alert('导入成功');
      window.location.reload();
    } catch(err) {
      alert('导入失败: ' + err.message);
    }
  };

  // Header counts using summary API to get accurate global data
  const todoCnt = summary?.by_status?.todo || 0;
  const inProgressCnt = summary?.by_status?.in_progress || 0;
  const doneCnt = summary?.by_status?.done || 0;
  const totalCnt = summary?.total || 0;
  const completionRate = totalCnt > 0 ? Math.round((doneCnt / totalCnt) * 100) : 0;
  const hasActiveFilters = Boolean(filters.status || filters.priority || filters.tag || filters.search);
  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
      .format(new Date())
      .replace(/日(?=星期)/, '日 '),
    [],
  );

  return (
    <FluentProvider theme={theme === 'dark' ? webDarkTheme : webLightTheme} className="fluent-app">
    <div className={`dashboard ${viewMode === 'kanban' || viewMode === 'calendar' ? 'kanban-mode' : ''}`}>
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar - hidden in kanban mode via CSS */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark"><CheckmarkSquare24Regular className="brand-icon" /></span>
            <span className="brand-copy">
              <strong>AgentTODO</strong>
              <small>本地任务空间</small>
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-label">任务视图</span>
          <button className={`nav-item ${filters.status === '' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: '', page: 1 })}>
            <span className="nav-icon"><ClipboardTaskListLtr20Regular /></span>
            <span>全部任务</span>
            <span className="nav-badge">{totalCnt}</span>
          </button>
          <button className={`nav-item ${filters.status === 'todo' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: 'todo', page: 1 })}>
            <span className="nav-icon"><Circle20Regular /></span>
            <span>待办</span>
            {todoCnt > 0 && <span className="nav-badge">{todoCnt}</span>}
          </button>
          <button className={`nav-item ${filters.status === 'in_progress' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: 'in_progress', page: 1 })}>
            <span className="nav-icon"><CircleHalfFill20Regular /></span>
            <span>进行中</span>
            {inProgressCnt > 0 && <span className="nav-badge">{inProgressCnt}</span>}
          </button>
          <button className={`nav-item ${filters.status === 'done' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: 'done', page: 1 })}>
            <span className="nav-icon"><CheckmarkCircle20Filled /></span>
            <span>已完成</span>
            {doneCnt > 0 && <span className="nav-badge">{doneCnt}</span>}
          </button>
        </nav>

        <div className="sidebar-section">
          <span className="sidebar-label">整理工具</span>
          <button className="nav-item" onClick={() => setShowTags(!showTags)}>
            <span className="nav-icon"><Tag20Regular /></span>
            <span>标签管理</span>
            <span className="nav-arrow">{showTags ? '▾' : '▸'}</span>
          </button>
          {showTags && <TagManager tags={tags} onRefresh={() => { refetchTags(); refetch(); }} />}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar"><Person20Regular /></div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="user-name">本地用户</span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <Button appearance="subtle" size="small" icon={<DocumentArrowDown20Regular />} onClick={handleExport} title="导出包含附件的 ZIP 完整备份">导出</Button>
                <Button appearance="subtle" size="small" icon={<DocumentArrowUp20Regular />} onClick={() => fileInputRef.current?.click()} title="导入 ZIP 完整备份或旧版 JSON 备份">导入</Button>
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".zip,.json" style={{ display: 'none' }} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="main-header">
          {/* Mobile Menu Button */}
          <button 
            className="mobile-menu-btn" 
            onClick={() => setIsMobileMenuOpen(true)}
            title="打开菜单"
          >
            <Navigation20Regular />
          </button>

          {/* Brand inline - only shows in full screen mode */}
          {(viewMode === 'kanban' || viewMode === 'calendar') && (
            <div className="header-brand">
              <CheckmarkSquare24Regular className="brand-icon" />
            </div>
          )}
          <div className="main-heading">
            <span className="dashboard-date">{todayLabel}</span>
            <h1>我的任务</h1>
            <p className="dashboard-subtitle">集中查看、安排和推进本地任务</p>
          </div>
          <div className="header-actions">
            {/* Space holder for kanban mode */}
            {/* Theme toggle */}
            <Button
              appearance="subtle"
              className="theme-toggle"
              icon={theme === 'dark' ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
              title={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
            />
            {/* View mode toggle */}
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="列表视图"
              >
                <List20Regular />
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                onClick={() => setViewMode('kanban')}
                title="看板视图"
              >
                <Board20Regular />
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
                title="日历视图"
              >
                <Calendar20Regular />
              </button>
            </div>
            <Button appearance="primary" icon={<Add20Regular />} className="primary-action" onClick={() => { setEditingTask(null); setShowForm(true); }}>
              新建任务
            </Button>
          </div>
        </div>

        {/* Task views */}
        {viewMode === 'list' ? (
          <div className="list-view-shell">
            <section className="overview-grid" aria-label="任务总览">
              <button
                className={`overview-card overview-main ${filters.status === '' ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, status: '', page: 1 })}
              >
                <span className="overview-icon"><ClipboardTaskListLtr20Regular /></span>
                <span className="overview-copy">
                  <span className="overview-label">全部任务</span>
                  <strong>{totalCnt}</strong>
                  <span className="overview-note">当前任务总量</span>
                </span>
                <span className="completion-ring" style={{ '--completion': `${completionRate * 3.6}deg` }}>
                  <span>{completionRate}%</span>
                </span>
              </button>
              <button
                className={`overview-card ${filters.status === 'todo' ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, status: 'todo', page: 1 })}
              >
                <span className="overview-icon status-todo"><Circle20Regular /></span>
                <span className="overview-copy">
                  <span className="overview-label">待办</span>
                  <strong>{todoCnt}</strong>
                  <span className="overview-note">等待处理</span>
                </span>
              </button>
              <button
                className={`overview-card ${filters.status === 'in_progress' ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, status: 'in_progress', page: 1 })}
              >
                <span className="overview-icon status-in_progress"><CircleHalfFill20Regular /></span>
                <span className="overview-copy">
                  <span className="overview-label">进行中</span>
                  <strong>{inProgressCnt}</strong>
                  <span className="overview-note">正在推进</span>
                </span>
              </button>
              <button
                className={`overview-card ${filters.status === 'done' ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, status: 'done', page: 1 })}
              >
                <span className="overview-icon status-done"><CheckmarkCircle20Filled /></span>
                <span className="overview-copy">
                  <span className="overview-label">已完成</span>
                  <strong>{doneCnt}</strong>
                  <span className="overview-note">完成率 {completionRate}%</span>
                </span>
              </button>
            </section>

            <section className="list-surface" aria-label="任务清单">
              <div className="list-surface-header">
                <div>
                  <h2>任务清单</h2>
                  <span>当前显示 {pagination.total || 0} 项</span>
                </div>
              </div>

              <FilterBar filters={filters} onFilterChange={setFilters} tags={tags} />

              {selectedIds.length > 0 && (
                <div className="batch-bar">
                  <span>已选 {selectedIds.length} 项</span>
                  <Button size="small" icon={<CheckmarkCircle20Filled />} onClick={() => handleBatchAction('update_status', 'done')} disabled={batchLoading}>标为完成</Button>
                  <Button size="small" icon={<ArrowReset20Regular />} onClick={() => handleBatchAction('update_status', 'todo')} disabled={batchLoading}>标为待办</Button>
                  <Button size="small" appearance="subtle" icon={<Delete20Regular />} className="danger-action" onClick={() => { if (confirm('确定删除所选任务？')) handleBatchAction('delete'); }} disabled={batchLoading}>删除</Button>
                  <Button size="small" appearance="subtle" onClick={() => setSelectedIds([])}>取消选择</Button>
                </div>
              )}

            <div className="task-list">
              {loading && tasks.length === 0 && (
                <div className="loading-state">
                  <TaskListSkeleton />
                </div>
              )}

              {!loading && tasks.length === 0 && (
                <div className="empty-state">
                  <ClipboardTaskListLtr20Regular className="empty-icon" />
                  <h3>{hasActiveFilters ? '没有符合条件的任务' : '还没有任务'}</h3>
                  <p>{hasActiveFilters ? '调整筛选条件，或者清除筛选查看全部任务。' : '创建第一项任务，开始安排接下来的工作。'}</p>
                  {hasActiveFilters ? (
                    <Button
                      appearance="primary"
                      icon={<ArrowReset20Regular />}
                      onClick={() => setFilters({ ...filters, status: '', priority: '', tag: '', search: '', page: 1 })}
                    >
                      清除筛选
                    </Button>
                  ) : (
                    <Button appearance="primary" icon={<Add20Regular />} onClick={() => { setEditingTask(null); setShowForm(true); }}>新建任务</Button>
                  )}
                </div>
              )}

              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={handleEdit}
                  onStatusChange={handleStatusChange}
                  onSelect={handleSelect}
                  selected={selectedIds.includes(task.id)}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-sm"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                >
                  上一页
                </button>
                <span className="page-info">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  className="btn btn-sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                >
                  下一页
                </button>
              </div>
            )}
            </section>
          </div>
        ) : viewMode === 'kanban' ? (
          <div className="kanban-wrapper">
            {kanbanLoading && kanbanTasks.length === 0 ? (
              <div className="loading-state">
                <TaskListSkeleton />
              </div>
            ) : (
              <KanbanBoard
                tasks={kanbanTasks}
                onEdit={handleEdit}
                onStatusChange={handleStatusChange}
                onSelect={handleSelect}
                selectedIds={selectedIds}
              />
            )}
          </div>
        ) : (
          <div className="kanban-wrapper">
            {kanbanLoading && kanbanTasks.length === 0 ? (
              <div className="loading-state">
                <TaskListSkeleton />
              </div>
            ) : (
              <CalendarBoard
                tasks={kanbanTasks}
                onEdit={handleEdit}
              />
            )}
          </div>
        )}
      </main>

      {/* Modal */}
      {showForm && (
        <TaskForm
          task={editingTask}
          tags={tags}
          onSubmit={handleCreateOrUpdate}
          onSubtasksChanged={handleSubtasksChanged}
          onAttachmentsChanged={handleAttachmentsChanged}
          onCancel={() => { setShowForm(false); setEditingTask(null); }}
        />
      )}
    </div>
    </FluentProvider>
  );
}
