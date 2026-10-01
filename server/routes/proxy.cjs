/*
 * 上游代理：/api/v0 透传（含屏蔽应用重写）、/api/proxy-request、/api/music-proxy
 */
const express = require('express');
const axios = require('axios');
const path = require('path');
const { pushLiveLog } = require('../lib/live-log.cjs');
const { getClientIp } = require('../lib/client-ip.cjs');
const { createProxy } = require('../lib/proxy.cjs');
const { UPSTREAM_USER_AGENT } = require('../lib/config.cjs');
const { loadBlockedAppPackages } = require('../lib/blocked-apps.cjs');
const { isBrowseAppQuery } = require('../lib/browse-query.cjs');
const { assertPublicOutboundUrl, requestWithSafeRedirects, assertAllowedProxyTarget } = require('../lib/outbound-guard.cjs');
const { MUSIC_PROXY_MAX_BYTES, acquireMusicProxySlot } = require('../lib/music-proxy.cjs');

const router = express.Router();

router.use('/api/v0', (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/apps/query' || !isBrowseAppQuery(req.body)) {
    return next();
  }

  loadBlockedAppPackages(async (blocked) => {
    if (!blocked.size) return next();

    const target = process.env.VITE_API_TARGET || 'https://shenjack.top:10003';
    const headers = {
      'Content-Type': 'application/json',
      // 与所有上游调用保持一致：用我们自己的标识，不透传访客 UA
      'User-Agent': UPSTREAM_USER_AGENT
    };
    const startedAt = Date.now();

    try {
      const response = await axios.post(`${target}${req.originalUrl}`, req.body ?? {}, {
        headers,
        timeout: 20000,
        validateStatus: () => true
      });
      const payload = response.data;
      const list = payload?.data?.data;

      if (Array.isArray(list)) {
        payload.data.data = list.filter(
          (app) => !blocked.has(String(app?.pkg_name || '').toLowerCase())
        );
      }

      const ms = Date.now() - startedAt;
      pushLiveLog(response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
        `POST ${req.originalUrl} → ${response.status} · ${ms}ms`,
        { kind: 'upstream', method: 'POST', path: req.originalUrl, status: response.status, ms }
      );
      res.status(response.status).json(payload);
    } catch (error) {
      console.error('屏蔽列表过滤失败，回退到普通代理：', error.message);
      next();
    }
  });
});

// /api/v0 -> https://shenjack.top:10003/api/v0
router.use('/api/v0', createProxy(process.env.VITE_API_TARGET || 'https://shenjack.top:10003'));


router.post('/api/proxy-request', async (req, res) => {
  const { url, method = 'GET', headers = {}, data = null, body = null } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const upperMethod = String(method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(upperMethod)) {
    return res.status(400).json({ error: 'Method not allowed' });
  }

  try {
    const config = {
      method: upperMethod,
      headers: {
        ...headers,
        // host 交给 axios / Node 自己管
        host: undefined
      },
      data: data || body,
      timeout: 10000, // 10s timeout
      maxContentLength: 8 * 1024 * 1024
    };

    const startTime = Date.now();
    const response = await requestWithSafeRedirects(url, config, assertAllowedProxyTarget);
    const duration = Date.now() - startTime;

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      duration
    });
  } catch (error) {
    res.status(error.message?.includes('不允许') || error.message?.includes('名单') || error.message?.includes('只允许') ? 403 : 200).json({
      status: 0,
      statusText: 'Blocked',
      error: error.message,
      duration: 0
    });
  }
});


router.get('/api/music-proxy', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) {
    return res.status(400).send('URL is required');
  }

  const clientIp = getClientIp(req);
  const releaseSlot = acquireMusicProxySlot(clientIp);
  if (!releaseSlot) {
    return res.status(429).type('text/plain').send('同时传输的音频过多，请稍后重试');
  }
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseSlot();
  };
  res.on('close', release);
  res.on('finish', release);

  try {
    // 音频地址来自上游接口，主机不固定，无法做白名单，但至少要挡住内网地址
    const response = await requestWithSafeRedirects(
      url,
      {
        method: 'get',
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://music.163.com/'
        },
        timeout: 10000
      },
      assertPublicOutboundUrl
    );

    if (response.status >= 400) {
      response.data?.destroy?.();
      return res.status(502).type('text/plain').send('upstream returned ' + response.status);
    }

    const declaredSize = Number(response.headers['content-length'] || 0);
    if (declaredSize && declaredSize > MUSIC_PROXY_MAX_BYTES) {
      response.data?.destroy?.();
      return res.status(413).type('text/plain').send('文件超过单次传输上限');
    }

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    
    if (filename) {
      // Ensure filename is properly encoded for Content-Disposition
      const encodedFilename = encodeURIComponent(filename);
      res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    }

    // 上游没报 content-length 或报的不实时，边传边数，超限就掐断
    let sent = 0;
    response.data.on('data', (chunk) => {
      sent += chunk.length;
      if (sent > MUSIC_PROXY_MAX_BYTES) {
        console.warn('[music-proxy] 超过单次传输上限，已中断:', String(url).slice(0, 100));
        response.data.destroy();
        res.destroy();
      }
    });
    response.data.on('error', () => {
      try { res.destroy(); } catch {}
    });

    response.data.pipe(res);
  } catch (error) {
    console.error('Music proxy error:', error.message);
    // 被安全校验挡下时返回 403，方便前端区分「地址不允许」和「上游真的挂了」
    const blocked = /不允许|只允许|不合法|名单/.test(error.message || '');
    res.status(blocked ? 403 : 500).type('text/plain').send(blocked ? error.message : 'Proxy error');
  }
});

module.exports = router;
