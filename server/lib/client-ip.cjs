/*
 * 访客真实 IP 解析。
 *
 * 线上链路：用户 → EdgeOne(CDN) → nginx → Node（前面两层代理）。
 *   1) 优先用 CDN 给的客户端 IP 头 —— 最准，且客户端改不了；
 *   2) 没有就取 X-Forwarded-For 的**最左**一段：CDN 会把客户端 IP 放在最左边，
 *      nginx 再把 EdgeOne 的边缘 IP 追加到最右边，所以最左才是真实用户；
 *   3) 都没有才退回 socket 地址；
 *   4) 例外：CDN 给出的连接方是「已知前置反代」（TRUSTED_FRONT_PROXY_IPS）时，
 *      这次请求是经那台代理机进来的，真实访客要去转发头 / XFF 最左段找。
 *
 * 别再改成"取 XFF 最后一段"或"只信任一跳"：那取到的是 EdgeOne 边缘节点的 IP，
 * 会让访客日志里的 IP 全错（2026-09-30 那批 222.79.x.x 就是这么来的）。
 */
const net = require('net');

/** 统一把 IPv4 映射地址 / ::1 归一化，便于入库和比对 */
const normalizeIp = (raw) => {
  let ip = String(raw || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);
  else if (ip === '::1') ip = '127.0.0.1';
  return ip;
};

/**
 * CDN 明确给出的客户端 IP 头（由 CDN 覆写，客户端伪造不了）。
 * 线上用腾讯 EdgeOne；这里同时兼容 Cloudflare 等的等价头。
 */
const CDN_CLIENT_IP_HEADERS = ['eo-connecting-ip', 'cf-connecting-ip', 'true-client-ip', 'x-client-ip'];

/**
 * 已知的「前置反代」IP —— 也就是自己另外一台服务器把本站整个代理出去的情况
 * （例如 beta-next.icu 的 139.9.223.233 代理 next.betahub.tech）。
 *
 * 这种链路是「访客 → 前置反代 → EdgeOne → nginx → Node」：EdgeOne 看到的连接方
 * 是那台代理机，所以 eo-connecting-ip 只会是代理机自己的 IP，真实访客 IP 只可能
 * 藏在代理转发过来的 X-Forwarded-For 最左一段里。
 *
 * 填 .env 的 TRUSTED_FRONT_PROXY_IPS（逗号分隔）。只有当 CDN 给出的连接方 IP
 * 命中这个名单时，才会改读 XFF 最左段 —— 否则直接访问本站的人 IP 不会被伪造的
 * XFF 头带偏。
 */
const TRUSTED_FRONT_PROXY_IPS = new Set(
  String(process.env.TRUSTED_FRONT_PROXY_IPS || '')
    .split(',')
    .map((item) => normalizeIp(item))
    .filter(Boolean)
);

/**
 * 前置反代把访客 IP 带过来时可用的头，按可信度排序。
 *
 * 故意不包含 x-real-ip：本站自己的 nginx 会用 $remote_addr 重写它，
 * 到 Node 时只剩 EdgeOne 边缘节点的 IP，没有参考价值。
 */
const FORWARDED_CLIENT_IP_HEADERS = ['x-client-real-ip', 'x-original-forwarded-for'];

/** CDN 明确给出的「连接方」IP（EdgeOne 会覆写，客户端伪造不了）；没有则返回空串 */
const readCdnConnectingIp = (req) => {
  for (const name of CDN_CLIENT_IP_HEADERS) {
    const value = req.headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    const candidate = normalizeIp(first);
    if (candidate && net.isIP(candidate)) return candidate;
  }
  return '';
};

/** X-Forwarded-For 里第一个合法 IP；没有则返回空串 */
const readForwardedLeftmostIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (!xff) return '';
  for (const segment of String(xff).split(',')) {
    const candidate = normalizeIp(segment);
    if (candidate && net.isIP(candidate)) return candidate;
  }
  return '';
};

/**
 * 这次请求是不是经「已知前置反代」进来的。
 * 判断依据只看 CDN 给出的连接方 IP —— 它由 EdgeOne 覆写，访客伪造不了，
 * 所以这个标记不会因为有人自带 X-Forwarded-For 头就被打成"代理来源"。
 */
const isViaTrustedFrontProxy = (req) => {
  const cdnIp = readCdnConnectingIp(req);
  return Boolean(cdnIp) && TRUSTED_FRONT_PROXY_IPS.has(cdnIp);
};

/** 取访客真实 IP（详细链路说明见文件头注释） */
const getClientIp = (req) => {
  const cdnIp = readCdnConnectingIp(req);
  const leftmost = readForwardedLeftmostIp(req);

  if (cdnIp) {
    if (!TRUSTED_FRONT_PROXY_IPS.has(cdnIp)) return cdnIp;

    // CDN 给出的连接方就是已知的前置反代 -> 试着把真实访客从转发头里捞回来
    const usable = (ip) => ip && net.isIP(ip) && !TRUSTED_FRONT_PROXY_IPS.has(ip);
    for (const name of FORWARDED_CLIENT_IP_HEADERS) {
      const value = req.headers[name];
      const candidate = normalizeIp(Array.isArray(value) ? value[0] : value);
      if (usable(candidate)) return candidate;
    }
    if (usable(leftmost)) return leftmost;
    return cdnIp;
  }
  if (leftmost) return leftmost;

  return normalizeIp(req.socket?.remoteAddress || req.ip || '127.0.0.1');
};

module.exports = {
  normalizeIp,
  CDN_CLIENT_IP_HEADERS,
  TRUSTED_FRONT_PROXY_IPS,
  FORWARDED_CLIENT_IP_HEADERS,
  readCdnConnectingIp,
  readForwardedLeftmostIp,
  isViaTrustedFrontProxy,
  getClientIp
};
