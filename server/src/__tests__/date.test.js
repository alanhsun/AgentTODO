const {
  formatLocalDate, isValidDateString, normalizeDate, addInterval, nextOccurrenceDate,
} = require('../utils/date');

describe('date utils', () => {
  test('formatLocalDate 使用本地时区', () => {
    expect(formatLocalDate(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });

  test('isValidDateString 拒绝不存在的日期', () => {
    expect(isValidDateString('2024-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026/01/01')).toBe(false);
  });

  test('normalizeDate', () => {
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate('2026-03-10')).toBe('2026-03-10');
    expect(normalizeDate('2026-03-10T23:00:00Z')).toBe('2026-03-10');
    expect(normalizeDate('tomorrow')).toBeUndefined();
    expect(normalizeDate(123)).toBeUndefined();
  });

  test('addInterval 处理跨月与月末', () => {
    expect(addInterval('2026-01-31', 'daily')).toBe('2026-02-01');
    expect(addInterval('2026-12-29', 'weekly')).toBe('2027-01-05');
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addInterval('2024-01-31', 'monthly')).toBe('2024-02-29');
    expect(addInterval('2026-12-15', 'monthly')).toBe('2027-01-15');
    expect(addInterval('2026-01-01', 'none')).toBeNull();
  });

  test('nextOccurrenceDate 总是落在今天之后', () => {
    expect(nextOccurrenceDate('2026-03-01', 'daily', '2026-03-10')).toBe('2026-03-11');
    expect(nextOccurrenceDate('2026-03-09', 'weekly', '2026-03-10')).toBe('2026-03-16');
    expect(nextOccurrenceDate('2026-03-20', 'weekly', '2026-03-10')).toBe('2026-03-27');
    expect(nextOccurrenceDate(null, 'daily', '2026-03-10')).toBe('2026-03-11');
    expect(nextOccurrenceDate('2026-03-10', 'none', '2026-03-10')).toBeNull();
  });
});
