/**
 * SDK 分布（目标 SDK / 最低 SDK）的公共处理：
 * 上游返回的是 [[sdk 版本号, 应用数], ...]，版本很多、尾部很长。
 * 统一取前 4 名单独列出，其余合并成「其他」，正好和评分卡的 5 行图例对齐，
 * 三张卡片的内容高度因此保持一致。
 */
export interface SdkRow {
  index: number;
  name: string;
  count: number;
  color: string;
  barWidth: string;
  percentText: string;
}

const TOP_ROWS = 4;
const TOP_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6'];
const OTHER_COLOR = '#94a3b8';

export const formatPercent = (value: number) => {
  if (value <= 0) return '0%';
  if (value < 1) return '<1%';
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
};

export const formatCompact = (value: number) =>
  value >= 10000 ? `${(value / 10000).toFixed(1)}万` : value.toLocaleString();

export const buildSdkRows = (data: unknown): { rows: SdkRow[]; total: number } => {
  const entries = (Array.isArray(data) ? data : [])
    .map((item: any) => ({ sdk: Number(item?.[0]), count: Number(item?.[1] || 0) }))
    .filter((item) => Number.isFinite(item.sdk) && item.count > 0)
    .sort((a, b) => b.count - a.count);

  const total = entries.reduce((acc, item) => acc + item.count, 0);
  if (!total) return { rows: [], total: 0 };

  const maxCount = entries[0]?.count || 1;
  const toRow = (index: number, name: string, count: number, color: string): SdkRow => ({
    index,
    name,
    count,
    color,
    barWidth: `${Math.max((count / maxCount) * 100, count > 0 ? 3 : 0)}%`,
    percentText: formatPercent((count / total) * 100)
  });

  const rows = entries
    .slice(0, TOP_ROWS)
    .map((item, index) => toRow(index, `SDK ${item.sdk}`, item.count, TOP_COLORS[index]));

  const rest = entries.slice(TOP_ROWS);
  if (rest.length) {
    rows.push(toRow(rows.length, '其他', rest.reduce((acc, item) => acc + item.count, 0), OTHER_COLOR));
  }

  return { rows, total };
};
