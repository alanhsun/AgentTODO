import { useState, useEffect } from 'react';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'todo', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'done', label: '已完成' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: '全部优先级' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'due_date', label: '截止日期' },
  { value: 'priority', label: '优先级' },
  { value: 'title', label: '标题' },
];

const SEARCH_DEBOUNCE_MS = 300;

/**
 * @param {object} props
 * @param {object} props.filters
 * @param {(updater: (prev: object) => object) => void} props.onFilterChange - 接收函数式更新（如 React setState）
 * @param {Array} props.tags
 * @param {boolean} [props.showStatus=true] - 看板 / 日历视图下状态由列决定，隐藏状态筛选
 */
export default function FilterBar({ filters, onFilterChange, tags, showStatus = true }) {
  const [searchText, setSearchText] = useState(filters.search || '');
  const committedSearch = filters.search || '';

  // 搜索输入防抖：停止输入 300ms 后才发起请求，避免每个按键都打一次接口
  useEffect(() => {
    if (searchText === committedSearch) return undefined;
    const timer = setTimeout(() => {
      onFilterChange((prev) => ({ ...prev, search: searchText, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, committedSearch, onFilterChange]);

  const handleChange = (key, value) => {
    onFilterChange((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  return (
    <div className="filter-bar">
      <div className="search-wrapper">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          id="search-input"
          type="search"
          placeholder="搜索任务..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="search-input"
          aria-label="搜索任务"
        />
      </div>

      <div className="filter-selects">
        {showStatus && (
          <select
            id="filter-status"
            value={filters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            aria-label="按状态筛选"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}

        <select
          id="filter-priority"
          value={filters.priority || ''}
          onChange={(e) => handleChange('priority', e.target.value)}
          aria-label="按优先级筛选"
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {tags && tags.length > 0 && (
          <select
            id="filter-tag"
            value={filters.tag || ''}
            onChange={(e) => handleChange('tag', e.target.value)}
            aria-label="按标签筛选"
          >
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}

        <select
          id="filter-sort"
          value={filters.sort || 'created_at'}
          onChange={(e) => handleChange('sort', e.target.value)}
          aria-label="排序字段"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button
          className={`btn-icon sort-order ${filters.order === 'asc' ? 'asc' : ''}`}
          onClick={() => handleChange('order', filters.order === 'asc' ? 'desc' : 'asc')}
          title={filters.order === 'asc' ? '升序' : '降序'}
          aria-label={filters.order === 'asc' ? '当前升序，点击切换为降序' : '当前降序，点击切换为升序'}
        >
          {filters.order === 'asc' ? '↑' : '↓'}
        </button>
      </div>
    </div>
  );
}
