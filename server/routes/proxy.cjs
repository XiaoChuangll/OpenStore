/*
 * 上游代理：/api/v0 透传（浏览查询会追加屏蔽应用条件）、/api/proxy-request、/api/music-proxy
 */
const express = require('express');
const path = require('path');
const { getClientIp } = require('../lib/client-ip.cjs');
const { createProxy } = require('../lib/proxy.cjs');
const { loadBlockedAppPackages } = require('../lib/blocked-apps.cjs');
const { isBrowseAppQuery } = require('../lib/browse-query.cjs');
const { assertPublicOutboundUrl, requestWithSafeRedirects, assertAllowedProxyTarget } = require('../lib/outbound-guard.cjs');
const { MUSIC_PROXY_MAX_BYTES, acquireMusicProxySlot } = require('../lib/music-proxy.cjs');
const { scriptGuard } = require('../lib/script-guard.cjs');

const router = express.Router();

// 三个「转发到外部主机」的公开代理统一挂脚本护栏，详见 lib/script-guard.cjs
router.use('/api/v0', scriptGuard);
router.use('/api/proxy-request', scriptGuard);
router.use('/api/music-proxy', scriptGuard);

/*
 * 浏览 / 筛选类查询：把屏蔽名单作为查询条件下推给上游。
 * 分页后再过滤会导致每页少几条、total_count 也对不上；下推后每页是满的。
 * 带关键词的搜索不走这里（见 isBrowseAppQuery），被屏蔽的应用仍能搜到。
 */
router.use('/api/v0', (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/apps/query' || !isBrowseAppQuery(req.body)) {
    return next();
  }

  loadBlockedAppPackages((blocked) => {
    if (!blocked.size) return next();

    // 上游没有 not_eq，用 not_i_like 表达不等于（不带通配符即等值匹配）
    const exclusions = [...blocked].map((pkg) => ({
      key: 'pkg_name',
      value: pkg,
      op: 'not_i_like',
    }));

    const original = req.body && typeof req.body === 'object' ? req.body : {};
    // 原条件整体包一层 and，再追加排除项（上游支持嵌套 and）
    const base = Object.keys(original).length ? [original] : [];
    req.body = { and: [...base, ...exclusions] };

    next();
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
      // 不回上游状态码，避免暴露「本站背后还有另一个接口」
      return res.status(502).type('text/plain').send('音频资源暂时不可用，请稍后重试');
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
