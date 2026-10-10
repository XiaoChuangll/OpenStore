/*
 * 日期区间的小工具。
 *
 * 「本周」「本月」这类是自然周期，不是「最近 N 天」：
 * 周三时「本周」应该只有 3 天（周一到今天），而不是滚动 7 天。
 * 访客趋势接口的 days 含今天，所以这里算出的天数可以直接当 days 传。
 */

/** 当天 0 点（本地时间） */
export const startOfDay = (now: Date = new Date()) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** 本周一 0 点（周一为一周之始） */
export const startOfWeek = (now: Date = new Date()) => {
  const d = startOfDay(now);
  // getDay: 0=周日 … 6=周六；周日要回退 6 天到周一
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

/** 本月 1 号 0 点 */
export const startOfMonth = (now: Date = new Date()) => {
  const d = startOfDay(now);
  d.setDate(1);
  return d;
};

/** 从 start 到 now 一共几天（含两端），至少 1；用于趋势接口的 days 参数 */
export const daysSinceInclusive = (start: Date, now: Date = new Date()) => {
  const from = startOfDay(start).getTime();
  const to = startOfDay(now).getTime();
  // 跨夏令时会差一小时，用四舍五入而不是取整
  return Math.max(1, Math.round((to - from) / 86400000) + 1);
};
