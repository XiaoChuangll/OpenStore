/*
 * SQLite 时间戳的展示格式化。
 *
 * 后端时间戳统一按 UTC 存储（SQLite 的 datetime('now') 即 UTC），格式为
 * "YYYY-MM-DD HH:MM:SS"，**不带时区标记**。
 * 直接把这种字符串交给 new Date() 会被当成「本地时间」解析：在 UTC+8 的机器上
 * 于北京时间 01:26 提交的记录（库中 17:26）会显示成 17:26，日期还会差一天。
 *
 * 所以这里先按 UTC 解析（补 Z，并把空格换成 T）再转北京时间展示。
 */

/** SQLite 时间戳 → Date（按 UTC 解释） */
export const parseDbTime = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  // 纯数字：按毫秒时间戳处理
  if (/^\d+$/.test(raw)) {
    const ms = Number(raw);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // 已带时区标记（Z 或 ±HH:MM）的原样解析
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasZone ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** 格式化为北京时间字符串，例如 2026/10/14 01:26:46 */
export const formatDbTime = (value: string | number | Date | null | undefined, fallback = '—'): string => {
  const date = parseDbTime(value);
  if (!date) return fallback;
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

/** 只要北京时间的日期部分，例如 2026/10/14 */
export const formatDbDate = (value: string | number | Date | null | undefined, fallback = '—'): string => {
  const date = parseDbTime(value);
  if (!date) return fallback;
  return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
};
