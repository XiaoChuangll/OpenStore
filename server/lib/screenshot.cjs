/*
 * 应用截图同源代理（缓存 + LRU + 白名单）。
 *
 * 华为 CDN 的截图（appimg-*.dbankcdn.com/application/screenshutN/...）本身可以直连，
 * 但直连意味着每个访客都要自己去连华为 CDN：海外/公司网络/广告拦截插件都可能失败，
 * 而且我们完全感知不到。这里改成由服务端取图，浏览器只访问本站同源地址。
 *
 * 本文件只负责「取图 + 缓存」，HTTP 路由在 index.cjs。
 */
const axios = require('axios');
// ---------------------------------------------------------------------------
// 应用截图同源代理
//
// 华为 CDN 的截图（appimg-*.dbankcdn.com/application/screenshutN/...）本身可以直连，
// 但直连意味着每个访客都要自己去连华为 CDN：海外/公司网络/广告拦截插件都可能失败，
// 而且我们完全感知不到。这里改成由服务端取图，浏览器只访问本站同源地址。
//
// 安全边界：
//   * 只允许 https + *.dbankcdn.com + /application/screenshut... 的地址，其它一律 403
//   * 不跟随重定向，8s 超时，单张上限 6 MiB
//   * 校验图片 magic bytes，上游返回非图片时按 502 处理
// 可用 SCREENSHOT_PROXY=off 一键关闭（关闭后前端会自动隐藏截图区块）。
// ---------------------------------------------------------------------------
const SCREENSHOT_PROXY_DISABLED = () => String(process.env.SCREENSHOT_PROXY || '').toLowerCase() === 'off';
const SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024; // 单张上限
const SCREENSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 缓存 7 天
const SCREENSHOT_CACHE_MAX_ENTRIES = Number(process.env.SCREENSHOT_CACHE_ENTRIES || 128);
const SCREENSHOT_CACHE_MAX_BYTES = Number(process.env.SCREENSHOT_CACHE_BYTES || 64 * 1024 * 1024);
const SCREENSHOT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SCREENSHOT_URL_RE = /^https:\/\/([a-z0-9-]+\.)*dbankcdn\.com\/application\/screenshut[A-Za-z0-9]*\/[A-Za-z0-9._/-]*\.(jpe?g|png|webp)$/i;

const screenshotCache = new Map(); // url -> { buffer, contentType, ts }
const screenshotInFlight = new Map(); // url -> Promise<Buffer>
let screenshotCacheBytes = 0;

const isAllowedScreenshotUrl = (raw) => {
  if (!SCREENSHOT_URL_RE.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.dbankcdn.com');
  } catch {
    return false;
  }
};

const sniffImageType = (buffer) => {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length > 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
};

const fetchScreenshot = async (raw) => {
  const response = await axios({
    method: 'get',
    url: raw,
    responseType: 'stream',
    timeout: 8000,
    maxRedirects: 0,
    validateStatus: (status) => status === 200,
    headers: {
      'User-Agent': SCREENSHOT_UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });

  const chunks = [];
  let size = 0;
  for await (const chunk of response.data) {
    size += chunk.length;
    if (size > SCREENSHOT_MAX_BYTES) {
      response.data.destroy();
      throw new Error('screenshot exceeds size limit');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

// 命中后重新插入，保持 Map 的插入顺序即 LRU 顺序
const rememberScreenshot = (raw, buffer, contentType) => {
  const previous = screenshotCache.get(raw);
  if (previous) screenshotCacheBytes -= previous.buffer.length;
  screenshotCache.delete(raw);
  screenshotCache.set(raw, { buffer, contentType, ts: Date.now() });
  screenshotCacheBytes += buffer.length;

  while (
    screenshotCache.size > SCREENSHOT_CACHE_MAX_ENTRIES ||
    screenshotCacheBytes > SCREENSHOT_CACHE_MAX_BYTES
  ) {
    const oldestKey = screenshotCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = screenshotCache.get(oldestKey);
    screenshotCache.delete(oldestKey);
    screenshotCacheBytes -= oldest.buffer.length;
  }
};

/** 丢弃某个已过期条目，并回收它占的字节数（计数器是本模块私有的 let，外部不能直接改） */
const evictScreenshot = (raw) => {
  const cached = screenshotCache.get(raw);
  if (!cached) return;
  screenshotCache.delete(raw);
  screenshotCacheBytes -= cached.buffer.length;
};

module.exports = {
  SCREENSHOT_PROXY_DISABLED,
  SCREENSHOT_TTL_MS,
  screenshotCache,
  screenshotInFlight,
  screenshotCacheBytes,
  isAllowedScreenshotUrl,
  sniffImageType,
  evictScreenshot,
  fetchScreenshot,
  rememberScreenshot
};
