import { useState, useEffect, useCallback } from 'react';
import { tasksApi, tagsApi } from '../api';

export function useTasks(filters = {}) {
  const [tasks, setTasks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const enabled = filters !== null;

  const fetchTasks = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await tasksApi.list(filters);
      setTasks(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled, JSON.stringify(filters)]);

  useEffect(() => { if (enabled) fetchTasks(); }, [fetchTasks, enabled]);

  return { tasks, pagination, loading, refetch: fetchTasks };
}

export function useTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tagsApi.list();
      setTags(data);
    } catch (err) {
      console.error('Failed to fetch tags:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  return { tags, loading, refetch: fetchTags };
}

export function useTaskSummary() {
  const [summary, setSummary] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await tasksApi.summary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  return { summary, refetch: fetchSummary };
}
