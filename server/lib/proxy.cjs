/*
 * 通用反向代理。
 *
 * /api/v0 与 /api/proxy-request 都走这里：把请求原样透传给上游、把响应流式回吐，
 * 同时往实时日志里记一条 kind=upstream 的记录（拓扑图据此画「上游 API」节点）。
 */
const axios = require('axios');
const { pushLiveLog } = require('./live-log.cjs');
const { UPSTREAM_USER_AGENT } = require('./config.cjs');

// 这些头由 axios / Node 自己管理，不能原样转发给上游
const PROXY_HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'content-length', // Let axios handle it
  'content-type',   // Let axios set it based on data
]);

const createProxy = (target, pathRewrite) => async (req, res) => {
  let url = req.originalUrl;
  if (pathRewrite) {
    url = pathRewrite(url);
  }
  const fullUrl = `${target}${url}`;
  const startedAt = Date.now();

  try {
    // 透传客户端请求头，但 UA 除外 —— 见下面
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (PROXY_HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      headers[key] = value;
    }
    /*
     * UA 一律换成我们自己的标识，不透传访客的浏览器 UA。
     * 上游规定调用 API 必须带 user_agent 且格式为「应用包名/版本号」，
     * 用访客的浏览器 UA 既不符合格式，也让上游分不清到底是哪个应用在调接口。
     */
    headers['user-agent'] = UPSTREAM_USER_AGENT;
    
    const config = {
      method: req.method,
      url: fullUrl,
      headers,
      data: (req.method === 'GET' || req.method === 'HEAD') ? undefined : req.body,
      responseType: 'stream',
      validateStatus: () => true // Handle all status codes manually
    };
    
    const response = await axios(config);
    
    res.status(response.status);
    Object.keys(response.headers).forEach(key => {
      res.setHeader(key, response.headers[key]);
    });

    // 记录一次真实的上游调用（开发/生产都走 Node 代理时才可见）
    const upstreamMs = Date.now() - startedAt;
    pushLiveLog(response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
      // 「上游」不再写进文本里，前端按 kind === 'upstream' 渲染成同款小标签，和「慢」保持一致
      `${req.method} ${url} → ${response.status} · ${upstreamMs}ms`,
      { kind: 'upstream', method: req.method, path: url, status: response.status, ms: upstreamMs }
    );

    response.data.pipe(res);
  } catch (error) {
    // 只走 pushLiveLog：它会把「上游代理失败 …」同时送到后台面板和终端，
    // 不再单独 console.error，否则同一件事会打印两遍
    pushLiveLog('error', `上游代理失败 ${req.method} ${url}：${error.message}`, { kind: 'upstream' });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy Error: ' + error.message });
    }
  }
};

module.exports = { PROXY_HOP_BY_HOP_HEADERS, createProxy };
