/*
 * Hero 背景「绿色贡献格」的生成规则。
 * 页面（.hero-grid 里的内联 SVG）和导出的名牌图片都用这一份，保证两处一致。
 * 每个格子是否点亮、多亮，由 (列, 行) 的哈希决定：确定性、可复现，不需要资源文件。
 */

/** 点亮比例 */
export const GREEN_DENSITY = 0.22;
/** 点亮时的深浅档位（对应 GitHub 贡献图的几档活跃度） */
export const GREEN_OPACITIES = [0.35, 0.5, 0.65, 0.8];
export const GREEN_COLOR = '#39d353';

/*
 * 横向周期：列号先对周期取模再哈希，于是图案每 128 列重复一次 ——
 * 滚动正好走一个周期，衔接处看不出来；周期比卡片宽，也不会看出重复。
 */
export const GREEN_PERIOD_COLS = 128;

/** 坐标哈希 → [0,1)，固定算法保证每次结果一致 */
const hash2d = (x: number, y: number): number => {
  let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** 该格子点亮的透明度；返回 0 表示不点亮 */
export const greenCellOpacity = (col: number, row: number): number => {
  const c = ((col % GREEN_PERIOD_COLS) + GREEN_PERIOD_COLS) % GREEN_PERIOD_COLS;
  const hit = hash2d(c, row);
  if (hit >= GREEN_DENSITY) return 0;
  const step = Math.floor(hash2d(c + 8191, row + 131071) * GREEN_OPACITIES.length);
  return GREEN_OPACITIES[Math.min(step, GREEN_OPACITIES.length - 1)];
};
