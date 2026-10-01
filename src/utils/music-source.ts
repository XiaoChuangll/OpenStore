/**
 * 音乐资源地址处理：优先让浏览器直连 CDN，避免音频流量全压在服务器上。
 *
 * 背景：网易云接口返回的播放地址常常是 http://，而线上页面是 https://，
 * 浏览器会把 http 子资源当成混合内容直接拦掉，所以以前只能一律走 /api/music-proxy 中转。
 * 实测同一个 CDN 主机支持 https（206 + Access-Control-Allow-Origin: *，且不校验 Referer），
 * 因此可以先把地址升级成 https 交给浏览器直连，只有升级后仍不可用时才回退到代理。
 */

const detectHttpsPage = () =>
  typeof location !== 'undefined' && location.protocol === 'https:';

/** 把 http 地址升级成同主机的 https 地址（非 http 地址原样返回） */
export function upgradeToHttps(raw: string): string {
  if (!raw || !raw.startsWith('http://')) return raw;
  return 'https://' + raw.slice('http://'.length);
}

/**
 * 优先直连用的地址：
 * - https 页面 + http 地址 → 升级成 https（浏览器就能直连，不再占用服务器带宽）
 * - 其它情况 → 原样返回（http 页面下 http 地址本来就能直连）
 */
export function preferHttps(raw: string, httpsPage: boolean = detectHttpsPage()): string {
  if (!raw) return raw;
  return httpsPage ? upgradeToHttps(raw) : raw;
}

/** 升级成 https 之后仍可能失败、需要回退到服务器代理的情况：https 页面上的 http 地址 */
export function mustProxy(raw: string, httpsPage: boolean = detectHttpsPage()): boolean {
  return Boolean(raw) && httpsPage && raw.startsWith('http://');
}

/** 服务器中转地址（/api/music-proxy），只在直连失败时使用 */
export function proxyUrl(raw: string, filename?: string): string {
  const query = new URLSearchParams({ url: raw });
  if (filename) query.set('filename', filename);
  return `/api/music-proxy?${query.toString()}`;
}

/** 直连下载的体积上限：超过就交给服务器流式中转，避免把浏览器内存撑爆 */
export const DIRECT_DOWNLOAD_MAX_BYTES = 200 * 1024 * 1024;

/**
 * 浏览器直连下载：fetch 成 blob 再触发保存，能带上正确文件名，且不经过服务器。
 * 失败（http-only 主机 / CORS 不允许 / 文件过大）时抛错，由调用方回退到 /api/music-proxy。
 */
export async function downloadDirect(
  raw: string,
  filename: string,
  maxBytes: number = DIRECT_DOWNLOAD_MAX_BYTES
): Promise<void> {
  const response = await fetch(preferHttps(raw), { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`直连下载失败：HTTP ${response.status}`);

  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) throw new Error('文件过大，改用服务器中转');

  const blob = await response.blob();
  if (blob.size > maxBytes) throw new Error('文件过大，改用服务器中转');
  if (!blob.size) throw new Error('直连下载拿到空内容');

  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  }
}
