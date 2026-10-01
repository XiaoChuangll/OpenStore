/*
 * 诊断接口：回显客户端 IP 相关请求头
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth.cjs');
const { TRUSTED_FRONT_PROXY_IPS, readCdnConnectingIp, isViaTrustedFrontProxy, getClientIp } = require('../lib/client-ip.cjs');
const { TRUST_PROXY_HOPS } = require('../lib/config.cjs');

const router = express.Router();

/**
 * 诊断用：看这台机器**实际**收到了哪些 IP 相关头。
 * 需要管理员登录，且只回显 IP 类头（不回显 cookie / authorization）。
 * 用法：直接访问一次，再经前置代理访问一次，两边对比就知道链路长什么样。
 */
router.get('/api/diagnostics/client-ip', requireAuth, (req, res) => {
  const pick = (name) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value.join(', ') : value ?? null;
  };
  res.json({
    resolved: getClientIp(req),
    viaProxy: isViaTrustedFrontProxy(req),
    cdnConnectingIp: readCdnConnectingIp(req) || null,
    reqIp: req.ip ?? null,
    socket: req.socket?.remoteAddress ?? null,
    trustedFrontProxies: [...TRUSTED_FRONT_PROXY_IPS],
    trustProxy: TRUST_PROXY_HOPS,
    headers: {
      'x-forwarded-for': pick('x-forwarded-for'),
      'x-real-ip': pick('x-real-ip'),
      'eo-connecting-ip': pick('eo-connecting-ip'),
      'cf-connecting-ip': pick('cf-connecting-ip'),
      'true-client-ip': pick('true-client-ip'),
      'x-client-ip': pick('x-client-ip'),
      'x-client-real-ip': pick('x-client-real-ip'),
      'x-original-forwarded-for': pick('x-original-forwarded-for'),
      forwarded: pick('forwarded')
    }
  });
});

module.exports = router;
