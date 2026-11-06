import { useState, useEffect, useCallback } from 'react';
import { tasksApi, tagsApi } from '../api';

const EMPTY_PAGINATION = { page: 1, limit: 20, total: 0, totalPages: 0 };

/**
 * 通用远程数据 Hook：
 * - requestKey 变化或调用 refetch 时重新请求
 * - 使用 AbortController 取消过期请求，避免快速输入搜索时旧结果覆盖新结果
 * - loading 由"当前结果是否对应最新请求"推导，无需在 effect 中同步 setState
 *
 * @param {(params: any, opts: {signal: AbortSignal}) => Promise<any>} fetcher - 需保持引用稳定
 * @param {string|null} paramsKey - JSON 序列化的请求参数；为 null 时不请求
 */
function useRemote(fetcher, paramsKey) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState({ key: null, data: undefined, error: null });
  const requestKey = paramsKey === null ? null : `${paramsKey}#${version}`;

  useEffect(() => {
    if (requestKey === null) return undefined;
    const controller = new AbortController();
    const params = JSON.parse(paramsKey);
    fetcher(params, { signal: controller.signal })
      .then((data) => setResult({ key: requestKey, data, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error('Request failed:', error);
        setResult((prev) => ({ key: requestKey, data: prev.data, error }));
      });
    return () => controller.abort();
  }, [fetcher, paramsKey, requestKey]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);
  const loading = requestKey !== null && result.key !== requestKey;

  return { data: result.data, error: result.error, loading, refetch };
}

const fetchTasks = (params, opts) => tasksApi.list(params, opts);
const fetchTags = (_params, opts) => tagsApi.list(opts);
const fetchSummary = (_params, opts) => tasksApi.summary(opts);
const fetchToday = (_params, opts) => tasksApi.today(opts);

/** @param {object|null} filters - 传 null 表示暂不请求 */
export function useTasks(filters = {}) {
  const key = filters === null ? null : JSON.stringify(filters);
  const { data, loading, error, refetch } = useRemote(fetchTasks, key);
  return {
    tasks: data?.data || [],
    pagination: data?.pagination || EMPTY_PAGINATION,
    loading,
    error,
    refetch,
  };
}

export function useTags() {
  const { data, loading, refetch } = useRemote(fetchTags, '{}');
  return { tags: data || [], loading, refetch };
}

export function useTaskSummary() {
  const { data, refetch } = useRemote(fetchSummary, '{}');
  return { summary: data || null, refetch };
}

export function useTodayAgenda(enabled = true) {
  const { data, loading, error, refetch } = useRemote(fetchToday, enabled ? '{}' : null);
  return {
    agenda: data || null,
    loading,
    error,
    refetch,
  };
}
