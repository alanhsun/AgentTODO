export const STATUS_LABELS = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
};

export const PRIORITY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

export const RECURRENCE_LABELS = {
  none: '不重复',
  daily: '每天',
  weekdays: '每个工作日',
  weekly: '每周',
  monthly: '每月',
};

const toOptions = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }));

export const STATUS_OPTIONS = toOptions(STATUS_LABELS);
export const PRIORITY_OPTIONS = toOptions(PRIORITY_LABELS);
export const RECURRENCE_OPTIONS = toOptions(RECURRENCE_LABELS);
