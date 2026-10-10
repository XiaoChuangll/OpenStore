/*
 * 图表配色。
 *
 * ECharts 只认具体颜色值，不认 CSS 变量，所以这里：
 *   - 文字、边框这类直接用 Element Plus 的变量（深浅两套值它自己会切）；
 *   - 地图陆地、热力图渐变这些是本站自己的设计，按深浅色各给一套。
 * 主题切换时图表需要重建（主题是 echarts.init 时定下的），见各卡片里的 watch。
 */

/** 取 Element Plus 的 CSS 变量，取不到就用兜底值（比如 jsdom 里没加载样式） */
export const cssVar = (name: string, fallback: string) => {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

export interface VisitorChartColors {
  isDark: boolean;
  text: string;
  axisLine: string;
  mapArea: string;
  mapBorder: string;
  mapRange: string[];
  heatRange: string[];
  heatCellBorder: string;
  heatEmphasisBorder: string;
}

/** 访客分布（世界/中国地图）与访问时段热力图的配色 */
export const visitorChartColors = (isDark: boolean): VisitorChartColors => ({
  isDark,
  text: cssVar('--el-text-color-secondary', '#909399'),
  axisLine: cssVar('--el-border-color-light', 'rgba(144,147,153,0.35)'),
  // 地图：深色下是「暗底陆地」，浅色下换成浅灰陆地 + 深一点的边框
  mapArea: isDark ? '#1a1d23' : cssVar('--el-fill-color-light', '#f5f7fa'),
  mapBorder: isDark ? 'rgba(148,163,184,0.25)' : cssVar('--el-border-color', '#dcdfe6'),
  mapRange: isDark ? ['#1e293b', '#3b6ea5', '#4f86f7'] : ['#e8eef8', '#9dbde6', '#4f86f7'],
  // 热力图：最浅那一档在深色下是深灰、浅色下接近卡片底色
  heatRange: isDark ? ['#1a1d23', '#2f4a70', '#4f86f7'] : ['#f2f5f9', '#a9c4e8', '#4f86f7'],
  heatCellBorder: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.9)',
  heatEmphasisBorder: isDark ? '#e2e8f0' : '#334155'
});
