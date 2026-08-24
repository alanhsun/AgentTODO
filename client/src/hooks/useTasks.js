import { useState, useEffect, useCallback } from 'react';
import { tasksApi, tagsApi } from '../api';

const EMPTY_PAGINATION = { page: 1, limit: 20, total: 0, totalPages: 0 };

async function loadTasks(filters, allPages) {
  const firstPage = await tasksApi.list(allPages ? { ...filters, page: 1, limit: 100 } : filters);
  if (!allPages || firstPage.pagination.totalPages <= 1) return firstPage;

  const pageRequests = [];
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    pageRequests.push(tasksApi.list({ ...filters, page, limit: 100 }));
  }
  const remainingPages = await Promise.all(pageRequests);
  const data = [firstPage, ...remainingPages].flatMap((result) => result.data);
  return {
    data,
    pagination: { page: 1, limit: data.length, total: firstPage.pagination.total, totalPages: 1 },
  };
}

export function useTasks(filters = {}, { allPages = false } = {}) {
  const [result, setResult] = useState({ data: [], pagination: EMPTY_PAGINATION, requestKey: null });
  const enabled = filters !== null;
  const requestKey = enabled ? JSON.stringify({ filters, allPages }) : null;

  const fetchTasks = async () => {
    if (!enabled) return;
    try {
      const response = await loadTasks(filters, allPages);
      setResult({ ...response, requestKey });
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  };

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;
    loadTasks(filters, allPages)
      .then((response) => {
        if (active) setResult({ ...response, requestKey });
      })
      .catch((err) => console.error('Failed to fetch tasks:', err));

    return () => { active = false; };
  }, [allPages, enabled, filters, requestKey]);

  return {
    tasks: result.data,
    pagination: result.pagination,
    loading: enabled && result.requestKey !== requestKey,
    refetch: fetchTasks,
  };
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

  useEffect(() => {
    let active = true;
    tagsApi.list()
      .then((data) => {
        if (active) setTags(data);
      })
      .catch((err) => console.error('Failed to fetch tags:', err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

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

  useEffect(() => {
    let active = true;
    tasksApi.summary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch((err) => console.error('Failed to fetch summary:', err));
    return () => { active = false; };
  }, []);

  return { summary, refetch: fetchSummary };
}
