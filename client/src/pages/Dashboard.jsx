import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { tasksApi, backupApi } from '../api';
import { useTasks, useTags, useTaskSummary, useTodayAgenda } from '../hooks/useTasks';
import TaskCard from '../components/TaskCard';
import TaskForm from '../components/TaskForm';
import FilterBar from '../components/FilterBar';
import TagManager from '../components/TagManager';
import KanbanBoard from '../components/KanbanBoard';
import CalendarBoard from '../components/CalendarBoard';
import TodayAgenda from '../components/TodayAgenda';

// 看板 / 日历视图需要一次性展示尽可能多的任务（后端单页上限 500）
const BOARD_LIMIT = 500;

const STATUS_NAV = [
  { value: '__today__', label: '今日台账', icon: '☀', countKey: 'today_focus' },
  { value: '', label: '全部任务', icon: '◇', countKey: 'total' },
  { value: 'todo', label: '待办', icon: '○', countKey: 'todo' },
  { value: 'in_progress', label: '进行中', icon: '◐', countKey: 'in_progress' },
  { value: 'done', label: '已完成', icon: '●', countKey: 'done' },
];

export default function Dashboard() {
  const [filters, setFilters] = useState({ sort: 'created_at', order: 'desc', page: 1, limit: 20 });
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'kanban' | 'calendar'
  const isBoardMode = viewMode === 'kanban' || viewMode === 'calendar';
  const activeStatus = filters.status || '';
  const isTodayMode = viewMode === 'list' && activeStatus === '__today__';

  const listFilters = useMemo(() => {
    if (viewMode !== 'list' || activeStatus === '__today__') return null;
    return filters;
  }, [viewMode, activeStatus, filters]);

  const { tasks, pagination, loading, refetch } = useTasks(listFilters);
  const { summary, refetch: refetchSummary } = useTaskSummary();
  const { tags, refetch: refetchTags } = useTags();
  const { agenda, loading: agendaLoading, refetch: refetchAgenda } = useTodayAgenda(true);

  // 看板 / 日历：沿用搜索、优先级、标签、排序筛选，但忽略状态（由列决定）并始终从第一页取
  const boardFilters = useMemo(() => ({
    sort: filters.sort,
    order: filters.order,
    search: filters.search,
    priority: filters.priority,
    tag: filters.tag,
    page: 1,
    limit: BOARD_LIMIT,
  }), [filters.sort, filters.order, filters.search, filters.priority, filters.tag]);
  const { tasks: boardTasks, pagination: boardPagination, loading: boardLoading, refetch: boardRefetch } =
    useTasks(isBoardMode ? boardFilters : null);

  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('kami_theme') || 'light');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [liveVersion, setLiveVersion] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kami_theme', theme);
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

  /**
   * 任何数据变更后统一刷新统计、标签计数、今日台账以及列表 / 看板视图。
   * 当前未激活的视图只会递增版本号，不会真正发请求，切换回来时自动拉取最新数据。
   */
  const refreshAll = useCallback(() => {
    refetch();
    boardRefetch();
    refetchSummary();
    refetchTags();
    refetchAgenda();
  }, [boardRefetch, refetch, refetchAgenda, refetchSummary, refetchTags]);

  // AI 助手可能在后台通过 API / CLI 修改任务：窗口重新获得焦点时自动同步
  useEffect(() => {
    window.addEventListener('focus', refreshAll);
    return () => window.removeEventListener('focus', refreshAll);
  }, [refreshAll]);

  // SSE 实时推送：后端任何任务 / 子任务 / 笔记 / 标签变更时立即无感刷新
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return undefined;
    }
    const es = new window.EventSource('/api/events');
    let debounceTimer = null;

    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'connected') {
          setSseConnected(true);
          return;
        }
      } catch {
        // ignore malformed frame
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshAll();
        setLiveVersion((v) => v + 1);
      }, 80);
    };

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      es.close();
    };
  }, [refreshAll]);

  const switchView = (mode) => {
    if (mode === viewMode) return;
    setViewMode(mode);
    if (mode === 'list') refetch(); else boardRefetch();
  };

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingTask(null);
  }, []);

  const openCreateForm = () => {
    setEditingTask(null);
    setShowForm(true);
  };

  const handleCreateOrUpdate = async (data) => {
    // 错误交由 TaskForm 内联展示
    if (editingTask) {
      await tasksApi.update(editingTask.id, data);
    } else {
      await tasksApi.create(data);
    }
    closeForm();
    refreshAll();
  };

  const handleDelete = async (task) => {
    if (!confirm(`确定删除任务「${task.title}」？子任务和进展记录也会一并删除。`)) return;
    try {
      await tasksApi.delete(task.id);
      setSelectedIds((prev) => prev.filter((id) => id !== task.id));
      closeForm();
      refreshAll();
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
      refreshAll();
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
      refreshAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setBatchLoading(false);
    }
  };

  const handlePageChange = (page) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleStatusNav = (status) => {
    if (viewMode !== 'list') setViewMode('list');
    setFilters((prev) => ({ ...prev, status, page: 1 }));
    setIsMobileMenuOpen(false);
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
    const input = e.target;
    const file = input.files[0];
    input.value = ''; // reset，允许重复选择同一个文件
    if(!file) return;
    try {
      const data = JSON.parse(await file.text());
      if(!confirm('确定要导入这个备份文件吗？这将覆盖当前的所有数据。')) return;
      await backupApi.import(data);
      alert('导入成功');
      window.location.reload();
    } catch(err) {
      alert('导入失败: ' + err.message);
    }
  };

  // Header counts using summary API to get accurate global data
  const todayFocusCount = (agenda?.tasks?.length || 0) + (agenda?.in_progress_others?.length || 0);
  const counts = {
    today_focus: todayFocusCount,
    total: summary?.total || 0,
    todo: summary?.by_status?.todo || 0,
    in_progress: summary?.by_status?.in_progress || 0,
    done: summary?.by_status?.done || 0,
  };

  return (
    <div className={`dashboard ${isBoardMode ? 'kanban-mode' : ''}`}>
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar — hidden in kanban mode via CSS */}
      <aside className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="brand-icon">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            <div className="brand-copy">
              <span className="brand-name">AgentTODO</span>
              <span className="brand-sub">TASK LEDGER · 紙</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {STATUS_NAV.map((item) => (
            <button
              key={item.value || 'all'}
              className={`nav-item ${activeStatus === item.value ? 'active' : ''}`}
              onClick={() => handleStatusNav(item.value)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {(item.value === '' || counts[item.countKey] > 0) && (
                <span className="nav-badge">{counts[item.countKey]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          <button className="nav-item" onClick={() => setShowTags(!showTags)}>
            <span className="nav-icon">#</span>
            <span>标签管理</span>
            <span className="nav-arrow">{showTags ? '▾' : '▸'}</span>
          </button>
          {showTags && <TagManager tags={tags} onRefresh={refreshAll} />}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">紙</div>
            <div className="user-meta">
              <span className="user-name">本地工作区</span>
              <div className="backup-actions">
                <button className="btn-icon-sm backup-btn" onClick={handleExport} title="导出全量备份">导出备份</button>
                <button className="btn-icon-sm backup-btn" onClick={() => fileInputRef.current?.click()} title="导入全量备份">导入备份</button>
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json,application/json" style={{ display: 'none' }} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="main-header">
          <div className="header-left">
            {/* Mobile Menu Button */}
            <button
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              title="打开菜单"
              aria-label="打开菜单"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            {/* Brand inline — only shows in full screen mode */}
            {isBoardMode && (
              <div className="header-brand">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="brand-icon">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
              </div>
            )}
            <div className="header-heading">
              <div className="header-eyebrow">
                <span>AGENT WORKSPACE · 任务台账</span>
                <span
                  className={`sse-status ${sseConnected ? 'online' : 'offline'}`}
                  title={sseConnected ? 'SSE 实时流已连接：AI / CLI 变更将自动同步' : '正在连接实时流...'}
                >
                  <span className="sse-dot" />
                  {sseConnected ? '实时同步' : '连接中'}
                </span>
              </div>
              <div className="header-title-row">
                <h1>{isTodayMode ? '今日台账' : '我的任务'}</h1>
                <div className="stats-row">
                  <span className="stat">
                    <span className="metric-value">{counts.todo}</span>
                    <span className="metric-label">待办</span>
                  </span>
                  <span className="stat">
                    <span className="metric-value">{counts.in_progress}</span>
                    <span className="metric-label">进行中</span>
                  </span>
                  <span className="stat">
                    <span className="metric-value">{counts.done}</span>
                    <span className="metric-label">已完成</span>
                  </span>
                  {summary?.overdue > 0 && (
                    <span className="stat stat-overdue">
                      <span className="metric-value">{summary.overdue}</span>
                      <span className="metric-label">逾期</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="header-actions">
            {/* Theme toggle */}
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换到宣纸日间模式' : '切换到墨色夜间模式'}
              aria-label={theme === 'dark' ? '切换到宣纸日间模式' : '切换到墨色夜间模式'}
            >
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
            {/* View mode toggle */}
            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => switchView('list')}
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
                onClick={() => switchView('kanban')}
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
                onClick={() => switchView('calendar')}
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
            <button className="btn btn-primary" onClick={openCreateForm}>
              + 新建任务
            </button>
          </div>
        </div>

        {!isTodayMode && (
          <FilterBar filters={filters} onFilterChange={setFilters} tags={tags} showStatus={!isBoardMode} />
        )}

        {isBoardMode && boardPagination.total > boardTasks.length && (
          <div className="board-limit-hint">
            当前仅显示前 {boardTasks.length} / {boardPagination.total} 个任务，可通过搜索或筛选缩小范围。
          </div>
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
        {isTodayMode ? (
          <TodayAgenda
            agenda={agenda}
            loading={agendaLoading}
            onEdit={handleEdit}
            onStatusChange={handleStatusChange}
            onSelect={handleSelect}
            selectedIds={selectedIds}
            onSubtaskChange={refreshAll}
            onCreate={openCreateForm}
          />
        ) : viewMode === 'list' ? (
          <>
            <div className="task-list">
              {loading && tasks.length === 0 && (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>加载中...</p>
                </div>
              )}

              {!loading && tasks.length === 0 && (
                filters.search || filters.status || filters.priority || filters.tag ? (
                  <div className="empty-state">
                    <div className="empty-icon">◇</div>
                    <h3>没有符合条件的任务</h3>
                    <p>试试调整搜索关键词或筛选条件。</p>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">○</div>
                    <h3>还没有任务</h3>
                    <p>点击「新建任务」按钮开始添加你的第一个任务。</p>
                    <button className="btn btn-primary" onClick={openCreateForm}>
                      + 新建任务
                    </button>
                  </div>
                )
              )}

              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={handleEdit}
                  onStatusChange={handleStatusChange}
                  onSelect={handleSelect}
                  selected={selectedIds.includes(task.id)}
                  onSubtaskChange={refreshAll}
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
        ) : (
          <div className="kanban-wrapper">
            {boardLoading && boardTasks.length === 0 ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>加载中...</p>
              </div>
            ) : viewMode === 'kanban' ? (
              <KanbanBoard
                tasks={boardTasks}
                onEdit={handleEdit}
                onStatusChange={handleStatusChange}
                onSelect={handleSelect}
                selectedIds={selectedIds}
                onSubtaskChange={refreshAll}
              />
            ) : (
              <CalendarBoard
                tasks={boardTasks}
                onEdit={handleEdit}
              />
            )}
          </div>
        )}
      </main>

      {/* Modal */}
      {showForm && (
        <TaskForm
          key={editingTask?.id ?? 'new'}
          task={editingTask}
          tags={tags}
          onSubmit={handleCreateOrUpdate}
          onCancel={closeForm}
          onDelete={handleDelete}
          onChanged={refreshAll}
          liveVersion={liveVersion}
        />
      )}
    </div>
  );
}
