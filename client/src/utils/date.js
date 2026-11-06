/**
 * 前端日期工具：截止日期是纯日期字符串 (YYYY-MM-DD)，必须按本地日期处理。
 * 直接 new Date('2026-03-10') 会被解析为 UTC 零点，在东八区会导致"今天/明天"判断错位一天。
 */

const pad = (n) => String(n).padStart(2, '0');

export function formatLocalDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 将 YYYY-MM-DD（或带时间的字符串）解析为本地零点的 Date */
export function parseLocalDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 目标日期距离今天的天数（今天 = 0，昨天 = -1） */
export function daysFromToday(value) {
  const target = parseLocalDate(value);
  if (!target) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}
