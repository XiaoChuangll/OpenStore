import { describe, it, expect } from 'vitest';
import { daysSinceInclusive, startOfDay, startOfMonth, startOfWeek } from '../../src/utils/date-range';

/*
 * 「本周 / 本月」是自然周期：周三时本周只有 3 天（周一到今天）。
 * 之前它们被写成固定的 days: 7 / 30，跟「最近7天 / 最近30天」完全一样。
 * 用固定日期测，避免受「今天星期几」影响。
 */

describe('日期区间', () => {
  it('本周从周一算起（周三 → 周一到周三共 3 天）', () => {
    const wednesday = new Date('2026-10-07T15:20:00');

    expect(startOfWeek(wednesday).getDate()).toBe(5); // 2026-10-05 周一
    expect(startOfWeek(wednesday).getHours()).toBe(0);
    expect(daysSinceInclusive(startOfWeek(wednesday), wednesday)).toBe(3);
  });

  it('周日属于本周（周日 → 周一到周日共 7 天，此时与最近7天重合）', () => {
    const sunday = new Date('2026-10-11T09:00:00');

    expect(startOfWeek(sunday).getDate()).toBe(5);
    expect(daysSinceInclusive(startOfWeek(sunday), sunday)).toBe(7);
  });

  it('周一当天就是 1 天', () => {
    const monday = new Date('2026-10-05T00:30:00');

    expect(daysSinceInclusive(startOfWeek(monday), monday)).toBe(1);
  });

  it('跨月 / 跨年也算得对', () => {
    const newYear = new Date('2026-01-01T10:00:00'); // 周四
    expect(startOfWeek(newYear).getMonth()).toBe(11); // 2025-12-29 周一
    expect(startOfWeek(newYear).getDate()).toBe(29);

    const firstDay = new Date('2026-11-01T10:00:00');
    expect(startOfMonth(firstDay).getMonth()).toBe(10);
    expect(daysSinceInclusive(startOfMonth(firstDay), firstDay)).toBe(1);

    const endOfMonth = new Date('2026-10-31T23:00:00');
    expect(daysSinceInclusive(startOfMonth(endOfMonth), endOfMonth)).toBe(31);
  });

  it('至少返回 1 天，且不会受时间部分影响', () => {
    const now = new Date('2026-10-11T23:59:59');

    expect(daysSinceInclusive(now, now)).toBe(1);
    expect(startOfDay(now).getHours()).toBe(0);
    expect(startOfDay(now).getMinutes()).toBe(0);
  });
});
