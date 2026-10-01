/* ---------------------------------------------------------------------------
 * 出站代理的安全校验（防 SSRF）
 *
 * /api/proxy-request 与 /api/music-proxy 都是「服务器代请求方去访问一个 URL」。
 * 如果不校验目标，任何人都能拿它们读内网服务或云元数据（实测 http://127.0.0.1:5002 可读通）。
 * 这里统一做三件事：
 *   1. 只允许 http/https，且 URL 不能自带账号密码；
 *   2. 拒绝内网地址（字面 IP 和域名解析结果都查）；
 *   3. 重定向逐跳校验，避免用 302 绕过第 2 条。
 * ------------------------------------------------------------------------- */
const net = require('net');
const dnsPromises = require('dns').promises;
const axios = require('axios');
const db = require('../database.cjs');
/* ---------------------------------------------------------------------------
 * 出站代理的安全校验（防 SSRF）
 *
 * /api/proxy-request 与 /api/music-proxy 都是「服务器代请求方去访问一个 URL」。
 * 如果不校验目标，任何人都能拿它们读内网服务或云元数据（实测 http://127.0.0.1:5002 可读通）。
 * 这里统一做三件事：
 *   1. 只允许 http/https，且 URL 不能自带账号密码；
 *   2. 拒绝内网地址（字面 IP 和域名解析结果都查）；
 *   3. 重定向逐跳校验，避免用 302 绕过第 2 条。
 * ------------------------------------------------------------------------- */
const PRIVATE_HOSTNAME_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;

const isPrivateAddress = (raw) => {
  const ip = String(raw || '').trim().replace(/^\[|\]$/g, '');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;            // link-local，含云元数据 169.254.169.254
    if (a === 100 && b >= 64 && b <= 127) return true;   // 运营商级 NAT
    if (a >= 224) return true;                           // 组播与保留段
    return false;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    if (s.startsWith('fc') || s.startsWith('fd')) return true;    // 唯一本地地址
    if (s.startsWith('fe80')) return true;                        // link-local
    if (s.startsWith('::ffff:')) return isPrivateAddress(s.slice(7));
    return false;
  }
  return true;
};

const assertPublicOutboundUrl = async (raw) => {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error('URL 不合法');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只允许 http/https 地址');
  if (url.username || url.password) throw new Error('URL 不允许携带账号密码');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_HOSTNAME_RE.test(host)) throw new Error('不允许访问内网主机');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('不允许访问内网地址');
  } else {
    const addrs = await dnsPromises.lookup(host, { all: true }).catch(() => []);
    if (!addrs.length) throw new Error('域名解析失败');
    if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('域名解析到内网地址');
  }
  return url;
};

// 逐跳跟随重定向，每一跳都重新做上面的校验
const requestWithSafeRedirects = async (rawUrl, axiosConfig, validate, maxHops = 3) => {
  let current = rawUrl;
  for (let hop = 0; hop <= maxHops; hop += 1) {
    const url = await validate(current);
    const response = await axios({
      ...axiosConfig,
      url: url.href,
      maxRedirects: 0,
      validateStatus: () => true
    });
    const location = response.headers?.location;
    if (response.status >= 300 && response.status < 400 && location) {
      response.data?.destroy?.();
      current = new URL(location, url.href).href;
      continue;
    }
    return response;
  }
  throw new Error('重定向次数过多');
};

/* /api/proxy-request 只服务于音乐模块（前端用 music_apis 里登记的地址调网易云接口），
 * 所以白名单直接取 music_apis 表里 enabled=1 的 origin；需要额外放行时用 PROXY_ALLOWED_ORIGINS。 */
const PROXY_EXTRA_ALLOWED_ORIGINS = String(process.env.PROXY_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

let proxyAllowedOriginsCache = { at: 0, origins: [] };
const getProxyAllowedOrigins = () =>
  new Promise((resolve) => {
    if (Date.now() - proxyAllowedOriginsCache.at < 60 * 1000) return resolve(proxyAllowedOriginsCache.origins);
    db.all(`SELECT url FROM music_apis WHERE enabled = 1`, [], (err, rows) => {
      const origins = [];
      for (const row of err ? [] : rows || []) {
        try {
          origins.push(new URL(String(row.url)).origin);
        } catch {
          /* 表里配错的地址直接跳过，不影响其它条目 */
        }
      }
      proxyAllowedOriginsCache = { at: Date.now(), origins };
      resolve(origins);
    });
  });

const assertAllowedProxyTarget = async (raw) => {
  const url = await assertPublicOutboundUrl(raw);
  const allowed = new Set([...PROXY_EXTRA_ALLOWED_ORIGINS, ...(await getProxyAllowedOrigins())]);
  if (!allowed.has(url.origin)) throw new Error('该地址不在允许代理的名单内');
  return url;
};

module.exports = { assertPublicOutboundUrl, requestWithSafeRedirects, assertAllowedProxyTarget };
