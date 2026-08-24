import { Button, Input, Select } from '@fluentui/react-components';
import { ArrowSortDown20Regular, ArrowSortUp20Regular, Search20Regular } from '@fluentui/react-icons';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../utils/taskOptions';

const SORT_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'due_date', label: '截止日期' },
  { value: 'priority', label: '优先级' },
  { value: 'title', label: '标题' },
];

export default function FilterBar({ filters, onFilterChange, tags }) {
  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value, page: 1 });
  };

  return (
    <div className="filter-bar">
      <div className="search-wrapper">
        <Input
          id="search-input"
          aria-label="搜索任务"
          placeholder="搜索任务"
          value={filters.search || ''}
          onChange={(e) => handleChange('search', e.target.value)}
          className="search-input"
          contentBefore={<Search20Regular />}
        />
      </div>

      <div className="filter-selects">
        <Select
          id="filter-status"
          aria-label="按状态筛选"
          value={filters.status || ''}
          onChange={(e) => handleChange('status', e.target.value)}
        >
          <option value="">全部状态</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>

        <Select
          id="filter-priority"
          aria-label="按优先级筛选"
          value={filters.priority || ''}
          onChange={(e) => handleChange('priority', e.target.value)}
        >
          <option value="">全部优先级</option>
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>

        {tags && tags.length > 0 && (
          <Select
            id="filter-tag"
            aria-label="按标签筛选"
            value={filters.tag || ''}
            onChange={(e) => handleChange('tag', e.target.value)}
          >
            <option value="">全部标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </Select>
        )}

        <Select
          id="filter-sort"
          aria-label="排序字段"
          value={filters.sort || 'created_at'}
          onChange={(e) => handleChange('sort', e.target.value)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>

        <Button
          appearance="subtle"
          className="sort-order"
          onClick={() => handleChange('order', filters.order === 'asc' ? 'desc' : 'asc')}
          icon={filters.order === 'asc' ? <ArrowSortUp20Regular /> : <ArrowSortDown20Regular />}
          aria-label={filters.order === 'asc' ? '当前升序，切换为降序' : '当前降序，切换为升序'}
          title={filters.order === 'asc' ? '升序' : '降序'}
        />
      </div>
    </div>
  );
}
