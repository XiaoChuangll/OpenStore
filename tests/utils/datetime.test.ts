import { describe, it, expect } from 'vitest';
import { parseDbTime, formatDbTime, formatDbDate } from '../../src/utils/datetime';

/*
 * SQLite 时间戳按 UTC 存储且不带时区标记，直接交给 new Date() 会被当成本地时间。
 * 这里固定 2026-10-13 17:26:46 UTC（= 北京时间 2026-10-14 01:26:46）作为基准。
 */
describe('SQLite 时间戳格式化', () => {
  it('无时区标记的字符串按 UTC 解释', () => {
    const date = parseDbTime('2026-10-13 17:26:46');
    expect(date?.toISOString()).toBe('2026-10-13T17:26:46.000Z');
  });

  it('转北京时间后日期与时刻都正确（跨天不能显示成前一天）', () => {
    // 关键用例：UTC 日期是 10-13，北京时间已是 10-14
    expect(formatDbDate('2026-10-13 17:26:46')).toContain('2026');
    expect(formatDbDate('2026-10-13 17:26:46')).toMatch(/10\/14|2026\/10\/14/);

    const text = formatDbTime('2026-10-13 17:26:46');
    expect(text).toMatch(/01:26:46/);
    expect(text).not.toMatch(/17:26:46/); // 不能原样显示 UTC 时刻
  });

  it('已带时区标记的时间戳原样解析', () => {
    expect(parseDbTime('2026-10-13T17:26:46Z')?.toISOString()).toBe('2026-10-13T17:26:46.000Z');
    expect(parseDbTime('2026-10-13T17:26:46+00:00')?.toISOString()).toBe('2026-10-13T17:26:46.000Z');
    // 带 +08:00 的表示同一时刻
    expect(parseDbTime('2026-10-14T01:26:46+08:00')?.toISOString()).toBe('2026-10-13T17:26:46.000Z');
  });

  it('毫秒时间戳与 Date 对象可用', () => {
    const ms = Date.UTC(2026, 9, 13, 17, 26, 46);
    expect(parseDbTime(ms)?.toISOString()).toBe('2026-10-13T17:26:46.000Z');
    expect(parseDbTime(new Date(ms))?.toISOString()).toBe('2026-10-13T17:26:46.000Z');
  });

  it('空值与非法值返回兜底', () => {
    expect(parseDbTime(null)).toBeNull();
    expect(parseDbTime(undefined)).toBeNull();
    expect(parseDbTime('')).toBeNull();
    expect(parseDbTime('   ')).toBeNull();
    expect(parseDbTime('not-a-date')).toBeNull();
    expect(formatDbTime(null)).toBe('—');
    expect(formatDbTime('', '无')).toBe('无');
  });
});
