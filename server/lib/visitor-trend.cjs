/*
 * 访客趋势（天粒度）的窗口 SQL。
 *
 * timestamp 列按 UTC 存，但管理员的「今天 / 本周」是北京时间，所以：
 *   - 分桶按北京时间切天：否则北京 0~8 点的访问会被算进前一天；
 *   - 窗口起点是北京时间的 0 点，且 days 含今天（days=7 → 今天往前 6 天的 0 点起）；
 * offset 用于对比「上一个周期」：整段窗口往回推 offset 天，与当前窗口不重叠。
 */

/** 北京某天 0 点对应的 UTC 时刻（modifier 里带偏移量，如 "-3 days"） */
const BJ_MIDNIGHT = "datetime('now','+8 hours','start of day','-8 hours'";

const buildDayTrendQuery = ({ days, offset = 0 } = {}) => {
  const span = Math.max(1, Math.floor(Number(days) || 1));
  const shift = Math.max(0, Math.floor(Number(offset) || 0));

  // 起点：今天往前 (span - 1 + shift) 天的北京 0 点
  const startExpr = `${BJ_MIDNIGHT},'-' || ? || ' days')`;
  // 终点（不含）：窗口最后一天的次日 0 点
  const endAhead = shift <= 1;
  const endExpr = `${BJ_MIDNIGHT},'${endAhead ? '+' : '-'}' || ? || ' days')`;

  return {
    // 两个边界都直接比较 timestamp 列，才能用上索引（别把列包进函数里）
    where: `timestamp >= ${startExpr} AND timestamp < ${endExpr}`,
    params: [span - 1 + shift, endAhead ? 1 - shift : shift - 1],
    bucket: `strftime('%Y-%m-%d', datetime(timestamp, '+8 hours'))`
  };
};

module.exports = { buildDayTrendQuery };
