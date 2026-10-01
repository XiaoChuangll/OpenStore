/*
 * 后端实时日志：环形缓冲 + SSE 推送。
 *
 * 后台「后端实时」面板的 /api/admin/live 走这里取历史快照与新日志；
 * 记录入口是 pushLiveLog()，请求级日志由 index.cjs 里的中间件写入。
 */
const LIVE_LOG_LIMIT = 200;
const LIVE_LOG_SNAPSHOT = 60;
const liveLogBuffer = [];
const liveSseClients = new Set();

/*
 * 终端镜像。
 *
 * 后台面板里能看到的东西，跑在终端（或 pm2 / systemd 日志）时也应该看得见，
 * 否则出问题只能靠翻面板。规则：
 *   - 所有 warn / error 无条件打印（4xx、5xx、上游失败等，量小且必须看得到）；
 *   - 慢调用也打印（默认 ≥1s），最容易忽略的就是"没报错但很慢"；
 *   - 这两类高频事件不打印，因为后台「实时日志」面板里本来就有：
 *     kind=request（每个 /api 请求一行）、kind=upstream（每次上游转发一行）——
 *     前端每次请求都会走 /api/v0 代理，两者量级一样大，打出来就是刷屏。
 *   - 其余低频事件（缓存构建、请求重放、系统提示）正常打印。
 *
 * 需要完整访问日志时设 ACCESS_LOG=1（两类高频事件全打）。
 */
const ACCESS_LOG = String(process.env.ACCESS_LOG || '') === '1';
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 1000);
const hhmmss = () => new Date().toTimeString().slice(0, 8);

/** 这两类事件是「每个请求一条」，只在慢或出错时才值得打到终端 */
const HIGH_FREQUENCY_KINDS = new Set(['request', 'upstream']);

const shouldMirror = (entry) => {
  if (ACCESS_LOG) return true;
  if (entry.level === 'warn' || entry.level === 'error') return true;
  if (HIGH_FREQUENCY_KINDS.has(entry.kind)) return Number(entry.ms || 0) >= SLOW_REQUEST_MS;
  return true;
};

const mirrorToConsole = (entry) => {
  if (!shouldMirror(entry)) return;
  const line = `[${hhmmss()}] ${String(entry.level).toUpperCase().padEnd(5)} ${entry.message}`;
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);
};

const liveMetrics = () => ({
  uptime: Math.round(process.uptime()),
  rss: process.memoryUsage().rss,
  node: process.version,
  clients: liveSseClients.size,
  time: Date.now()
});

/**
 * meta 里可带结构化信息，供前端做过滤与高亮：
 * - kind: 'request' | 'cache' | 'upstream' | 'system'
 * - 请求类：method / path / status / ms
 */
const pushLiveLog = (level, message, meta) => {
  const entry = { t: Date.now(), level, message: String(message).slice(0, 400), ...(meta || {}) };
  liveLogBuffer.push(entry);
  if (liveLogBuffer.length > LIVE_LOG_LIMIT) liveLogBuffer.shift();

  mirrorToConsole(entry);

  const payload = `event: log\ndata: ${JSON.stringify(entry)}\n\n`;
  for (const client of liveSseClients) {
    try {
      client.write(payload);
    } catch {
      /* 客户端已断开，忽略 */
    }
  }
  return entry;
};

module.exports = {
  LIVE_LOG_LIMIT,
  LIVE_LOG_SNAPSHOT,
  liveLogBuffer,
  liveSseClients,
  liveMetrics,
  pushLiveLog
};
