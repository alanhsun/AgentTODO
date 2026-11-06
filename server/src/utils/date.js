/**
 * 日期工具
 *
 * 所有"今天"相关的判断都必须使用服务器本地时区（可通过 TZ 环境变量配置），
 * 不能使用 `new Date().toISOString()`，否则在 UTC+8 等时区的凌晨 0~8 点会把"今天"算成"昨天"。
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})T/;

function pad(n) {
  return String(n).padStart(2, '0');
}

/** 将 Date 对象格式化为本地时区的 YYYY-MM-DD */
function formatLocalDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 本地时区的今天 (YYYY-MM-DD) */
function today() {
  return formatLocalDate(new Date());
}

/** 严格校验 YYYY-MM-DD 且为真实存在的日期（拒绝 2026-02-30 之类） */
function isValidDateString(value) {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * 规范化日期输入：
 * - null / undefined / '' → null
 * - 'YYYY-MM-DD' → 原样
 * - ISO datetime（如 AI 生成的 '2026-03-10T09:00:00Z'）→ 取日期部分
 * - 其它 → undefined（表示非法）
 */
function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (isValidDateString(trimmed)) return trimmed;
  const m = ISO_DATETIME_PREFIX_RE.exec(trimmed);
  if (m && isValidDateString(m[1])) return m[1];
  return undefined;
}

/**
 * 在 YYYY-MM-DD 上增加一个重复周期。
 * monthly 会对月末做夹取（1-31 → 2-28/29）。
 */
function addInterval(dateStr, recurrence) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let dt;
  switch (recurrence) {
    case 'daily':
      dt = new Date(Date.UTC(y, m - 1, d + 1));
      break;
    case 'weekly':
      dt = new Date(Date.UTC(y, m - 1, d + 7));
      break;
    case 'monthly': {
      const lastDayOfNextMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      dt = new Date(Date.UTC(y, m, Math.min(d, lastDayOfNextMonth)));
      break;
    }
    default:
      return null;
  }
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * 计算周期任务的下一次到期日：
 * 从原到期日（没有则从今天）开始按周期推进，直到严格晚于今天。
 * 这样即使习惯任务已逾期多天，完成后下一次也会落在未来，而不是继续逾期。
 */
function nextOccurrenceDate(baseDate, recurrence, todayStr = today()) {
  if (!['daily', 'weekly', 'monthly'].includes(recurrence)) return null;
  let next = addInterval(baseDate || todayStr, recurrence);
  // 安全上限，防止异常数据导致死循环
  for (let i = 0; i < 1000 && next <= todayStr; i++) {
    next = addInterval(next, recurrence);
  }
  return next;
}

module.exports = {
  formatLocalDate,
  today,
  isValidDateString,
  normalizeDate,
  addInterval,
  nextOccurrenceDate,
};
