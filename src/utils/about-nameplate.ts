/**
 * 关于页「名牌」图片生成。
 *
 * 后台实时预览旁边有个「生成图片」按钮，把当前表单内容画成一张可以直接分享的 PNG。
 *
 * 为什么是手绘 Canvas 而不是 html2canvas / dom-to-image：
 *   项目里没有这类依赖，为了导出一张卡片去装一个几百 KB 的库不划算；
 *   卡片本身结构很简单（圆角底 + 渐变 + 贡献图纹理 + logo + 两行文字 + 几个胶囊），
 *   用 Canvas 2D 直接画反而更可控、也不会把页面的样式依赖带进来。
 *
 * 纹理复刻的是 Hero 卡的实现：底纹和绿格都按格子坐标画，再用 destination-in
 * 叠一道横向渐变，做出「只在右侧、向左淡出」的效果；绿格用的是 utils/hero-grid 里
 * 同一份哈希规则，页面和导出图片观感一致。
 */

import { GREEN_COLOR, greenCellOpacity } from './hero-grid';

export interface NameplateData {
  siteName?: string;
  tagline?: string;
  version?: string;
  authorName?: string;
  repoName?: string;
}

export type NameplateTheme = 'light' | 'dark';

/** 卡片逻辑尺寸，与 AboutHero 的实际排版对齐 */
const W = 880;
const H = 196;
const RADIUS = 18;
const LOGO = 91;
const LOGO_X = 30;
const LOGO_Y = 49;
const TEXT_X = 140;
/** 导出按 2 倍分辨率，贴到聊天窗口/视网膜屏上不糊 */
const SCALE = 2;

const THEMES: Record<NameplateTheme, {
  bgTop: string; bgBottom: string; fg: string; sub: string;
  ink: string; chipBorder: string; logo: HTMLImageElement | null;
}> = {
  light: {
    bgTop: '#ffffff',
    bgBottom: '#f8fafc',
    fg: '#0f172a',
    sub: '#64748b',
    ink: '#0f172a',
    chipBorder: 'rgba(100, 116, 139, 0.35)',
    logo: null,
  },
  dark: {
    bgTop: '#1b1e24',
    bgBottom: '#1a1d23',
    fg: '#e2e8f0',
    sub: '#94a3b8',
    ink: '#f1f5f9',
    chipBorder: 'rgba(148, 163, 184, 0.35)',
    logo: null,
  },
};

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/* ------------------------------------------------------------------ 工具 */

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败：${src}`));
    img.src = src;
  });

/** 自己画圆角矩形路径，不依赖 ctx.roundRect（老 Safari 没有） */
const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

/** 纹理参数，与 public/hero-grid*.svg 保持一致 */
const PITCH = 14;
const CELL = 9;
const CELL_RADIUS = 2;
const GRID_ALPHA = 0.06;
const ACCENT_ALPHA = 0.28;

/** 把底纹与绿色贡献格合成一层带渐隐的纹理 */
const buildTexture = async (s: number, ink: string) => {
  const tex = document.createElement('canvas');
  tex.width = W * s;
  tex.height = H * s;
  const t = tex.getContext('2d');
  if (!t) return tex;
  // 之后一律用逻辑坐标（0..W / 0..H）作画，缩放交给 transform
  t.scale(s, s);

  /*
   * 底纹直接按网格画，而不是拿 hero-grid.svg 当 pattern：
   * 那张 SVG 的 fill 是白色（它只作 CSS mask 用，颜色由 background-color 给），
   * 当 canvas pattern 用会把白格子画到白底上，什么也看不见。
   * 这里格子形状极简，自己画反而更直接、也少一次图片请求。
   */
  /*
   * 与页面 .hero-grid 同一套规则：按卡片尺寸取整数行列，格子尺寸随卡片算，
   * 纹理整列整行铺满，不会在边缘切出半格。
   */
  const cols = Math.max(1, Math.round(W / PITCH));
  const rows = Math.max(1, Math.round(H / PITCH));
  const stepX = W / cols;
  const stepY = H / rows;
  const cell = Math.min(stepX, stepY) * (CELL / PITCH);
  const cellRadius = CELL_RADIUS * (cell / CELL);

  t.globalAlpha = GRID_ALPHA;
  t.fillStyle = ink;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = c * stepX + (stepX - cell) / 2;
      const y = r * stepY + (stepY - cell) / 2;
      roundRectPath(t, x, y, cell, cell, cellRadius);
      t.fill();
    }
  }

  /*
   * 绿格用 SVG 图案：它本身就是绿色、且每格 fill-opacity 不同，
   * 作为 pattern 铺出来天然带上深浅分布，不用另外造数据。
   * 单元比卡片宽，铺一次即可覆盖。
   */
  // 绿色格：与页面同一份哈希规则（见 utils/hero-grid），两处观感一致
  t.fillStyle = GREEN_COLOR;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const opacity = greenCellOpacity(c, r);
      if (!opacity) continue;
      const x = c * stepX + (stepX - cell) / 2;
      const y = r * stepY + (stepY - cell) / 2;
      t.globalAlpha = ACCENT_ALPHA * opacity;
      roundRectPath(t, x, y, cell, cell, cellRadius);
      t.fill();
    }
  }

  /*
   * 横向渐隐：和 CSS 里的 --hero-grid-fade 保持同一组位置（40% 起、78% 成型）。
   * destination-in 会把纹理按渐变的 alpha 裁掉左边，只留右侧。
   */
  t.globalAlpha = 1;
  t.globalCompositeOperation = 'destination-in';
  const fade = t.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.4, 'rgba(0,0,0,0)');
  fade.addColorStop(0.78, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  t.fillStyle = fade;
  t.fillRect(0, 0, W, H);

  return tex;
};

/** 画一个胶囊，返回它的宽度 */
const drawChip = (
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  h: number,
  border: string,
  color: string
) => {
  ctx.font = `500 12px ${FONT_STACK}`;
  const padding = 10;
  const w = ctx.measureText(label).width + padding * 2;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padding, y + h / 2 + 0.5);
  return w;
};

/* ------------------------------------------------------------------ 主流程 */

/** 把当前表单数据画成一张名牌卡片，返回 canvas */
export const renderNameplate = async (
  data: NameplateData,
  theme: NameplateTheme,
  scale = SCALE
): Promise<HTMLCanvasElement> => {
  const tone = THEMES[theme];
  const [logo, texture] = await Promise.all([
    loadImage('/favicon.svg'),
    buildTexture(scale, tone.ink),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);

  // 圆角底 + 上浅下深的渐变
  ctx.save();
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, tone.bgTop);
  bg.addColorStop(1, tone.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /*
   * 右上角的淡主色洗色，与 CSS 里 .about-hero 的 radial-gradient 同一组参数
   *（横向 65%、纵向 330%，到卡片底部仍保留约一半）。
   * canvas 的径向渐变是正圆，这里先把坐标系拉成椭圆再画。
   */
  ctx.save();
  ctx.translate(W, 0);
  ctx.scale(W * 0.65, H * 3.3);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  glow.addColorStop(0, 'rgba(37, 99, 235, 0.08)');
  glow.addColorStop(0.6, 'rgba(37, 99, 235, 0)');
  glow.addColorStop(1, 'rgba(37, 99, 235, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  ctx.drawImage(texture, 0, 0, W, H);

  // 产品 logo
  ctx.drawImage(logo, LOGO_X, LOGO_Y, LOGO, LOGO);

  const displayName = (data.siteName || '').trim() || 'OpenStore';
  const accent = theme === 'dark' ? '#60a5fa' : '#2563eb';

  // 站名 + 版本胶囊
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tone.fg;
  ctx.font = `700 26px ${FONT_STACK}`;
  ctx.fillText(displayName, TEXT_X, 72);
  let cursor = TEXT_X + ctx.measureText(displayName).width;

  const version = (data.version || '').trim().replace(/^v/i, '');
  if (version) {
    cursor += 12;
    const label = `v${version}`;
    ctx.font = `600 12px ${FONT_STACK}`;
    const w = ctx.measureText(label).width + 20;
    roundRectPath(ctx, cursor, 60, w, 24, 12);
    ctx.fillStyle = theme === 'dark' ? 'rgba(96,165,250,0.14)' : 'rgba(37,99,235,0.10)';
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.fillText(label, cursor + w / 2, 72.5);
    ctx.textAlign = 'left';
    cursor += w;
  }

  // 一句话简介
  const tagline = (data.tagline || '').trim();
  if (tagline) {
    ctx.fillStyle = tone.sub;
    ctx.font = `400 14px ${FONT_STACK}`;
    ctx.fillText(tagline, TEXT_X, 106);
  }

  // 胶囊行：仓库 / 作者
  let chipX = TEXT_X;
  const chips: string[] = [];
  if ((data.repoName || '').trim()) chips.push(data.repoName!.trim());
  if ((data.authorName || '').trim()) chips.push(data.authorName!.trim());
  chips.forEach((label) => {
    chipX += drawChip(ctx, label, chipX, 126, 26, tone.chipBorder, tone.sub) + 10;
  });

  ctx.restore();

  return canvas;
};

/** 浅色 + 深色拼成一张（两张卡片留 24px 间距），便于一次对比或分享 */
export const renderNameplateSheet = async (
  data: NameplateData,
  scale = SCALE
): Promise<HTMLCanvasElement> => {
  const gap = 24;
  const [light, dark] = await Promise.all([
    renderNameplate(data, 'light', scale),
    renderNameplate(data, 'dark', scale),
  ]);
  const sheet = document.createElement('canvas');
  sheet.width = light.width;
  sheet.height = light.height * 2 + gap * scale;
  const ctx = sheet.getContext('2d');
  if (!ctx) return sheet;
  ctx.drawImage(light, 0, 0);
  ctx.drawImage(dark, 0, light.height + gap * scale);
  return sheet;
};

/** 触发浏览器下载 */
/** iOS / iPadOS（含桌面 UA 的 iPad） */
const isIosSafari = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * 导出画布为 PNG。
 * 返回 'download' 表示浏览器直接下载了文件，'open' 表示在 iOS 上改成了新标签打开图片
 *（苹果对 blob: 链接的 download 支持不好，只能让用户长按保存）。
 */
export const downloadCanvas = async (
  canvas: HTMLCanvasElement,
  filename: string
): Promise<'download' | 'open'> => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('画布导出为空');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  const ios = isIosSafari();
  if (ios) link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
  /*
   * 不能立刻 revoke：iOS 会走「打开图片」而不是直接下载，
   * 地址一旦失效图片就打不开了（表现为「生成失败」）。
   */
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  return ios ? 'open' : 'download';
};
