/**
 * 从封面图里取一个「能当主题色用」的颜色。
 *
 * 做法：把封面缩到 32×32 画到 canvas 上，丢掉灰 / 黑 / 白像素，
 * 剩下的按 4bit 量化分桶，用「饱和度 × 亮度适中度」加权，取分最高的那一桶。
 * 取到的颜色再按当前明暗主题把亮度和饱和度夹到舒服的区间，
 * 免得封面是纯黑或惨白时，主色跟着一起糊掉。
 *
 * 网易云封面（p*.music.126.net）带 Access-Control-Allow-Origin: *，
 * 所以 crossOrigin="anonymous" 之后 canvas 不会被污染，可以直接读像素。
 */

export interface Hsl {
  /** 0~1 */
  h: number;
  /** 0~1 */
  s: number;
  /** 0~1 */
  l: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const rgbToHsl = (r: number, g: number, b: number): Hsl => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (!delta) return { h: 0, s: 0, l };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / delta + 2) / 6;
  else h = ((rn - gn) / delta + 4) / 6;
  return { h, s, l };
};

const hslToHex = ({ h, s, l }: Hsl) => {
  const hue = ((h % 1) + 1) % 1;
  const channel = (offset: number) => {
    const k = (offset + hue * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

/** 一坨像素里最像「主色」的那一个颜色 */
const dominantHsl = (data: Uint8ClampedArray): Hsl | null => {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number; weight: number }>();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { s, l } = rgbToHsl(r, g, b);
    // 灰、黑、白对「主题色」没意义，直接跳过
    if (s < 0.2 || l < 0.12 || l > 0.94) continue;

    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0, weight: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    // 越鲜艳、亮度越靠近中间，越像「这首歌的颜色」
    bucket.weight += s * (1 - Math.abs(l - 0.5) * 1.4);
    buckets.set(key, bucket);
  }

  let best: Hsl | null = null;
  let bestScore = 0;
  buckets.forEach((bucket) => {
    const weight = Math.max(0.05, bucket.weight / bucket.count);
    const score = bucket.count * weight;
    if (score <= bestScore) return;
    bestScore = score;
    best = rgbToHsl(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count);
  });
  return best;
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

/**
 * 取封面主色。取不到（图挂了 / 跨域被挡 / 画面全是灰白）时返回空串，
 * 调用方自己决定退回什么颜色。
 */
export const extractCoverAccent = async (url: string, isDark: boolean): Promise<string> => {
  const raw = String(url || '').trim();
  if (!raw || typeof document === 'undefined') return '';

  const img = await loadImage(raw);
  if (!img) return '';

  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const hsl = dominantHsl(data);
    if (!hsl) return '';

    // 深色界面要亮一点、浅色界面要深一点，太灰的颜色往上提一提
    const lightness = isDark ? clamp(hsl.l, 0.58, 0.72) : clamp(hsl.l, 0.42, 0.56);
    const saturation = clamp(hsl.s, 0.45, 0.88);
    return hslToHex({ h: hsl.h, s: saturation, l: lightness });
  } catch {
    return '';
  }
};
