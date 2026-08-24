import { useState } from 'react';
import { Button } from '@fluentui/react-components';
import { Add16Regular, Delete16Regular, Dismiss16Regular, Edit16Regular } from '@fluentui/react-icons';
import { tagsApi } from '../api';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#64748b', '#a855f7',
];

export default function TagManager({ tags, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editTag, setEditTag] = useState(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [error, setError] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setEditTag(null);
    setName('');
    setColor(PRESET_COLORS[0]);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editTag) {
        await tagsApi.update(editTag.id, { name, color });
      } else {
        await tagsApi.create({ name, color });
      }
      resetForm();
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除该标签？关联的任务标签也会被移除。')) return;
    try {
      await tagsApi.delete(id);
      onRefresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (tag) => {
    setEditTag(tag);
    setName(tag.name);
    setColor(tag.color);
    setShowForm(true);
  };

  return (
    <div className="tag-manager">
      <div className="tag-manager-header">
        <h3>标签管理</h3>
        <Button appearance={showForm ? 'subtle' : 'primary'} size="small" icon={showForm ? <Dismiss16Regular /> : <Add16Regular />} onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm ? '取消' : '新标签'}
        </Button>
      </div>

      {showForm && (
        <form className="tag-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="标签名称"
            required
            autoFocus
          />
          <div className="color-picker">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-dot ${color === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          {error && <div className="form-error">{error}</div>}
          <Button type="submit" appearance="primary" size="small">
            {editTag ? '保存' : '创建'}
          </Button>
        </form>
      )}

      <div className="tag-list">
        {tags.length === 0 && <p className="empty-text">暂无标签</p>}
        {tags.map((tag) => (
          <div key={tag.id} className="tag-item">
            <span className="tag-badge" style={{ '--tag-color': tag.color }}>{tag.name}</span>
            <span className="tag-count">{tag.task_count} 个任务</span>
            <div className="tag-actions">
              <Button appearance="subtle" size="small" icon={<Edit16Regular />} onClick={() => startEdit(tag)} aria-label={`编辑标签${tag.name}`} title="编辑" />
              <Button appearance="subtle" size="small" icon={<Delete16Regular />} className="danger-action" onClick={() => handleDelete(tag.id)} aria-label={`删除标签${tag.name}`} title="删除" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
