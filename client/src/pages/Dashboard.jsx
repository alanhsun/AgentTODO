import { useState, useCallback, useEffect, useRef } from 'react';
import { tasksApi, backupApi } from '../api';
import { useTasks, useTags, useTaskSummary } from '../hooks/useTasks';
import TaskCard from '../components/TaskCard';
import TaskForm from '../components/TaskForm';
import FilterBar from '../components/FilterBar';
import TagManager from '../components/TagManager';
import KanbanBoard from '../components/KanbanBoard';
import CalendarBoard from '../components/CalendarBoard';

export default function Dashboard() {
  const [filters, setFilters] = useState({ sort: 'created_at', order: 'desc', page: 1, limit: 20 });
  const { tasks, pagination, loading, refetch } = useTasks(filters);
  const { summary, refetch: refetchSummary } = useTaskSummary();
  const { tags, refetch: refetchTags } = useTags();
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'kanban'
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

  // For kanban and calendar view, fetch more tasks with no status filter
  const kanbanFilters = { ...filters, limit: 100, status: '' };
  const { tasks: kanbanTasks, loading: kanbanLoading, refetch: kanbanRefetch } = useTasks(
    viewMode === 'kanban' || viewMode === 'calendar' ? kanbanFilters : null
  );

  const handleCreateOrUpdate = async (data) => {
    try {
      if (editingTask) {
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
      await tasksApi.update(id, { status });
      refetch();
      refetchSummary();
      if (viewMode === 'kanban' || viewMode === 'calendar') kanbanRefetch();
    } catch (err) {
      alert(err.message);
    }
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
      const data = await backupApi.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agenttodo-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if(!confirm('确定要导入这个备份文件吗？这将覆盖当前的所有数据。')) {
          e.target.value = null;
          return;
        }
        await backupApi.import(data);
        alert('导入成功');
        window.location.reload();
      } catch(err) {
        alert('导入失败: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset
  };

  // Summary counts (use kanban tasks when in kanban or calendar mode for accurate totals)
  const activeTasks = (viewMode === 'kanban' || viewMode === 'calendar') ? kanbanTasks : tasks;
  
  // Header counts using summary API to get accurate global data
  const todoCnt = summary?.by_status?.todo || 0;
  const inProgressCnt = summary?.by_status?.in_progress || 0;
  const doneCnt = summary?.by_status?.done || 0;
  const totalCnt = summary?.total || 0;

  return (
    <div className={`dashboard ${viewMode === 'kanban' || viewMode === 'calendar' ? 'kanban-mode' : ''}`}>
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar — hidden in kanban mode via CSS */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="brand-icon">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            <span>AgentTODO</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${filters.status === '' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: '', page: 1 })}>
            <span className="nav-icon">📋</span>
            <span>全部任务</span>
            <span className="nav-badge">{totalCnt}</span>
          </button>
          <button className={`nav-item ${filters.status === 'todo' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: 'todo', page: 1 })}>
            <span className="nav-icon">○</span>
            <span>待办</span>
            {todoCnt > 0 && <span className="nav-badge">{todoCnt}</span>}
          </button>
          <button className={`nav-item ${filters.status === 'in_progress' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: 'in_progress', page: 1 })}>
            <span className="nav-icon">◐</span>
            <span>进行中</span>
            {inProgressCnt > 0 && <span className="nav-badge">{inProgressCnt}</span>}
          </button>
          <button className={`nav-item ${filters.status === 'done' ? 'active' : ''}`} onClick={() => setFilters({ ...filters, status: 'done', page: 1 })}>
            <span className="nav-icon">●</span>
            <span>已完成</span>
            {doneCnt > 0 && <span className="nav-badge">{doneCnt}</span>}
          </button>
        </nav>

        <div className="sidebar-section">
          <button className="nav-item" onClick={() => setShowTags(!showTags)}>
            <span className="nav-icon">🏷️</span>
            <span>标签管理</span>
            <span className="nav-arrow">{showTags ? '▾' : '▸'}</span>
          </button>
          {showTags && <TagManager tags={tags} onRefresh={() => { refetchTags(); refetch(); }} />}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">📋</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="user-name">本地用户</span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button className="btn-icon-sm" onClick={handleExport} title="导出全量备份" style={{ fontSize: '11px', padding: '0 4px', border: '1px solid var(--border)' }}>导出</button>
                <button className="btn-icon-sm" onClick={() => fileInputRef.current?.click()} title="导入全量备份" style={{ fontSize: '11px', padding: '0 4px', border: '1px solid var(--border)' }}>导入</button>
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" style={{ display: 'none' }} />
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          {/* Brand inline — only shows in full screen mode */}
          {(viewMode === 'kanban' || viewMode === 'calendar') && (
            <div className="header-brand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="brand-icon">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
          )}
          <div>
            <h1>我的任务</h1>
            <div className="stats-row">
              <span className="stat"><span className="stat-dot todo"></span>待办 {todoCnt}</span>
              <span className="stat"><span className="stat-dot in-progress"></span>进行中 {inProgressCnt}</span>
              <span className="stat"><span className="stat-dot done"></span>已完成 {doneCnt}</span>
            </div>
          </div>
          <div className="header-actions">
            {/* Space holder for kanban mode */}
            {/* Theme toggle */}
            <button className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {/* View mode toggle */}
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="列表视图"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="1" y1="3" x2="15" y2="3" />
                  <line x1="1" y1="8" x2="15" y2="8" />
                  <line x1="1" y1="13" x2="15" y2="13" />
                </svg>
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                onClick={() => setViewMode('kanban')}
                title="看板视图"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="3.5" height="14" rx="1" />
                  <rect x="6.25" y="1" width="3.5" height="10" rx="1" />
                  <rect x="11.5" y="1" width="3.5" height="7" rx="1" />
                </svg>
              </button>
              <button
                className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                onClick={() => setViewMode('calendar')}
                title="日历视图"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="12" height="11" rx="1" />
                  <line x1="2" y1="7" x2="14" y2="7" />
                  <line x1="5" y1="1" x2="5" y2="4" />
                  <line x1="11" y1="1" x2="11" y2="4" />
                </svg>
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => { setEditingTask(null); setShowForm(true); }}>
              + 新建任务
            </button>
          </div>
        </div>

        {/* Filter bar — only in list mode */}
        {viewMode === 'list' && (
          <FilterBar filters={filters} onFilterChange={setFilters} tags={tags} />
        )}

        {/* Batch actions */}
        {selectedIds.length > 0 && (
          <div className="batch-bar">
            <span>已选 {selectedIds.length} 项</span>
            <button className="btn btn-sm" onClick={() => handleBatchAction('update_status', 'done')} disabled={batchLoading}>✓ 标为完成</button>
            <button className="btn btn-sm" onClick={() => handleBatchAction('update_status', 'todo')} disabled={batchLoading}>↺ 标为待办</button>
            <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('确定删除所选任务？')) handleBatchAction('delete'); }} disabled={batchLoading}>✕ 删除</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSelectedIds([])}>取消选择</button>
          </div>
        )}

        {/* Task views */}
        {viewMode === 'list' ? (
          <>
            <div className="task-list">
              {loading && tasks.length === 0 && (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>加载中...</p>
                </div>
              )}

              {!loading && tasks.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📝</div>
                  <h3>还没有任务</h3>
                  <p>点击「新建任务」按钮开始添加你的第一个任务吧！</p>
                  <button className="btn btn-primary" onClick={() => { setEditingTask(null); setShowForm(true); }}>
                    + 新建任务
                  </button>
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
          </>
        ) : viewMode === 'kanban' ? (
          <div className="kanban-wrapper">
            {kanbanLoading && kanbanTasks.length === 0 ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>加载中...</p>
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
                <div className="spinner"></div>
                <p>加载中...</p>
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
          onCancel={() => { setShowForm(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
