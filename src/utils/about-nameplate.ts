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
 * 纹理复刻的是 Hero 卡的实现：底纹与绿格各是一张 SVG，经 createPattern 平铺，
 * 再用 destination-in 叠一道横向渐变，做出「只在右侧、向左淡出」的效果。
 */

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
  t.globalAlpha = GRID_ALPHA;
  t.fillStyle = ink;
  for (let y = 0; y < H; y += PITCH) {
    for (let x = 0; x < W; x += PITCH) {
      roundRectPath(t, x, y, CELL, CELL, CELL_RADIUS);
      t.fill();
    }
  }

  /*
   * 绿格用 SVG 图案：它本身就是绿色、且每格 fill-opacity 不同，
   * 作为 pattern 铺出来天然带上深浅分布，不用另外造数据。
   * 单元比卡片宽，铺一次即可覆盖。
   */
  const accentImg = await loadImage('/hero-grid-accent.svg');
  const accentPattern = t.createPattern(accentImg, 'repeat');
  if (accentPattern) {
    t.globalAlpha = ACCENT_ALPHA;
    t.fillStyle = accentPattern;
    t.fillRect(0, 0, W, H);
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

  // 右上角光斑（对应 CSS 里的 .hero-glow）
  const glow = ctx.createRadialGradient(W - 60, -40, 0, W - 60, -40, 260);
  glow.addColorStop(0, 'rgba(37, 99, 235, 0.14)');
  glow.addColorStop(1, 'rgba(37, 99, 235, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

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

  // 描边（跟着圆角走，所以要单独画一遍路径）
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS);
  ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

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
export const downloadCanvas = (canvas: HTMLCanvasElement, filename: string) => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
};
