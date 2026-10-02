/*
 * 脚本护栏：给 /api/v0 这类公开代理加一层反自动化采集。
 *
 * 判定：UA 解析不出浏览器名的一律当脚本（白名单思路，不维护爬虫名单）。
 * 处置：窗口内先给 FREE_HITS 次宽限，超限返回 429 警告页；屡犯封禁时长按 4 倍递增。
 * 另有硬封禁名单（不区分 UA，见 hardBanGuard）与可后台自定义的警告页文案。
 * 后台「接口体检」「请求重放」带专用 header，直接放行。
 */
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const db = require('../database.cjs');
const { getClientIp, normalizeIp } = require('./client-ip.cjs');
const { pushLiveLog } = require('./live-log.cjs');
const { SITE_ORIGIN, SITE_NAME } = require('./share-cards.cjs');

/* ------------------------------- 配置 ------------------------------- */

const readInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// SCRIPT_GUARD_ENABLED=0 可以整体关掉（排查误伤时用）
const GUARD_ENABLED = !/^(0|false|off)$/i.test(String(process.env.SCRIPT_GUARD_ENABLED ?? '1').trim());
// 窗口内允许多少次「非浏览器」请求；设 0 = 一发现就弹警告页
const FREE_HITS = readInt(process.env.SCRIPT_GUARD_FREE_HITS, 20);
const WINDOW_MS = readInt(process.env.SCRIPT_GUARD_WINDOW_MS, 10 * 60 * 1000);
const BASE_BLOCK_MS = readInt(process.env.SCRIPT_GUARD_BLOCK_MS, 15 * 60 * 1000);
const MAX_BLOCK_MS = 24 * 60 * 60 * 1000;
// 警告页默认的申诉/合作入口（后台改过之后以数据库里的为准）
const CONTACT_URL = String(process.env.SCRIPT_GUARD_CONTACT || '').trim() || `${SITE_ORIGIN}/about`;

// 后端自己发起的请求：重放（/api/admin/replay）与接口体检（/api/admin/perf-check）
const INTERNAL_HEADERS = ['x-openstore-replay', 'x-openstore-perfcheck'];

/* ------------------------------- 状态 ------------------------------- */

// ip -> { hits: number[], strikes: number, blockedUntil: number, ua: string }
const state = new Map();
const stats = { scriptRequests: 0, warned: 0, blocked: 0, strikes: 0 };

const isInternal = (req) => INTERNAL_HEADERS.some((h) => req.headers[h] === '1');

/** UA 解析不出浏览器名就认为是脚本 */
const looksLikeScript = (ua) => {
  const raw = String(ua || '').trim();
  if (!raw) return true;
  try {
    const browser = new UAParser(raw).getBrowser();
    return !browser || !browser.name;
  } catch {
    return true; // 解析异常就当脚本，宁可放过浏览器也别放过爬虫
  }
};

/* --------------------------- 警告页自定义 --------------------------- */

const PAGE_CONFIG_KEY = 'script_guard_page';
// 内存缓存时长：后台保存时会立刻失效，这个 TTL 只是多实例/外部改库时的兜底
const PAGE_CONFIG_TTL_MS = 5 * 60 * 1000;

/**
 * 默认文案。支持两条迷你标记（见 renderInline）：`**加粗**`、`{{site}}`。
 * 措辞别写判定依据（如「没有携带浏览器标识」），那等于告诉对方怎么绕过。
 */
const DEFAULT_PAGE_CONFIG = Object.freeze({
  badge: '429 · RATE LIMITED',
  title: '本站已限制自动化访问',
  message:
    '检测到来自该地址的**自动化访问行为**，已超出本站允许的范围。\n' +
    '为保障其他访客的正常访问，该地址已被暂时限制。',
  tips: [
    '如果你是**正常访客**：这大概率是误判，请刷新重试；仍无法访问请通过下面的入口联系我们。',
    '本站没有开放无人值守的批量采集，程序化调用请先说明用途。',
    '确有**批量获取或合作**需求：说明用途后可以单独放行。'
  ],
  contactLabel: '需要放行或想说明用途',
  contactUrl: CONTACT_URL,
  showDetails: true
});

const clampText = (value, max) =>
  String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);

/** 联系入口只允许 http(s) 或站内相对路径，避免被写成 javascript: 之类 */
const normalizeContactUrl = (value) => {
  const url = String(value ?? '').trim();
  if (!url) return DEFAULT_PAGE_CONFIG.contactUrl;
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url.slice(0, 300);
  return DEFAULT_PAGE_CONFIG.contactUrl;
};

/** 把任意输入收敛成一份合法配置：后台表单、数据库旧数据、手改 JSON 都要经过它 */
const normalizePageConfig = (raw) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const tips = Array.isArray(src.tips)
    ? src.tips.map((t) => clampText(t, 200)).filter(Boolean).slice(0, 6)
    : [];
  return {
    badge: clampText(src.badge, 40) || DEFAULT_PAGE_CONFIG.badge,
    title: clampText(src.title, 60) || DEFAULT_PAGE_CONFIG.title,
    message: clampText(src.message, 800) || DEFAULT_PAGE_CONFIG.message,
    tips: tips.length ? tips : [...DEFAULT_PAGE_CONFIG.tips],
    contactLabel: clampText(src.contactLabel, 60) || DEFAULT_PAGE_CONFIG.contactLabel,
    contactUrl: normalizeContactUrl(src.contactUrl),
    showDetails: src.showDetails === undefined ? true : !!src.showDetails
  };
};

let pageConfig = normalizePageConfig(DEFAULT_PAGE_CONFIG);
let pageConfigAt = 0;

/** 从库里读一次；读不到/坏了就用默认值，绝不因为配置问题让警告页变成 500 */
const loadPageConfig = (cb) => {
  db.get(`SELECT value FROM system_settings WHERE key = ?`, [PAGE_CONFIG_KEY], (err, row) => {
    if (!err) {
      pageConfigAt = Date.now();
      if (row && row.value) {
        try {
          pageConfig = normalizePageConfig(JSON.parse(row.value));
        } catch {
          pageConfig = normalizePageConfig(DEFAULT_PAGE_CONFIG);
        }
      } else {
        pageConfig = normalizePageConfig(DEFAULT_PAGE_CONFIG);
      }
    }
    if (cb) cb(err || null, pageConfig);
  });
};

/** 同步取当前配置（渲染警告页时调用）。过期时后台异步刷新，本次先用缓存。 */
const getPageConfig = () => {
  if (Date.now() - pageConfigAt > PAGE_CONFIG_TTL_MS) {
    pageConfigAt = Date.now(); // 先占位，避免并发请求打出一堆同样的查询
    loadPageConfig();
  }
  return pageConfig;
};

const savePageConfig = (input, cb) => {
  const config = normalizePageConfig(input);
  db.run(
    `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [PAGE_CONFIG_KEY, JSON.stringify(config)],
    (err) => {
      if (!err) {
        pageConfig = config;
        pageConfigAt = Date.now();
      }
      if (cb) cb(err || null, config);
    }
  );
};

const resetPageConfig = (cb) => {
  db.run(`DELETE FROM system_settings WHERE key = ?`, [PAGE_CONFIG_KEY], (err) => {
    if (!err) {
      pageConfig = normalizePageConfig(DEFAULT_PAGE_CONFIG);
      pageConfigAt = Date.now();
    }
    if (cb) cb(err || null, pageConfig);
  });
};

/* --------------------------- 拦截记录 --------------------------- */

// 只保留最近这么多条，避免长期运行无限增长（每次封禁才会写一条，正常攒得很慢）
const BLOCK_RECORDS_KEEP = 1000;

/** 写一条拦截记录：谁、什么 UA、哪次请求触发的、第几次违规、封了多久 */
const recordBlock = ({ ip, ua, path, hits, strikes, blockMs }) => {
  const geo = geoip.lookup(ip);
  const location = geo ? [geo.city, geo.country].filter(Boolean).join(' ') : '';

  db.run(
    `INSERT INTO script_guard_blocks (ip, location, ua, path, hits, strikes, block_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ip, location, String(ua || '').slice(0, 200), String(path || '').slice(0, 300), hits, strikes, blockMs],
    (err) => {
      if (err) console.error('[script-guard] 写拦截记录失败:', err.message);
    }
  );

  // 顺手裁掉过老的行；表空时 MAX(id) 为 NULL，条件不成立，不会误删
  db.run(`DELETE FROM script_guard_blocks WHERE id <= (SELECT MAX(id) - ? FROM script_guard_blocks)`, [
    BLOCK_RECORDS_KEEP
  ]);
};

const listBlockRecords = (limit, cb) => {
  const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
  db.all(`SELECT * FROM script_guard_blocks ORDER BY id DESC LIMIT ?`, [n], (err, rows) => {
    cb(err || null, rows || []);
  });
};

const clearBlockRecords = (cb) => {
  db.run(`DELETE FROM script_guard_blocks`, [], (err) => {
    if (cb) cb(err || null);
  });
};

/** 手动解除某个 IP 的封禁（误伤时用）。只影响内存里的封禁状态，不动已经写下的记录。 */
const unblockIp = (ip) => {
  const key = String(ip || '').trim();
  if (!key || !state.has(key)) return false;
  state.delete(key);
  return true;
};

/* ------------------------------ 渲染 ------------------------------ */

const esc = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 迷你标记渲染：先整体转义再套标记，所以填什么都注入不了 HTML */
const renderInline = (text) =>
  esc(text)
    .replace(/\{\{\s*site\s*\}\}/gi, `<a href="${esc(SITE_ORIGIN)}">${esc(SITE_ORIGIN)}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/** 多行文本：换行按 <br> 渲染 */
const renderBlock = (text) => renderInline(text).replace(/\n/g, '<br>');

const humanMs = (ms) => {
  if (ms >= 3600000) return `${Math.round(ms / 3600000)} 小时`;
  if (ms >= 60000) return `${Math.round(ms / 60000)} 分钟`;
  return `${Math.max(1, Math.round(ms / 1000))} 秒`;
};

/** 警告页：纯内联样式，不依赖任何外部资源（对方可能根本不加载外链） */
const warningPage = ({ ip, ua, path, retryAfterSec, strikes }) => {
  const cfg = getPageConfig();

  const tipsHtml = cfg.tips.length
    ? `    <ul>\n${cfg.tips.map((t) => `      <li>${renderBlock(t)}</li>`).join('\n')}\n    </ul>`
    : '';

  const detailsHtml = cfg.showDetails
    ? `    <div class="info">
      <div><b>状态码</b><span>429 Too Many Requests${retryAfterSec ? ` · 请在 ${retryAfterSec} 秒后重试` : ''}</span></div>
      <div><b>来源 IP</b><code>${esc(ip)}</code></div>
      <div><b>请求路径</b><code>${esc(path)}</code></div>
      <div><b>你的 UA</b><code>${esc(ua) || '(空)'}</code></div>
      ${strikes ? `<div><b>违规次数</b><span>第 ${strikes} 次，限制时长会逐次翻倍</span></div>` : ''}
    </div>`
    : '';

  const contactHtml = cfg.contactUrl
    ? `    <div class="foot">
      ${renderInline(cfg.contactLabel)} → <a href="${esc(cfg.contactUrl)}" rel="noopener">${esc(cfg.contactUrl)}</a>
    </div>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(cfg.title)} · ${esc(SITE_NAME)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         padding:24px; background:#0d1117; color:#e6edf3;
         font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; }
  .card { width:100%; max-width:640px; background:#161b22; border:1px solid #30363d;
          border-radius:16px; padding:32px; }
  .badge { display:inline-block; padding:2px 10px; margin-bottom:14px; border-radius:999px;
           background:rgba(248,81,73,.15); color:#ff7b72; font-size:12px; letter-spacing:.05em; }
  h1 { margin:0 0 12px; font-size:22px; }
  p { margin:0 0 14px; color:#9198a1; }
  ul { margin:0 0 14px; padding-left:20px; color:#9198a1; }
  li { margin-bottom:6px; }
  b { color:#c9d1d9; }
  code { padding:2px 6px; border-radius:6px; background:#21262d; color:#e6edf3;
         font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; word-break:break-all; }
  .info { margin:18px 0; padding:14px 16px; border-radius:10px; background:#0d1117;
          border:1px solid #21262d; font-size:13px; color:#9198a1; }
  .info div { display:flex; gap:10px; margin-bottom:6px; }
  .info div:last-child { margin-bottom:0; }
  .info b { flex:0 0 68px; color:#6e7681; font-weight:400; }
  a { color:#58a6ff; }
  .foot { margin-top:20px; padding-top:16px; border-top:1px solid #21262d; font-size:13px; color:#6e7681; }
  /*
   * 窄屏：这张页面访客在手机上是能看到的（万一误伤），所以小小屏也要能读。
   * 信息块从「标签 + 值」两栏改成上下两行，否则 UA 那条会被挤成一列字符。
   */
  @media (max-width: 480px) {
    body { padding:16px; font-size:14px; }
    .card { padding:22px 18px; border-radius:12px; }
    h1 { font-size:19px; }
    .badge { margin-bottom:10px; }
    ul { padding-left:18px; }
    .info { padding:12px 14px; }
    .info div { flex-direction:column; gap:2px; margin-bottom:10px; }
    .info b { flex:none; }
    .foot { font-size:12px; }
  }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">${esc(cfg.badge)}</span>
    <h1>${esc(cfg.title)}</h1>
    <p>
${renderBlock(cfg.message)}
    </p>
${tipsHtml}
${detailsHtml}
${contactHtml}
  </div>
</body>
</html>`;
};

const sendWarning = (res, info) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  if (info.retryAfterSec > 0) res.set('Retry-After', String(info.retryAfterSec));
  res.status(429).type('html').send(warningPage(info));
};

/**
 * 测试按钮用的预览：只渲染示例数据（TEST-NET-3 段），不计数、不进封禁表。
 */
const previewWarningPage = () =>
  warningPage({
    ip: '203.0.113.47',
    ua: 'AppGalleryData/2.0',
    path: '/api/v0/apps/list/529?page_size=100',
    retryAfterSec: 900,
    strikes: 1
  });

/* ------------------------------ 封禁 ------------------------------ */

/** 取（或建）某个 IP 的运行态。中间件和后台「一键触发」共用。 */
const getOrCreateEntry = (ip) => {
  let entry = state.get(ip);
  if (!entry) {
    entry = { hits: [], strikes: 0, blockedUntil: 0, ua: '' };
    state.set(ip, entry);
  }
  return entry;
};

/** 执行一次封禁：违规次数 +1、算时长、写记录、打日志；blockMs 传了就用它 */
const applyBlock = (entry, { ip, ua, path, hitsUsed = 0 }) => {
  entry.strikes += 1;
  stats.strikes += 1;
  const blockMs = Math.min(BASE_BLOCK_MS * Math.pow(4, entry.strikes - 1), MAX_BLOCK_MS);
  entry.blockedUntil = Date.now() + blockMs;
  entry.hits = [];
  if (ua) entry.ua = String(ua).slice(0, 200);

  recordBlock({ ip, ua: entry.ua, path, hits: hitsUsed, strikes: entry.strikes, blockMs });

  pushLiveLog(
    'warn',
    `脚本护栏：已限制 ${ip}（${entry.ua || '无 UA'}）请求 ${path} · 封禁 ${humanMs(blockMs)}`,
    { kind: 'system' }
  );

  return { blockMs, strikes: entry.strikes };
};

/** 后台「一键触发真实拦截」：对该 IP 真封一次，返回会发给它的 429 页面 */
const triggerBlock = (ip, { ua, path } = {}) => {
  const key = String(ip || '').trim();
  if (!key) return null;

  const entry = getOrCreateEntry(key);
  const uaText = String(ua || '').trim() || 'OpenStore-Guard-SelfTest/1.0';
  const pathText = String(path || '').trim() || '/api/v0/apps/list/1?page_size=100';

  const { blockMs, strikes } = applyBlock(entry, {
    ip: key,
    ua: uaText,
    path: pathText,
    // 手动触发视作「宽限配额已用满」，这样一次点击就能看到真正的拦截结果
    hitsUsed: FREE_HITS
  });

  return {
    ip: key,
    status: 429,
    strikes,
    blockMs,
    remainMs: Math.max(0, entry.blockedUntil - Date.now()),
    html: warningPage({ ip: key, ua: entry.ua, path: pathText, retryAfterSec: Math.ceil(blockMs / 1000), strikes })
  };
};

/* ---------------------------- 硬封禁名单 ---------------------------- */

/*
 * 硬封禁：不区分 UA，命中后该 IP 的一切请求都返回 429（连浏览器也打不开站点）。
 * 名单持久化在 script_guard_bans，启动载入内存，热路径只查 Map。
 * /api/admin/*、/admin、/ws 例外，否则误封自己的出口 IP 就进不去后台解封。
 */
const HARD_BAN_EXEMPT_RE = [/^\/api\/admin(\/|$)/, /^\/admin(\/|$)/, /^\/ws$/];
const hardBans = new Map(); // ip -> { reason, createdAt, expiresAt(ms, 0=永久), hits }

const toSqlUtc = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const parseSqlUtc = (val) => {
  if (!val) return 0;
  const ms = Date.parse(String(val).replace(' ', 'T') + 'Z');
  return Number.isNaN(ms) ? 0 : ms;
};

/** 从库里载入名单（启动时调一次；过期的顺手丢掉） */
const loadHardBans = (cb) => {
  db.all(`SELECT ip, reason, created_at, expires_at FROM script_guard_bans`, [], (err, rows) => {
    if (err) {
      if (cb) cb(err);
      return;
    }
    const now = Date.now();
    hardBans.clear();
    for (const row of rows || []) {
      const expiresAt = parseSqlUtc(row.expires_at);
      if (expiresAt && expiresAt <= now) continue;
      hardBans.set(normalizeIp(row.ip), {
        reason: row.reason || '',
        createdAt: row.created_at || '',
        expiresAt,
        hits: 0
      });
    }
    if (cb) cb(null);
  });
};

/** 只接受 IP 字面量，避免把任意字符串写进名单/内存键 */
const isValidIp = (raw) => /^[0-9a-fA-F:.]{3,45}$/.test(String(raw || '').trim());

/** 硬封禁一个 IP：durationMs 为 0 或不传 = 永久 */
const hardBanIp = (ip, { reason = '', durationMs = 0 } = {}, cb) => {
  const key = normalizeIp(String(ip || '').trim());
  if (!key || !isValidIp(key)) {
    if (cb) cb(new Error('IP 格式不正确'));
    return;
  }
  const expiresAt = Number(durationMs) > 0 ? Date.now() + Number(durationMs) : 0;
  const safeReason = String(reason || '').slice(0, 200);

  db.run(
    `INSERT INTO script_guard_bans (ip, reason, created_at, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, created_at = CURRENT_TIMESTAMP, expires_at = excluded.expires_at`,
    [key, safeReason, expiresAt ? toSqlUtc(expiresAt) : null],
    (err) => {
      if (!err) {
        const prev = hardBans.get(key);
        hardBans.set(key, { reason: safeReason, createdAt: toSqlUtc(Date.now()), expiresAt, hits: prev?.hits || 0 });
        pushLiveLog('warn', `脚本护栏：已硬封禁 ${key}${safeReason ? `（${safeReason}）` : ''}`, { kind: 'system' });
      }
      if (cb) cb(err || null);
    }
  );
};

const hardUnbanIp = (ip, cb) => {
  const key = normalizeIp(String(ip || '').trim());
  if (!key) {
    if (cb) cb(new Error('缺少 IP'));
    return;
  }
  db.run(`DELETE FROM script_guard_bans WHERE ip = ?`, [key], (err) => {
    if (!err) {
      hardBans.delete(key);
      pushLiveLog('info', `脚本护栏：已解除硬封禁 ${key}`, { kind: 'system' });
    }
    if (cb) cb(err || null);
  });
};

const listHardBans = () => {
  const now = Date.now();
  return [...hardBans.entries()]
    .map(([ip, v]) => ({
      ip,
      reason: v.reason,
      created_at: v.createdAt,
      expires_at: v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      permanent: !v.expiresAt,
      remainMs: v.expiresAt ? Math.max(0, v.expiresAt - now) : 0,
      hits: v.hits || 0
    }))
    .sort((a, b) => b.hits - a.hits);
};

/** 硬封禁中间件：挂在最前面（静态资源与 SPA 兜底之前），名单为空时零开销 */
const hardBanGuard = (req, res, next) => {
  if (hardBans.size === 0) return next();
  const path = req.path || '';
  if (HARD_BAN_EXEMPT_RE.some((re) => re.test(path))) return next();

  const ip = getClientIp(req);
  const ban = hardBans.get(ip);
  if (!ban) return next();

  const now = Date.now();
  if (ban.expiresAt && ban.expiresAt <= now) {
    hardUnbanIp(ip);
    return next();
  }

  ban.hits += 1;

  const retryAfterSec = ban.expiresAt ? Math.ceil((ban.expiresAt - now) / 1000) : 0;
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  if (retryAfterSec > 0) res.set('Retry-After', String(retryAfterSec));
  res
    .status(429)
    .type('html')
    .send(
      warningPage({
        ip,
        ua: req.headers['user-agent'],
        path: req.originalUrl,
        retryAfterSec,
        strikes: 0
      })
    );
};

/* ------------------------------ 中间件 ------------------------------ */

/** 挂在需要保护的代理前缀上，例如 router.use('/api/v0', scriptGuard) */
const scriptGuard = (req, res, next) => {
  if (!GUARD_ENABLED) return next();
  if (!looksLikeScript(req.headers['user-agent'])) return next();
  if (isInternal(req)) return next();

  const ip = getClientIp(req);

  const now = Date.now();
  const entry = getOrCreateEntry(ip);
  entry.ua = String(req.headers['user-agent'] || '').slice(0, 200);
  stats.scriptRequests += 1;

  // 已在封禁期：直接弹警告页，不消耗任何配额
  if (entry.blockedUntil > now) {
    stats.blocked += 1;
    return sendWarning(res, {
      ip,
      ua: entry.ua,
      path: req.originalUrl,
      retryAfterSec: Math.ceil((entry.blockedUntil - now) / 1000),
      strikes: entry.strikes
    });
  }

  entry.hits = entry.hits.filter((t) => now - t < WINDOW_MS);

  if (entry.hits.length >= FREE_HITS) {
    const hitsUsed = entry.hits.length;
    const { blockMs, strikes } = applyBlock(entry, {
      ip,
      ua: entry.ua,
      path: req.originalUrl,
      hitsUsed
    });

    return sendWarning(res, {
      ip,
      ua: entry.ua,
      path: req.originalUrl,
      retryAfterSec: Math.ceil(blockMs / 1000),
      strikes
    });
  }

  entry.hits.push(now);
  next();
};

/** 给后台/诊断用：当前被限制的 IP 一览 */
const scriptGuardSnapshot = () => {
  const now = Date.now();
  return {
    enabled: GUARD_ENABLED,
    freeHits: FREE_HITS,
    windowMs: WINDOW_MS,
    baseBlockMs: BASE_BLOCK_MS,
    contactUrl: getPageConfig().contactUrl,
    stats: { ...stats },
    tracked: state.size,
    blocked: [...state.entries()]
      .filter(([, v]) => v.blockedUntil > now)
      .map(([ip, v]) => ({ ip, ua: v.ua, strikes: v.strikes, remainMs: v.blockedUntil - now }))
  };
};

/*
 * 定期清理：state 常驻内存，正常只有几个脚本 IP，但不能让它无限长大。
 * unref() 保证这个定时器不会拖住进程退出。
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of state) {
    const idle = entry.blockedUntil < now && entry.hits.every((t) => now - t >= WINDOW_MS);
    if (idle) state.delete(ip);
  }
}, 30 * 60 * 1000).unref?.();

// 启动载入配置与名单
loadPageConfig();
loadHardBans();

module.exports = {
  scriptGuard,
  scriptGuardSnapshot,
  looksLikeScript,
  previewWarningPage,
  getPageConfig,
  savePageConfig,
  resetPageConfig,
  listBlockRecords,
  clearBlockRecords,
  unblockIp,
  triggerBlock,
  hardBanGuard,
  hardBanIp,
  hardUnbanIp,
  listHardBans,
  DEFAULT_PAGE_CONFIG
};
