/*
 * 出站 HTTP(S) 请求的统一配置：连接池 / 超时 / 并发闸门 / 流式传输护栏。
 *
 * 主要堵一类漏洞：客户端断开或读得太慢时，pipe 只解绑、不销毁上游流，
 * 那条连接再没人读，缓冲一路堆到内核 TCP 内存上限。
 */
const http = require('http');
const https = require('https');

/** 只接受正数，其它（空值 / 0 / NaN / 负数）一律退回默认值 */
const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const positiveInt = (value, fallback) => Math.floor(positive(value, fallback));

// —— 连接池 ——
const UPSTREAM_MAX_SOCKETS = positiveInt(process.env.UPSTREAM_MAX_SOCKETS, 32);
const UPSTREAM_MAX_FREE_SOCKETS = positiveInt(process.env.UPSTREAM_MAX_FREE_SOCKETS, 8);
const UPSTREAM_KEEPALIVE_MS = positive(process.env.UPSTREAM_KEEPALIVE_MS, 15000);

/*
 * 【临时应急】上游 HTTPS 证书过期 / 不受信时的开关：设为 1 则出站不再校验证书有效性。
 * 正常务必保持关闭 —— 关掉校验等于给所有上游请求开了中间人后门，只能等上游修复期间顶一阵，
 * 上游续签证书后把 .env 里的 UPSTREAM_TLS_INSECURE 删掉（或设 0）即可恢复。
 */
const UPSTREAM_TLS_INSECURE = /^(1|true|yes)$/i.test(String(process.env.UPSTREAM_TLS_INSECURE || '').trim());

// —— 超时 ——
/** 建连 + 等响应头（axios 的 timeout 只管到这里） */
const UPSTREAM_TIMEOUT_MS = positive(process.env.UPSTREAM_TIMEOUT_MS, 15000);
/** 兜底超时：只对没写 timeout 的 axios 请求生效 */
const AXIOS_DEFAULT_TIMEOUT_MS = positive(process.env.AXIOS_DEFAULT_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS);
/** 非流式响应体积上限 */
const AXIOS_DEFAULT_MAX_CONTENT_LENGTH = positive(
  process.env.AXIOS_DEFAULT_MAX_CONTENT_LENGTH,
  32 * 1024 * 1024
);

// —— 流式传输 ——
/** 接口类转发：多久没有数据算卡死 */
const API_STREAM_IDLE_MS = positive(process.env.API_STREAM_IDLE_MS, 30000);
/** 接口类转发：单次传输总时长上限 */
const API_STREAM_MAX_MS = positive(process.env.API_STREAM_MAX_MS, 120000);
/** 媒体类转发（可达数百 MB，慢速客户端是常态）：余量放宽 */
const MEDIA_STREAM_IDLE_MS = positive(process.env.MEDIA_STREAM_IDLE_MS, 120000);
const MEDIA_STREAM_MAX_MS = positive(process.env.MEDIA_STREAM_MAX_MS, 900000);
/** SSE 长流的空闲超时：SSE 没数据不代表出问题，给宽；主要靠「客户端断开即掐断」兜底 */
const SSE_IDLE_MS = positive(process.env.SSE_IDLE_MS, 900000);

// —— 并发闸门 ——
const PROXY_MAX_CONCURRENCY = positiveInt(process.env.PROXY_MAX_CONCURRENCY, 24);
const PROXY_QUEUE_WAIT_MS = positive(process.env.PROXY_QUEUE_WAIT_MS, 10000);

const createAgent = (Agent) =>
  new Agent({
    keepAlive: true,
    keepAliveMsecs: UPSTREAM_KEEPALIVE_MS,
    maxSockets: UPSTREAM_MAX_SOCKETS,
    maxFreeSockets: UPSTREAM_MAX_FREE_SOCKETS,
    // 空闲的复用连接超过这个时间就关掉，别让对端和本地一直占着 socket
    timeout: UPSTREAM_KEEPALIVE_MS,
    // 仅在应急开关打开时关闭证书校验（见 UPSTREAM_TLS_INSECURE 注释）
    ...(UPSTREAM_TLS_INSECURE ? { rejectUnauthorized: false } : {})
  });

const httpAgent = createAgent(http.Agent);
const httpsAgent = createAgent(https.Agent);

if (UPSTREAM_TLS_INSECURE) {
  console.warn('[security] UPSTREAM_TLS_INSECURE=1：已关闭上游 HTTPS 证书校验');
}

/** 给 axios 补默认值；调用点显式传的 timeout / agent 优先级更高 */
const applyAxiosDefaults = (axios) => {
  const instance = axios || require('axios');
  instance.defaults.timeout = AXIOS_DEFAULT_TIMEOUT_MS;
  instance.defaults.maxContentLength = AXIOS_DEFAULT_MAX_CONTENT_LENGTH;
  instance.defaults.httpAgent = httpAgent;
  instance.defaults.httpsAgent = httpsAgent;
  return instance;
};

/** 并发闸门：等 waitMs 还没轮到就返回 null，由调用方直接回 503 */
const createGate = (max) => {
  const limit = Math.max(1, positiveInt(max, 1));
  let active = 0;
  const waiting = [];

  /** 每个名额只认一次释放，重复调用直接忽略（调用方在多个分支里都可能释放） */
  const makeRelease = () => {
    let used = false;
    return () => {
      if (used) return;
      used = true;
      active = Math.max(0, active - 1);
      const next = waiting.shift();
      if (next) {
        clearTimeout(next.timer);
        active += 1; // 名额直接转交，不经过「减少再增加」
        next.resolve(makeRelease());
      }
    };
  };

  const acquire = (waitMs = 0) =>
    new Promise((resolve) => {
      if (active < limit) {
        active += 1;
        resolve(makeRelease());
        return;
      }
      if (!(waitMs > 0)) {
        resolve(null);
        return;
      }
      const entry = { timer: null, resolve };
      entry.timer = setTimeout(() => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        resolve(null);
      }, waitMs);
      if (entry.timer.unref) entry.timer.unref();
      waiting.push(entry);
    });

  return {
    acquire,
    stats: () => ({ limit, active, waiting: waiting.length })
  };
};

/** /api/v0 等所有反向代理共享的闸门 */
const proxyGate = createGate(PROXY_MAX_CONCURRENCY);

let activeStreams = 0;
const streamGuardStats = () => ({ active: activeStreams });

/** 时长文案：不足 1 秒显示毫秒，否则显示秒 */
const durationText = (ms) => (ms >= 1000 ? `${Math.round(ms / 1000)} 秒` : `${Math.round(ms)} 毫秒`);

/**
 * 给正在回吐的流式响应装三道闸：
 * 客户端断开即掐断上游、上游 socket 空闲超时、单次传输总时长上限（SSE 除外）。
 * 不监听 'data'，避免把流切到 flowing 模式破坏 pipe 的背压。
 */
const attachStreamGuards = (response, res, options = {}) => {
  const {
    idleMs = API_STREAM_IDLE_MS,
    maxMs = API_STREAM_MAX_MS,
    label = '上游传输',
    onAbort = null
  } = options;

  const stream = response && response.data;
  const socket = (response && response.request && response.request.socket) || null;
  /* SSE 长流不套总时长上限（同步进度可以跑很久），靠空闲超时兜底 */
  const headers = (response && response.headers) || {};
  // axios 的 headers 是 AxiosHeaders（有 get()），测试里是普通对象
  const contentType = String(
    (typeof headers.get === 'function' ? headers.get('content-type') : null) ||
      headers['content-type'] ||
      headers['Content-Type'] ||
      ''
  );
  const isEventStream = /text\/event-stream/i.test(contentType);
  const effectiveIdleMs = isEventStream ? Math.max(idleMs, SSE_IDLE_MS) : idleMs;
  let maxTimer = null;
  let finished = false; // 已经收尾（正常结束或被掐断），收尾只会做一次
  let aborted = false;  // 收尾的原因是「护栏掐断」
  activeStreams += 1;

  const clearMaxTimer = () => {
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  };

  const detachSocketTimer = () => {
    if (!socket) return;
    try {
      socket.setTimeout(0);
    } catch {
      /* socket 已经销毁时忽略 */
    }
    socket.removeListener('timeout', handleSocketIdle);
  };

  const dispose = () => {
    clearMaxTimer();
    detachSocketTimer();
    if (!finished) {
      finished = true;
      activeStreams = Math.max(0, activeStreams - 1);
    }
  };

  const abort = (reason) => {
    if (finished) return;
    aborted = true;
    dispose();
    try {
      if (stream && !stream.destroyed) stream.destroy(new Error(reason));
    } catch {
      /* 销毁失败不影响后面的收尾 */
    }
    try {
      if (res && !res.writableEnded) res.destroy();
    } catch {
      /* 客户端已经没了 */
    }
    if (typeof onAbort === 'function') {
      try {
        onAbort(reason);
      } catch {
        /* 回调里的异常不能反过来打断上游清理 */
      }
    }
  };

  function handleSocketIdle() {
    abort(`${label}：上游连续 ${durationText(effectiveIdleMs)}没有数据`);
  }

  if (maxMs > 0 && !isEventStream) {
    maxTimer = setTimeout(
      () => abort(`${label}：单次传输超过 ${durationText(maxMs)}上限`),
      maxMs
    );
    if (maxTimer.unref) maxTimer.unref();
  }

  if (socket && effectiveIdleMs > 0) {
    try {
      socket.setTimeout(effectiveIdleMs, handleSocketIdle);
    } catch {
      /* 拿不到 socket（已被复用/销毁）就只靠总时长兜底 */
    }
  }

  let clientAlreadyGone = false;
  if (res) {
    // 'close' 只触发一次：客户端可能在我们挂监听之前就断开，那时再等就永远等不到
    if (res.writableEnded || res.destroyed) {
      clientAlreadyGone = true;
    } else {
      res.on('close', () => {
        // writableEnded 为真 = 正常发完的收尾，不是客户端跑路
        if (!finished && !res.writableEnded) abort('客户端提前断开，已掐断上游连接');
        dispose();
      });
    }
  }

  if (stream) {
    stream.on('end', dispose);
    stream.on('close', dispose);
  }

  if (clientAlreadyGone) abort('客户端已断开（连接在挂监听前就结束了）');

  return {
    dispose,
    abort,
    /** 是不是被护栏掐断的（掉线 / 空闲超时 / 超时） */
    get aborted() {
      return aborted;
    },
    /** 是否已收尾（正常发完也算） */
    get settled() {
      return finished;
    }
  };
};

module.exports = {
  UPSTREAM_MAX_SOCKETS,
  UPSTREAM_MAX_FREE_SOCKETS,
  UPSTREAM_KEEPALIVE_MS,
  UPSTREAM_TIMEOUT_MS,
  AXIOS_DEFAULT_TIMEOUT_MS,
  AXIOS_DEFAULT_MAX_CONTENT_LENGTH,
  API_STREAM_IDLE_MS,
  API_STREAM_MAX_MS,
  MEDIA_STREAM_IDLE_MS,
  MEDIA_STREAM_MAX_MS,
  SSE_IDLE_MS,
  PROXY_MAX_CONCURRENCY,
  PROXY_QUEUE_WAIT_MS,
  httpAgent,
  httpsAgent,
  applyAxiosDefaults,
  createGate,
  proxyGate,
  streamGuardStats,
  attachStreamGuards
};
