/*
 * Hero 背景「绿色贡献格」的生成规则。
 * 页面（.hero-grid 里的内联 SVG）和导出的名牌图片都用这一份，保证两处一致。
 * 每个格子是否点亮、多亮，由 (列, 行) 的哈希决定：确定性、可复现，不需要资源文件。
 */

/** 点亮比例 */
export const GREEN_DENSITY = 0.46;
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

/** 点亮的一格（列、行都是整数格坐标） */
export interface GridCell {
  col: number;
  row: number;
}

/**
 * 把一段文字转成「哪些格子点亮」。
 *
 * 做法：先把文字画到一张 (cols·S) × (rows·S) 的画布上（S 是每格的采样精度），
 * 再按格子把 S×S 的覆盖率平均一下，超过阈值就算点亮。
 * 这样不用内置点阵字体，中英文、数字、符号都能用，字形也比手写的点阵好看。
 *
 * 字号先按高度定，再按宽度收 —— 太长会自动缩小，尽量都塞进去。
 */
export interface TextToCellsOptions {
  /** 每格采样精度，越大字形越准 */
  sample?: number;
  /**
   * 水平对齐：
   *   center = 整段居中（静止展示时好看）；
   *   left  = 从格子最左边起步（滚动时用，这样每次都是从文字开头滚进来）。
   */
  align?: 'center' | 'left';
  /** align='left' 时左边留空几格 */
  padCols?: number;
}

export function textToCells(text: string, cols: number, rows: number, options: TextToCellsOptions = {}): GridCell[] {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value || cols < 1 || rows < 1) return [];
  if (typeof document === 'undefined') return [];

  const sample = Math.max(2, options.sample ?? 10);
  const width = cols * sample;
  const height = rows * sample;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fontOf = (size: number) =>
    `800 ${size}px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;

  // 先按高度定字号（留一点上下边距），再按宽度收缩
  let size = height * 0.8;
  ctx.font = fontOf(size);
  const measured = ctx.measureText(value).width;
  const maxWidth = width * 0.94;
  if (measured > maxWidth) {
    size *= maxWidth / measured;
    ctx.font = fontOf(size);
  }

  // 基线微微下移一点，视觉上更居中（大写字母没有下伸部分时会偏上）
  const align = options.align ?? 'center';
  const padCols = Math.max(0, options.padCols ?? (align === 'left' ? 2 : 0));
  const textY = height / 2 + size * 0.03;
  if (align === 'left') {
    ctx.textAlign = 'left';
    ctx.fillText(value, padCols * sample, textY);
  } else {
    ctx.textAlign = 'center';
    ctx.fillText(value, width / 2, textY);
  }

  const data = ctx.getImageData(0, 0, width, height).data;
  const threshold = 0.45;
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      for (let y = 0; y < sample; y += 1) {
        for (let x = 0; x < sample; x += 1) {
          const px = col * sample + x;
          const py = row * sample + y;
          sum += data[(py * width + px) * 4 + 3]; // 只看 alpha
        }
      }
      if (sum / (sample * sample * 255) >= threshold) cells.push({ col, row });
    }
  }
  return cells;
}
