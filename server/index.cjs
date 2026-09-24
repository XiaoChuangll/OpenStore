const express = require('express');
const cors = require('cors');
const axios = require('axios');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { WebSocketServer } = require('ws');
const db = require('./database.cjs');
const { createQueuedLookup } = require('./ip-location.cjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;
const HM_API_TARGET = (process.env.VITE_API_TARGET || '').replace(/\/$/, '');

app.use(cors());

// 兼容字面量 null 请求体：
// axios 在 Content-Type: application/json 下会把 null 序列化成字符串 "null"，
// body-parser 的 strict 模式只接受对象/数组，会直接抛 SyntaxError 返回 400，
// 请求会在到达 /api/v0 代理之前就被拒掉。这里放宽 strict，
// 并把非对象的 body 归一成 {}，既兼容这类客户端，也避免下游解构 req.body 时报错。
app.use(express.json({ strict: false }));
app.use((req, res, next) => {
  // 只处理 JSON 请求体，避免影响 multipart 等其它类型的请求
  const isJsonBody = String(req.headers['content-type'] || '').includes('application/json');
  if (isJsonBody && (req.body === null || typeof req.body !== 'object')) {
    req.body = {};
  }
  next();
});

// ---- 后端实时日志：环形缓冲 + SSE 广播（后台「后端实时」面板使用）----
// 访客统计缓存：总数/地区分布/设备分布都是全表聚合，数据量十万级时每次重算要数百毫秒
const VISITORS_STATS_TTL = 20 * 1000;
const visitorsStatsCache = new Map();

const cachedVisitorsAll = (key, sql, params, cb) => {
  const hit = visitorsStatsCache.get(key);
  if (hit && Date.now() - hit.t < VISITORS_STATS_TTL) return cb(null, hit.data);
  db.all(sql, params, (err, rows) => {
    if (err) return cb(err);
    visitorsStatsCache.set(key, { t: Date.now(), data: rows });
    cb(null, rows);
  });
};

const cachedVisitorsGet = (key, sql, params, cb) => {
  const hit = visitorsStatsCache.get(key);
  if (hit && Date.now() - hit.t < VISITORS_STATS_TTL) return cb(null, hit.data);
  db.get(sql, params, (err, row) => {
    if (err) return cb(err);
    visitorsStatsCache.set(key, { t: Date.now(), data: row });
    cb(null, row);
  });
};

const LIVE_LOG_LIMIT = 200;
const LIVE_LOG_SNAPSHOT = 60;
const liveLogBuffer = [];
const liveSseClients = new Set();

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

// 只记录 /api 请求，避免静态资源刷屏
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  // 重放接口本身的调用不记日志：它真正触发的那个请求会以 kind=replay 记一条，
  // 否则点一次重放会在日志里多出一行 POST /api/admin/replay
  if (req.path === '/api/admin/replay') return next();
  // 重放请求是后端自己发起的：由重放接口统一记一条（带响应预览），这里跳过，
  // 否则同一次重放会出现两行；同时不计入访客统计，避免刷访客数
  const isReplayRequest = req.headers['x-openstore-replay'] === '1';
  if (isReplayRequest) return next();
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    pushLiveLog(level, `${req.method} ${req.path} → ${status} · ${ms}ms`, {
      kind: 'request',
      method: req.method,
      path: req.path,
      status,
      ms
    });
  });
  next();
});

// SSE：EventSource 无法自定义 header，因此同时接受 ?token=
app.get('/api/admin/live', (req, res) => {
  const auth = req.headers.authorization || '';
  const headerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const token = headerToken || String(req.query.token || '');

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(
    `event: hello\ndata: ${JSON.stringify({
      logs: liveLogBuffer.slice(-LIVE_LOG_SNAPSHOT),
      metrics: liveMetrics()
    })}\n\n`
  );

  liveSseClients.add(res);
  pushLiveLog('info', `实时面板已连接（在线 ${liveSseClients.size}）`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: metrics\ndata: ${JSON.stringify(liveMetrics())}\n\n`);
    } catch {
      /* ignore */
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(heartbeat);
    liveSseClients.delete(res);
  });
});

const uploadsDir = path.join(__dirname, 'uploads');

// 访客归属地补充：geoip 缺城市时用国内免费接口补省市（串行 + 缓存，避免打爆第三方）
const lookupVisitorCity = createQueuedLookup({ intervalMs: 150 });

/** 同一 IP 之前若已解析出省市，直接复用，不再请求第三方 */
const findKnownLocation = (ip) =>
  new Promise((resolve) => {
    db.get(
      `SELECT location FROM visitors WHERE ip = ? AND location LIKE '% %' AND location NOT LIKE 'Unknown%' LIMIT 1`,
      [ip],
      (err, row) => resolve(err || !row ? '' : row.location || '')
    );
  });

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// Ensure /uploads is served correctly before SPA fallback
app.use('/uploads', express.static(uploadsDir));

// SEO：文章页的服务端 meta 注入，必须排在静态资源之前
app.get('/articles/:slug', (req, res, next) => {
  if (req.headers.accept && !req.headers.accept.includes('text/html')) {
    return next();
  }

  const slug = req.params.slug;
  const indexPath = path.join(__dirname, '../dist/index.html');

  if (!fs.existsSync(indexPath)) return next();

  const serveDefault = () => next();

  if (!slug) return serveDefault();

  db.get('SELECT title, summary, cover_url, seo_description, seo_keywords FROM blogs WHERE slug = ?', [slug], (err, row) => {
    if (err || !row) return serveDefault();

    fs.readFile(indexPath, 'utf8', (err, html) => {
      if (err) return serveDefault();

      const title = `${row.title} - OpenStore`;
      const description = (row.seo_description || row.summary || '查看文章详细内容').replace(/"/g, '&quot;');
      const defaultKeywords = 'OpenStore,华为应用市场看板,鸿蒙应用看板,鸿蒙应用数据面板,鸿蒙,应用商店,应用下载,榜单,更新,应用分发';
      
      let keywords = row.seo_keywords ? row.seo_keywords : row.title;
      if (keywords) {
        keywords = `${keywords},${defaultKeywords}`;
      } else {
        keywords = defaultKeywords;
      }
      keywords = keywords.replace(/"/g, '&quot;');
      
      const image = row.cover_url || '';

      let modifiedHtml = html;
      
      if (modifiedHtml.includes('<title>')) {
        modifiedHtml = modifiedHtml.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<title>${title}</title>\n</head>`);
      }

      // 不用 dotAll 的 /s 标志（部分 Node 版本不支持），改用 [\s\S]*? 跨行匹配
      if (modifiedHtml.includes('name="description"')) {
        modifiedHtml = modifiedHtml.replace(/<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i, `<meta name="description" content="${description}" />`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta name="description" content="${description}" />\n</head>`);
      }
      
      if (modifiedHtml.includes('name="keywords"')) {
        modifiedHtml = modifiedHtml.replace(/<meta\s+name="keywords"\s+content="[\s\S]*?"\s*\/?>/i, `<meta name="keywords" content="${keywords}" />`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta name="keywords" content="${keywords}" />\n</head>`);
      }

      if (modifiedHtml.includes('property="og:title"')) {
        modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:title"\s+content="[\s\S]*?"\s*\/?>/i, `<meta property="og:title" content="${title}" />`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta property="og:title" content="${title}" />\n</head>`);
      }

      if (modifiedHtml.includes('property="og:description"')) {
        modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:description"\s+content="[\s\S]*?"\s*\/?>/i, `<meta property="og:description" content="${description}" />`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta property="og:description" content="${description}" />\n</head>`);
      }

      if (image) {
        if (modifiedHtml.includes('property="og:image"')) {
          modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:image"\s+content="[\s\S]*?"\s*\/?>/i, `<meta property="og:image" content="${image}" />`);
        } else {
          modifiedHtml = modifiedHtml.replace('</head>', `<meta property="og:image" content="${image}" />\n</head>`);
        }
        
        if (modifiedHtml.includes('name="twitter:image"')) {
          modifiedHtml = modifiedHtml.replace(/<meta\s+name="twitter:image"\s+content="[\s\S]*?"\s*\/?>/i, `<meta name="twitter:image" content="${image}" />`);
        } else {
          modifiedHtml = modifiedHtml.replace('</head>', `<meta name="twitter:image" content="${image}" />\n</head>`);
        }
      }

      if (!modifiedHtml.includes('name="twitter:card"')) {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta name="twitter:card" content="summary_large_image" />\n</head>`);
      }
      
      if (modifiedHtml.includes('name="twitter:title"')) {
        modifiedHtml = modifiedHtml.replace(/<meta\s+name="twitter:title"\s+content="[\s\S]*?"\s*\/?>/i, `<meta name="twitter:title" content="${title}" />`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta name="twitter:title" content="${title}" />\n</head>`);
      }
      
      if (modifiedHtml.includes('name="twitter:description"')) {
        modifiedHtml = modifiedHtml.replace(/<meta\s+name="twitter:description"\s+content="[\s\S]*?"\s*\/?>/i, `<meta name="twitter:description" content="${description}" />`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<meta name="twitter:description" content="${description}" />\n</head>`);
      }

      res.send(modifiedHtml);
    });
  });
});

// 静态资源排在 /uploads 之后，否则 /uploads 会被 SPA 兜底或这里的静态中间件截走
app.use(express.static(path.join(__dirname, '../dist')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

const secretKeyPath = path.join(__dirname, 'secret.key');
function getSecretKey() {
  const envKey = process.env.ENV_SECRET_KEY;
  if (envKey) return Buffer.from(envKey, 'hex');
  if (fs.existsSync(secretKeyPath)) {
    return fs.readFileSync(secretKeyPath);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(secretKeyPath, key);
  return key;
}
const KEY = getSecretKey();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(data) {
  try {
    const buf = Buffer.from(data, 'base64');
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

app.use((req, res, next) => {
  const isPublicApi = req.path.startsWith('/api/public/') || req.path.startsWith('/api/v0/') || req.path === '/api/monitors' || req.path === '/api/about';

  // 后端自己发起的重放请求不计入访客统计（否则重放一次公开接口就会多一个"访客"）
  const isReplayRequest = req.headers['x-openstore-replay'] === '1';

  if (isPublicApi && req.method === 'GET' && !isReplayRequest) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    let cleanIp = ip.toString().split(',')[0].trim();
    if (cleanIp.startsWith('::ffff:')) {
      cleanIp = cleanIp.substring(7);
    } else if (cleanIp === '::1') {
      cleanIp = '127.0.0.1';
    }
    
    // 路径优先取前端追踪器传来的 ?path=，其次是 referer，最后才是 req.path
    let requestPath = req.query.path || req.path;
    
    if (req.headers.referer) {
      try {
        const refUrl = new URL(req.headers.referer);
        const pathFromRef = (refUrl.pathname === '/' ? '/' : refUrl.pathname) + refUrl.search;
        if (!req.query.path) {
          requestPath = pathFromRef;
        }
      } catch (e) {
        // referer 不合法时忽略
      }
    }
    
    // 只拿到 API 路径时，映射回对应的前台页面
    if (requestPath.startsWith('/api/')) {
       if (requestPath === '/api/monitors' || requestPath.startsWith('/api/public/incidents')) {
         requestPath = '/';
       } else if (requestPath.startsWith('/api/v0/')) {
         requestPath = '/exploration';
       }
    }

    // 去重：同一 IP 同一路径 1 分钟内只记一条
    const now = Date.now();
    const oneMinuteAgo = new Date(now - 60000).toISOString().replace('T', ' ').split('.')[0];
    
    db.get(
      `SELECT id FROM visitors WHERE ip = ? AND path = ? AND timestamp > ? LIMIT 1`,
      [cleanIp, requestPath, oneMinuteAgo],
      (err, row) => {
        if (err) {
          console.error('Error checking visitor de-duplication:', err);
        } else if (!row) {
          const geo = geoip.lookup(cleanIp);
          const location = geo ? [geo.city, geo.country].filter(Boolean).join(' ') : 'Unknown Local';
          
          const parser = new UAParser(req.headers['user-agent']);
          const browser = parser.getBrowser();
          const os = parser.getOS();
          const dev = parser.getDevice();
          
          let deviceStr = '';
          const browserStr = [browser.name, browser.version].filter(Boolean).join(' ');
          if (dev.vendor || dev.model) {
            deviceStr = [dev.vendor, dev.model].filter(Boolean).join(' ');
          }
          const osStr = [os.name, os.version].filter(Boolean).join(' ');
          
          const parts = [];
          if (deviceStr) parts.push(deviceStr);
          if (osStr) parts.push(osStr);
          if (browserStr) parts.push(browserStr);
          
          const device = parts.length > 0 ? parts.join(' - ') : 'Unknown Device';

          db.run(
            `INSERT INTO visitors (ip, location, device, path) VALUES (?, ?, ?, ?)`,
            [cleanIp, location, device, requestPath],
            function(err) {
              if (err) {
                console.error('Error tracking visitor:', err);
              } else {
                const newVisitor = {
                  id: this.lastID,
                  ip: cleanIp,
                  location,
                  device,
                  path: requestPath,
                  timestamp: new Date().toISOString()
                };
                broadcast('visitors:new', newVisitor);

                // geoip 查不到城市时（国内移动 / 宽带 IP 很常见）异步补省市，不阻塞请求
                if (!geo || !geo.city) {
                  const countryCode = geo?.country || 'CN';
                  findKnownLocation(cleanIp)
                    .then((known) => {
                      if (known) return known;
                      return lookupVisitorCity(cleanIp).then((info) => {
                        if (!info) return '';
                        const parts = info.parts || [info.city, info.province];
                        return [...parts, countryCode].filter(Boolean).join(' ');
                      });
                    })
                    .then((resolved) => {
                      if (!resolved || resolved === location) return;
                      db.run(
                        `UPDATE visitors SET location = ? WHERE ip = ? AND location = ?`,
                        [resolved, cleanIp, location],
                        () => {}
                      );
                      broadcast('visitors:update', { ip: cleanIp, location: resolved });
                    })
                    .catch(() => {});
                }
              }
            }
          );
        }
      }
    );
  }
  next();
});

app.get('/api/public/track', (req, res) => {
  res.json({ ok: true });
});

// 系统监控用的健康检查
app.get('/api/v0/charts/rating', (req, res) => {
  res.json({ status: 'ok', version: 'v0' });
});

app.get('/next-api/apps/device-overview', (req, res) => {
  res.json({ status: 'ok', service: 'next-api' });
});

// 分类/设备计数变化很慢：新鲜期 30 分钟，过期后仍可用旧数据兜底最多 24 小时
const APP_OVERVIEW_CACHE_TTL = Number(process.env.APP_OVERVIEW_CACHE_TTL_MS || 30 * 60 * 1000);
const APP_OVERVIEW_STALE_TTL = Number(process.env.APP_OVERVIEW_STALE_TTL_MS || 24 * 60 * 60 * 1000);
// 同一时刻最多向上游并发几个请求（原来分组并发 + 组内 Promise.all，峰值不受控）
const APP_OVERVIEW_CONCURRENCY = 3;
// 上游风控：同一个 UA 长期高频请求同一个接口会被封。
// 服务端所有上游请求统一用可识别的 UA，并且全局限流（并发 + 请求间隔）。
const UPSTREAM_USER_AGENT =
  process.env.UPSTREAM_USER_AGENT || 'OpenStore/1.0 (+https://next.betahub.tech)';
const UPSTREAM_MAX_CONCURRENCY = Number(process.env.UPSTREAM_MAX_CONCURRENCY || 2);
const UPSTREAM_MIN_INTERVAL_MS = Number(process.env.UPSTREAM_MIN_INTERVAL_MS || 250);
const APP_OVERVIEW_CACHE_DIR = path.join(__dirname, '.cache');
const APP_OVERVIEW_CACHE_FILE = path.join(APP_OVERVIEW_CACHE_DIR, 'apps-overview.json');
const appOverviewCache = new Map(); // cacheKey -> { timestamp, data }
const appOverviewInflight = new Map(); // cacheKey -> Promise（同一个 key 只允许一次刷新在跑）
const APP_CATEGORY_GROUPS = [
  { label: '工具', aliases: ['工具', 'Tools'] },
  { label: '旅游', aliases: ['旅游', 'Travel'] },
  { label: '休闲益智', aliases: ['休闲益智', '休闲', '益智解谜'] },
  { label: '教育', aliases: ['教育'] },
  { label: '生活服务', aliases: ['生活服务', 'Lifestyle'] },
  { label: '商务', aliases: ['商务', 'Business'] },
  { label: '儿童', aliases: ['儿童', 'শিশু'] },
  { label: '金融理财', aliases: ['金融理财', 'Finance'] },
  { label: '新闻', aliases: ['新闻', 'News', 'Current affairs'] },
  { label: '拍摄美化', aliases: ['拍摄美化'] },
  { label: '运动健康', aliases: ['运动健康', 'Sports & health'] },
  { label: '动作射击', aliases: ['动作射击', '动作', '射击', 'Action'] },
  { label: '角色扮演', aliases: ['角色扮演'] },
  { label: '购物', aliases: ['购物', '購物'] },
  { label: '经营策略', aliases: ['经营策略', '经营建造', '策略', '模拟养成'] },
  { label: '出行导航', aliases: ['出行导航', 'Navigation', 'Навигация'] },
  { label: '社交', aliases: ['社交', '社交通讯', 'Social'] },
  { label: '汽车', aliases: ['汽车'] },
  { label: '医疗', aliases: ['医疗'] },
  { label: '体育竞速', aliases: ['体育竞速', '体育', '竞速', '竞技'] },
  { label: '棋牌桌游', aliases: ['棋牌桌游', '棋牌'] },
  { label: '资讯', aliases: ['资讯', '新闻阅读'] },
  { label: '美食', aliases: ['美食'] },
  { label: '效率', aliases: ['效率', 'Productivity'] },
  { label: '休闲娱乐', aliases: ['休闲娱乐', '影音娱乐', '影音娛樂'] },
  { label: '音乐', aliases: ['音乐'] },
  { label: '艺术与设计', aliases: ['艺术与设计'] },
  { label: '派对游戏', aliases: ['派对游戏'] },
  { label: '主题', aliases: ['主题', '主题个性'] },
  { label: '阅读与工具书', aliases: ['阅读与工具书'] },
  { label: '卡牌', aliases: ['卡牌'] },
  { label: '影视与直播', aliases: ['影视与直播'] },
  { label: '实用工具', aliases: ['实用工具', '實用工具'] },
  { label: '房产与装修', aliases: ['房产与装修', 'House & home'] },
  { label: '便捷生活', aliases: ['便捷生活'] },
  { label: '旅游住宿', aliases: ['旅游住宿', '旅遊'] },
  { label: '购物比价', aliases: ['购物比价'] }
];
const APP_DEVICE_GROUPS = [
  { key: 'phone', label: '手机', code: 0 },
  { key: 'tv', label: '智慧屏', code: 3 },
  { key: 'tablet', label: '平板', code: 4 },
  { key: 'car', label: '车机', code: 7 },
  { key: 'pc', label: 'PC', code: 15 }
];

// 展平成「别名」维度，用统一的并发上限约束上游请求；同名 label 之后合并求和
const APP_CATEGORY_ALIASES = APP_CATEGORY_GROUPS.flatMap((group) =>
  group.aliases.map((alias) => ({ label: group.label, alias }))
);

const runWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(runners);
  return results;
};

// 全局限流器：保证服务端对上游的请求不超过 UPSTREAM_MAX_CONCURRENCY 个并发，
// 且两次请求的发起间隔不小于 UPSTREAM_MIN_INTERVAL_MS，避免被判成"长期高频请求"
let upstreamActive = 0;
let upstreamLastStart = 0;
let upstreamTimer = null;
const upstreamQueue = [];

const pumpUpstreamQueue = () => {
  if (upstreamTimer || !upstreamQueue.length) return;
  if (upstreamActive >= UPSTREAM_MAX_CONCURRENCY) return;

  const wait = Math.max(0, upstreamLastStart + UPSTREAM_MIN_INTERVAL_MS - Date.now());
  if (wait > 0) {
    upstreamTimer = setTimeout(() => {
      upstreamTimer = null;
      pumpUpstreamQueue();
    }, wait);
    return;
  }

  upstreamActive += 1;
  upstreamLastStart = Date.now();
  const release = upstreamQueue.shift();
  release(() => {
    upstreamActive -= 1;
    pumpUpstreamQueue();
  });
  pumpUpstreamQueue();
};

const withUpstreamSlot = (task) =>
  new Promise((resolve, reject) => {
    upstreamQueue.push((release) => {
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(release);
    });
    pumpUpstreamQueue();
  });

const extractApiTotal = (payload) => {
  return Number(
    payload?.total ??
    payload?.total_count ??
    payload?.data?.total ??
    payload?.data?.total_count ??
    0
  );
};

const fetchCategoryCount = async (categoryName, deviceCode) => {
  if (deviceCode === undefined || deviceCode === null) {
    // 统计分类数量统一走 apps/query（POST）
    const response = await withUpstreamSlot(() =>
      axios.post(
        `${HM_API_TARGET}/api/v0/apps/query?page=0&page_size=1&detail=false`,
        {
          and: [{ key: 'kind_name', value: categoryName, op: 'eq' }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': UPSTREAM_USER_AGENT
          },
          timeout: 10000
        }
      )
    );

    return extractApiTotal(response?.data);
  }

  const response = await withUpstreamSlot(() =>
    axios.post(
      `${HM_API_TARGET}/api/v0/apps/query?page=0&page_size=1&detail=false`,
      {
        and: [
          { key: 'kind_name', value: categoryName, op: 'eq' },
          { key: 'main_device_codes', value: String(deviceCode), op: 'array_contains' }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UPSTREAM_USER_AGENT
        },
        timeout: 10000
      }
    )
  );

  return extractApiTotal(response?.data);
};

const fetchDeviceCount = async (deviceCode) => {
  const response = await withUpstreamSlot(() =>
    axios.post(
      `${HM_API_TARGET}/api/v0/apps/query?page=0&page_size=1&detail=false`,
      {
        and: [{ key: 'main_device_codes', value: String(deviceCode), op: 'array_contains' }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UPSTREAM_USER_AGENT
        },
        timeout: 10000
      }
    )
  );

  return extractApiTotal(response?.data);
};

// 真正打上游的逻辑：一次构建 = 全部分类别名查询 + 设备查询
const buildAppsOverview = async (deviceCode, cacheKey) => {
  const startMessage = `[apps-overview] 开始构建 ${cacheKey}：${APP_CATEGORY_ALIASES.length} 个分类查询 + ${APP_DEVICE_GROUPS.length} 个设备查询（并发 ${APP_OVERVIEW_CONCURRENCY}）`;
  console.log(startMessage);
  pushLiveLog('info', startMessage, { kind: 'cache' });

  const categoryCounts = await runWithConcurrency(
    APP_CATEGORY_ALIASES,
    APP_OVERVIEW_CONCURRENCY,
    async ({ label, alias }) => {
      try {
        return { label, count: await fetchCategoryCount(alias, deviceCode) };
      } catch (error) {
        console.warn(`[apps-overview] Failed to count category ${alias} for ${cacheKey}:`, error.message);
        return { label, count: 0 };
      }
    }
  );

  const countByLabel = new Map();
  categoryCounts.forEach(({ label, count }) => {
    countByLabel.set(label, (countByLabel.get(label) || 0) + count);
  });

  const devices = await runWithConcurrency(APP_DEVICE_GROUPS, APP_OVERVIEW_CONCURRENCY, async (device) => {
    try {
      const count = await fetchDeviceCount(device.code);
      return { key: device.key, label: device.label, code: device.code, count };
    } catch (error) {
      console.warn(`[apps-overview] Failed to count device ${device.key}:`, error.message);
      return { key: device.key, label: device.label, code: device.code, count: 0 };
    }
  });

  return {
    categories: [...countByLabel.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count),
    devices
  };
};

// 磁盘兜底：进程重启后先用旧快照顶住，避免启动瞬间对上游打一轮全量查询
const loadAppsOverviewCacheFromDisk = () => {
  try {
    if (!fs.existsSync(APP_OVERVIEW_CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(APP_OVERVIEW_CACHE_FILE, 'utf8'));
    const now = Date.now();
    Object.entries(raw || {}).forEach(([key, entry]) => {
      const timestamp = Number(entry?.timestamp || 0);
      if (entry?.data && now - timestamp < APP_OVERVIEW_STALE_TTL) {
        appOverviewCache.set(key, { timestamp, data: entry.data });
      }
    });
    console.log(`[apps-overview] 从磁盘恢复了 ${appOverviewCache.size} 份快照`);
  } catch (error) {
    console.warn('[apps-overview] 读取磁盘缓存失败（忽略）:', error.message);
  }
};

const persistAppsOverviewCacheToDisk = () => {
  try {
    fs.mkdirSync(APP_OVERVIEW_CACHE_DIR, { recursive: true });
    const payload = Object.fromEntries(
      [...appOverviewCache.entries()].map(([key, entry]) => [
        key,
        { timestamp: entry.timestamp, data: entry.data }
      ])
    );
    fs.writeFile(APP_OVERVIEW_CACHE_FILE, JSON.stringify(payload), () => {});
  } catch (error) {
    console.warn('[apps-overview] 写入磁盘缓存失败（忽略）:', error.message);
  }
};

// 单飞：同一个 cacheKey 同时只会有一个刷新任务在跑
const refreshAppsOverview = (cacheKey, deviceCode) => {
  const running = appOverviewInflight.get(cacheKey);
  if (running) return running;

  const startedAt = Date.now();
  const task = buildAppsOverview(deviceCode, cacheKey)
    .then((data) => {
      appOverviewCache.set(cacheKey, { timestamp: Date.now(), data });
      persistAppsOverviewCacheToDisk();
      const doneMessage = `[apps-overview] ${cacheKey} 构建完成：${data.categories.length} 个分类 / ${data.devices.length} 个设备，用时 ${Date.now() - startedAt}ms`;
      console.log(doneMessage);
      pushLiveLog('info', doneMessage, { kind: 'cache', ms: Date.now() - startedAt });
      return data;
    })
    .finally(() => {
      appOverviewInflight.delete(cacheKey);
    });

  appOverviewInflight.set(cacheKey, task);
  return task;
};

const getAppsOverview = async (cacheKey, deviceCode) => {
  const cached = appOverviewCache.get(cacheKey);
  const age = cached ? Date.now() - cached.timestamp : Infinity;

  if (cached && age < APP_OVERVIEW_CACHE_TTL) {
    return { data: cached.data, cached: true, stale: false };
  }

  // 有旧数据就先返回旧数据，后台只刷新一次：请求方不用等，也不会形成并发风暴
  if (cached && age < APP_OVERVIEW_STALE_TTL) {
    refreshAppsOverview(cacheKey, deviceCode).catch((error) => {
      console.warn(`[apps-overview] 后台刷新失败 ${cacheKey}:`, error.message);
    });
    return { data: cached.data, cached: true, stale: true };
  }

  // 冷启动：并发进来的请求共享同一个 Promise
  const data = await refreshAppsOverview(cacheKey, deviceCode);
  return { data, cached: false, stale: false };
};

loadAppsOverviewCacheFromDisk();

// ---- 数据新鲜度：各数据源最近更新时间与新鲜度状态 ----
const FRESHNESS_SOURCES = [
  // 只统计「前台访客真的会读到」的数据；访客统计、后端进程这类纯后台信息不再出现在这里
  { key: 'apps', label: '应用库', table: 'apps', column: 'updated_at', ttl: 86400 },
  { key: 'blogs', label: '文章', table: 'blogs', column: 'updated_at', ttl: 604800 },
  { key: 'announcements', label: '公告', table: 'announcements', column: 'updated_at', ttl: 604800 },
  { key: 'comments', label: '评论', table: 'comments', column: 'created_at', ttl: 86400 },
  { key: 'friend_links', label: '友情链接', table: 'friend_links', column: 'updated_at', ttl: 2592000 },
  { key: 'group_chats', label: '群聊', table: 'group_chats', column: 'updated_at', ttl: 2592000 }
];

// 页面访问新鲜度：访客表里存的是前台页面路径，这里聚合成「哪个页面最近被访问、近 30 天被访问多少次」。
// 详情页（/topics/xxx、/articles/xxx…）归并到对应的列表页，榜单保留到二级路径。
const PAGE_LABELS = {
  '/': '首页',
  '/exploration': '探索（市场数据）',
  '/apps': '应用列表',
  '/app-cards': '应用卡片',
  '/topics': '专题列表',
  '/updates': '更新',
  '/articles': '文章',
  '/about': '关于',
  '/submit': '投稿',
  '/music': '音乐',
  '/dashboard': '应用详情',
  '/system-status': '系统状态',
  '/rank/total': '总下载榜',
  '/rank/growth': '下载增长榜',
  '/rank/history': '历史榜单',
  '/rank/non-huawei': '非华为榜单'
};

const normalizeVisitorPath = (rawPath) => {
  const path = String(rawPath || '/').split('?')[0].split('#')[0] || '/';
  if (path === '/') return '/';
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'rank' && segments.length > 2) return `/${segments.slice(0, 2).join('/')}`;
  if (segments.length > 1 && segments[0] !== 'rank') return `/${segments[0]}`;
  return path;
};

app.get('/api/admin/freshness', requireAuth, async (req, res) => {
  const rows = await Promise.all(
    FRESHNESS_SOURCES.map(
      (source) =>
        new Promise((resolve) => {
          db.get(
            `SELECT MAX(${source.column}) AS last,
                    (julianday('now') - julianday(MAX(${source.column}))) * 86400 AS age
             FROM ${source.table}`,
            [],
            (err, row) => {
              if (err) {
                resolve({ ...source, last: null, ageSeconds: null, error: err.message });
                return;
              }
              resolve({
                key: source.key,
                label: source.label,
                ttl: source.ttl,
                last: row?.last || null,
                ageSeconds: Number.isFinite(row?.age) ? Math.max(0, Math.round(row.age)) : null
              });
            }
          );
        })
    )
  );

  // 上游缓存快照（内存）与进程运行时长
  const cacheEntries = [...appOverviewCache.values()];
  const newestCache = cacheEntries.length ? Math.max(...cacheEntries.map((e) => e.timestamp)) : null;
  const oldestCache = cacheEntries.length ? Math.min(...cacheEntries.map((e) => e.timestamp)) : null;
  const now = Date.now();

  const items = [
    ...rows,
    {
      key: 'apps_overview',
      label: '上游缓存快照',
      ttl: APP_OVERVIEW_CACHE_TTL / 1000,
      last: newestCache ? new Date(newestCache).toISOString() : null,
      ageSeconds: newestCache ? Math.round((now - newestCache) / 1000) : null,
      extra: {
        entries: cacheEntries.length,
        oldestAgeSeconds: oldestCache ? Math.round((now - oldestCache) / 1000) : null
      }
    }
  ];

  // 页面访问：按前台页面聚合最近一次访问（90 天内）与近 30 天访问量
  const pageRows = await new Promise((resolve) => {
    db.all(
      `SELECT path,
              MAX(timestamp) AS last,
              SUM(CASE WHEN timestamp >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS visits,
              (julianday('now') - julianday(MAX(timestamp))) * 86400 AS age
       FROM visitors
       WHERE timestamp >= datetime('now', '-90 days')
       GROUP BY path
       ORDER BY visits DESC, last DESC
       LIMIT 120`,
      [],
      (err, list) => resolve(err ? [] : list || [])
    );
  });

  const pageMap = new Map();
  pageRows.forEach((row) => {
    const key = normalizeVisitorPath(row.path);
    const age = Number.isFinite(row.age) ? Math.max(0, Math.round(row.age)) : null;
    const previous = pageMap.get(key);
    if (!previous) {
      pageMap.set(key, {
        key: `page:${key}`,
        path: key,
        label: PAGE_LABELS[key] || key,
        visits: Number(row.visits) || 0,
        ageSeconds: key === '/' && !row.last ? 0 : age,
        last: row.last || null
      });
      return;
    }
    previous.visits += Number(row.visits) || 0;
    if (age !== null && (previous.ageSeconds === null || age < previous.ageSeconds)) {
      previous.ageSeconds = age;
      previous.last = row.last || previous.last;
    }
  });

  const pages = [...pageMap.values()]
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 8);

  res.json({ success: true, now: new Date(now).toISOString(), items, pages });
});

// ---- 调用拓扑：从实时日志缓冲聚合出「前端 → 后端 API → 上游」的链路 ----
const UPSTREAM_PROXY_PREFIXES = ['/api/v0', '/api/proxy-request', '/api/music-proxy', '/next-api'];

app.get('/api/admin/topology', requireAuth, (req, res) => {
  const windowSeconds = Number(req.query.window || 900);
  const since = Date.now() - windowSeconds * 1000;
  const recent = liveLogBuffer.filter((entry) => entry.t >= since);

  const requests = recent.filter((entry) => entry.kind === 'request' && entry.path);
  const cacheEvents = recent.filter((entry) => entry.kind === 'cache');
  const upstreamCalls = recent.filter((entry) => entry.kind === 'upstream');
  const upstreamErrors = upstreamCalls.filter((entry) => (entry.status || 0) >= 400);

  const byPath = new Map();
  requests.forEach((entry) => {
    const key = entry.path;
    const item = byPath.get(key) || { path: key, count: 0, totalMs: 0, maxMs: 0, errors: 0, slow: 0 };
    item.count += 1;
    item.totalMs += entry.ms || 0;
    item.maxMs = Math.max(item.maxMs, entry.ms || 0);
    if ((entry.status || 0) >= 500) item.errors += 1;
    if ((entry.ms || 0) >= 500) item.slow += 1;
    byPath.set(key, item);
  });

  // 上游代理类请求单独聚合，避免被 Top8 截断后"上游节点无数据"
  const isUpstreamPath = (path) => UPSTREAM_PROXY_PREFIXES.some((prefix) => path.startsWith(prefix));
  const upstreamProxyItems = [...byPath.values()].filter((item) => isUpstreamPath(item.path));
  const upstreamProxy = upstreamProxyItems.length
    ? {
        count: upstreamProxyItems.reduce((sum, item) => sum + item.count, 0),
        avgMs: Math.round(
          upstreamProxyItems.reduce((sum, item) => sum + item.totalMs, 0) /
            upstreamProxyItems.reduce((sum, item) => sum + item.count, 0)
        ),
        errors: upstreamProxyItems.reduce((sum, item) => sum + item.errors, 0),
        slow: upstreamProxyItems.reduce((sum, item) => sum + item.slow, 0),
        paths: upstreamProxyItems
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
          .map((item) => ({ path: item.path, count: item.count, avgMs: Math.round(item.totalMs / item.count) }))
      }
    // 即使这一窗口内没有上游调用，也返回一个 0 次的对象：
    // 前端据此画出「上游接口 → 上游 API」这条（虚线）连线，不然上游节点会孤零零挂在右边
    : { count: 0, avgMs: 0, errors: 0, slow: 0, paths: [] };

  const apiNodes = [...byPath.values()]
    .filter((item) => !isUpstreamPath(item.path))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => ({
      id: `api:${item.path}`,
      name: item.path,
      count: item.count,
      avgMs: Math.round(item.totalMs / item.count),
      maxMs: item.maxMs,
      errors: item.errors,
      slow: item.slow
    }));

  res.json({
    success: true,
    windowSeconds,
    totals: {
      requests: requests.length,
      errors: requests.filter((entry) => (entry.status || 0) >= 500).length,
      slow: requests.filter((entry) => (entry.ms || 0) >= 500).length,
      cacheBuilds: cacheEvents.length,
      upstreamErrors: upstreamErrors.length,
      upstreamRequests: upstreamCalls.length
    },
    frontend: { requests: requests.length },
    apiNodes,
    upstreamProxy,
    upstream: {
      calls: upstreamCalls.length,
      avgMs: upstreamCalls.length
        ? Math.round(upstreamCalls.reduce((sum, entry) => sum + (entry.ms || 0), 0) / upstreamCalls.length)
        : 0,
      cacheBuilds: cacheEvents.length,
      errors: upstreamErrors.length
    }
  });
});

// ---- 访客分布与时段洞察：国家分布 + 7×24 热力图 ----
const extractCountryCode = (location) => {
  const value = String(location || '').trim();
  if (!value) return 'UNKNOWN';
  const parts = value.split(/[\s,]+/);
  const last = parts[parts.length - 1].toUpperCase();
  if (/^[A-Z]{2}$/.test(last)) return last;
  const first = parts[0].toUpperCase();
  return /^[A-Z]{2}$/.test(first) ? first : 'UNKNOWN';
};

/** 英文省份 → 中国省级行政区（用于国内地图；未收录的城市不计入省级分布） */
const EN_PROVINCE_LABELS = {
  Beijing: '北京', Tianjin: '天津', Shanghai: '上海', Chongqing: '重庆',
  Hebei: '河北', Shanxi: '山西', Liaoning: '辽宁', Jilin: '吉林', Heilongjiang: '黑龙江',
  Jiangsu: '江苏', Zhejiang: '浙江', Anhui: '安徽', Fujian: '福建', Jiangxi: '江西',
  Shandong: '山东', Henan: '河南', Hubei: '湖北', Hunan: '湖南', Guangdong: '广东',
  Hainan: '海南', Sichuan: '四川', Guizhou: '贵州', Yunnan: '云南', Shaanxi: '陕西',
  Gansu: '甘肃', Qinghai: '青海', Taiwan: '台湾', 'Inner Mongolia': '内蒙古', Guangxi: '广西',
  Tibet: '西藏', Ningxia: '宁夏', Xinjiang: '新疆', 'Hong Kong': '香港', Macao: '澳门'
};

/** 归属地串里已带省份名时直接匹配（例如「Haikou Hainan CN」） */
const matchCnProvince = (location) => {
  const value = String(location || '');
  const hit = Object.keys(EN_PROVINCE_LABELS).find((name) => value.includes(name));
  return hit ? EN_PROVINCE_LABELS[hit] : '';
};

const CITY_TO_PROVINCE = {
  Guangzhou: '广东', Shenzhen: '广东', Dongguan: '广东', Zhongshan: '广东', Shantou: '广东',
  Foshan: '广东', Jiangmen: '广东', Shiqiao: '广东', Zhuhai: '广东', Huizhou: '广东',
  Wuxi: '江苏', Nanjing: '江苏', Suzhou: '江苏', Zhangjiagang: '江苏', Changzhou: '江苏',
  Kunshan: '江苏', Xuzhou: '江苏', Lianyun: '江苏', Yangzhou: '江苏', Nantong: '江苏',
  Beijing: '北京', Haidian: '北京',
  Fuzhou: '福建', Xiamen: '福建', Quanzhou: '福建',
  Qingdao: '山东', Jinan: '山东', Linyi: '山东', Yantai: '山东', Weifang: '山东',
  Shanghai: '上海', Chongqing: '重庆', Tianjin: '天津',
  Shenyang: '辽宁', Dalian: '辽宁',
  Chengdu: '四川', Hangzhou: '浙江', Ningbo: '浙江', Jiaxing: '浙江', Taizhou: '浙江',
  Jinhua: '浙江', Yiwu: '浙江', Wenzhou: '浙江', Shaoxing: '浙江',
  Wuhan: '湖北', Hwang: '湖北', Huangzhou: '湖北',
  Changsha: '湖南', Zhengzhou: '河南', Zhoukou: '河南', Luoyang: '河南', Anyang: '河南', Nanyang: '河南',
  Hefei: '安徽', Wuhu: '安徽',
  "Xi'an": '陕西', Xian: '陕西',
  Nanning: '广西', Beihai: '广西', Guilin: '广西',
  Nanchang: '江西', Kunming: '云南', Changchun: '吉林',
  'Ürümqi': '新疆', Urumqi: '新疆',
  Shijiazhuang: '河北', Baoding: '河北', Zhangjiakou: '河北',
  Guiyang: '贵州', Taiyuan: '山西', Yongning: '宁夏', Hohhot: '内蒙古',
  Harbin: '黑龙江', Lanzhou: '甘肃', Xining: '青海', Haikou: '海南', Sanya: '海南',
  Lhasa: '西藏', Yinchuan: '宁夏'
};

app.get('/api/admin/visitor-insights', requireAuth, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 180), 1), 3650);
  const since = `-${days} days`;

  const query = (sql, params = []) =>
    new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows)));

  const [locations, hours, weekdayHours] = await Promise.all([
    query(
      `SELECT location, COUNT(*) AS count FROM visitors
       WHERE timestamp >= date('now', ?) GROUP BY location ORDER BY count DESC`,
      [since]
    ),
    query(
      `SELECT strftime('%H', datetime(timestamp, '+8 hours')) AS hour, COUNT(*) AS count
       FROM visitors WHERE timestamp >= date('now', ?) GROUP BY hour ORDER BY hour`,
      [since]
    ),
    query(
      `SELECT strftime('%w', datetime(timestamp, '+8 hours')) AS weekday,
              strftime('%H', datetime(timestamp, '+8 hours')) AS hour,
              COUNT(*) AS count
       FROM visitors WHERE timestamp >= date('now', ?)
       GROUP BY weekday, hour`,
      [since]
    )
  ]);

  // 按国家聚合（location 形如 "Guangzhou CN" / "CN"）
  const countryMap = new Map();
  locations.forEach((row) => {
    const code = extractCountryCode(row.location);
    countryMap.set(code, (countryMap.get(code) || 0) + row.count);
  });
  const countries = [...countryMap.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  // 国内省级分布：location 形如 "Guangzhou CN" / "Haidian CN"
  const provinceMap = new Map();
  const cityList = [];
  let unlocatedCn = 0;
  locations.forEach((row) => {
    const code = extractCountryCode(row.location);
    if (code !== 'CN') return;
    const city = String(row.location).trim().split(/[\s,]+/)[0];
    if (!city || /^CN$/i.test(city)) {
      unlocatedCn += row.count;
      return;
    }
    cityList.push({ name: city, count: row.count });
    const province = CITY_TO_PROVINCE[city] || matchCnProvince(row.location);
    if (!province) {
      unlocatedCn += row.count;
      return;
    }
    provinceMap.set(province, (provinceMap.get(province) || 0) + row.count);
  });

  const provinces = [...provinceMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // 7×24 矩阵（0=周日）
  const matrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  weekdayHours.forEach((row) => {
    const w = Number(row.weekday);
    const h = Number(row.hour);
    if (w >= 0 && w < 7 && h >= 0 && h < 24) matrix[w][h] = row.count;
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hours.find((row) => Number(row.hour) === hour)?.count || 0
  }));

  res.json({
    success: true,
    days,
    total: countries.reduce((sum, item) => sum + item.count, 0),
    countries: countries.slice(0, 40),
    china: {
      provinces,
      cities: cityList.sort((a, b) => b.count - a.count).slice(0, 20),
      unlocated: unlocatedCn
    },
    hourly,
    matrix
  });
});

// ---- 请求重放：把实时日志里的一条请求原样再发一次，便于复现问题 ----
app.post('/api/admin/replay', requireAuth, async (req, res) => {
  const method = String(req.body?.method || 'GET').toUpperCase();
  const target = String(req.body?.path || '');
  const confirmMutation = req.body?.confirm === true;

  if (!['GET', 'HEAD', 'POST'].includes(method)) {
    return res.status(400).json({ error: '仅支持重放 GET / HEAD / POST' });
  }
  if (!target.startsWith('/api/')) {
    return res.status(400).json({ error: '只能重放站内 /api 开头的路径' });
  }
  // 认证与重放本身不允许重放；写操作需要显式确认，避免误触发删除等副作用
  if (target.startsWith('/api/admin/auth') || target.startsWith('/api/admin/replay')) {
    return res.status(400).json({ error: '出于安全考虑，不允许重放认证接口' });
  }
  if (method === 'POST' && !confirmMutation) {
    return res.status(409).json({ error: '该请求可能产生副作用，需要显式确认', needConfirm: true });
  }

  const startedAt = Date.now();
  try {
    // 带上当前管理员的凭证，否则重放需要鉴权的接口只会拿到 401，无法复现原结果
    // x-openstore-replay：让请求中间件把它记成 kind=replay（带「重放」标签）且不计访客
    const replayHeaders = { 'User-Agent': 'OpenStore-Replay/1.0', 'x-openstore-replay': '1' };
    if (req.headers.authorization) {
      replayHeaders.Authorization = req.headers.authorization;
    }

    const response = await axios({
      method,
      url: `http://127.0.0.1:${PORT}${target}`,
      headers: replayHeaders,
      data: method === 'POST' ? {} : undefined,
      validateStatus: () => true,
      timeout: 30000,
      responseType: 'text',
      transformResponse: [(d) => d]
    });
    const ms = Date.now() - startedAt;
    const preview = String(response.data ?? '').slice(0, 1200);
    const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';

    // 重放只在这里记一条（正文不带「↻ 重放」，前端按 kind 渲染标签），
    // preview 一起下发，日志行仍可展开看响应内容
    pushLiveLog(level, `${method} ${target} → ${response.status} · ${ms}ms`, {
      kind: 'replay',
      method,
      path: target,
      status: response.status,
      ms,
      preview
    });

    res.json({ success: true, status: response.status, ms, preview });
  } catch (error) {
    const ms = Date.now() - startedAt;
    pushLiveLog('error', `↻ 重放失败 ${method} ${target}：${error.message}`, {
      kind: 'replay',
      method,
      path: target,
      ms
    });
    res.status(500).json({ success: false, error: error.message, ms });
  }
});

app.get('/api/public/apps/overview', async (req, res) => {
  const deviceParam = req.query.device;
  const deviceCode =
    deviceParam === undefined || deviceParam === null || deviceParam === ''
      ? undefined
      : Number(deviceParam);
  const cacheKey = deviceCode === undefined || Number.isNaN(deviceCode) ? 'all' : `device:${deviceCode}`;

  try {
    const { data, cached, stale } = await getAppsOverview(cacheKey, deviceCode);
    // 客户端/CDN 也缓存一会儿，减少同一批访客的重复请求
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.json({ success: true, data, cached, stale });
  } catch (error) {
    console.error('Failed to build apps overview:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to build apps overview'
    });
  }
});

// 上游按 User-Agent 做风控：缺少 UA 会直接返回 400 Missing User-Agent header
const UPSTREAM_DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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
    // 透传客户端的真实请求头（含 User-Agent），避免上游按 UA 拦截
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (PROXY_HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      headers[key] = value;
    }
    // 客户端未携带 UA 时兜底一个浏览器 UA，保证上游不会因缺少 UA 返回 400
    headers['user-agent'] = req.headers['user-agent'] || UPSTREAM_DEFAULT_UA;
    
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
    console.error(`Proxy error [${req.method} ${fullUrl}]:`, error.message);
    pushLiveLog('error', `上游代理失败 ${req.method} ${url}：${error.message}`, { kind: 'upstream' });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy Error: ' + error.message });
    }
  }
};

// ---- 异常应用：屏蔽上游脏数据 ----
const blockedAppsCache = { at: 0, set: new Set() };
const BLOCKED_APPS_TTL_MS = 10 * 1000;

const loadBlockedAppPackages = (cb) => {
  const now = Date.now();
  if (now - blockedAppsCache.at < BLOCKED_APPS_TTL_MS) return cb(blockedAppsCache.set);

  db.all(`SELECT package FROM blocked_apps`, [], (err, rows) => {
    if (!err) {
      blockedAppsCache.at = now;
      blockedAppsCache.set = new Set(
        rows.map((row) => String(row.package || '').toLowerCase()).filter(Boolean)
      );
    }
    cb(blockedAppsCache.set);
  });
};

const invalidateBlockedAppsCache = () => {
  blockedAppsCache.at = 0;
};

app.get('/api/admin/blocked-apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM blocked_apps ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/admin/blocked-apps', requireAuth, (req, res) => {
  const pkg = String(req.body?.package || '').trim().toLowerCase();
  if (!pkg) return res.status(400).json({ error: '缺少 package' });

  const name = String(req.body?.name || '').trim() || null;
  const iconUrl = String(req.body?.icon_url || '').trim() || null;
  const note = String(req.body?.note || '').trim() || null;

  db.run(
    `INSERT INTO blocked_apps (package, name, icon_url, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(package) DO UPDATE SET name = excluded.name, icon_url = excluded.icon_url, note = excluded.note`,
    [pkg, name, iconUrl, note],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      invalidateBlockedAppsCache();
      logAction(req.user?.username, 'create', 'blocked_apps', pkg, { package: pkg, name });
      res.json({ success: true, package: pkg });
    }
  );
});

app.delete('/api/admin/blocked-apps/:package', requireAuth, (req, res) => {
  const pkg = String(req.params.package || '').trim().toLowerCase();
  if (!pkg) return res.status(400).json({ error: '缺少 package' });

  db.run(`DELETE FROM blocked_apps WHERE package = ?`, [pkg], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    invalidateBlockedAppsCache();
    logAction(req.user?.username, 'delete', 'blocked_apps', pkg, { package: pkg });
    res.json({ success: true });
  });
});

/**
 * 列表查询（没有搜索条件）时才剔除被屏蔽的应用；
 * 带搜索关键词的请求原样放行，保证屏蔽掉的应用仍然能被搜到。
 */
const isPlainAppListQuery = (body) => {
  const conditions = Array.isArray(body?.and) ? body.and : [];
  if (!conditions.length) return true;

  return conditions.every((condition) => {
    if (!condition) return true;
    if (condition.key === 'listed_at') return true; // 日期筛选不算搜索
    return String(condition.value ?? '') === '%';
  });
};

app.use('/api/v0', (req, res, next) => {
  if (req.method !== 'POST' || req.path !== '/apps/query' || !isPlainAppListQuery(req.body)) {
    return next();
  }

  loadBlockedAppPackages(async (blocked) => {
    if (!blocked.size) return next();

    const target = process.env.VITE_API_TARGET || 'https://shenjack.top:10003';
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': req.headers['user-agent'] || UPSTREAM_DEFAULT_UA
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
app.use('/api/v0', createProxy(process.env.VITE_API_TARGET || 'https://shenjack.top:10003'));

// /next-api -> https://next.vcck.cn/api
app.use('/next-api', createProxy(process.env.VITE_NEXT_API_TARGET || 'https://next.vcck.cn', (path) => path.replace(/^\/next-api/, '/api')));


app.post('/api/proxy-request', async (req, res) => {
  const { url, method = 'GET', headers = {}, data = null, body = null } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const config = {
      method,
      url,
      headers: {
        ...headers,
        // host 交给 axios / Node 自己管
        host: undefined
      },
      data: data || body,
      timeout: 10000, // 10s timeout
      validateStatus: () => true // Resolve all status codes
    };

    const startTime = Date.now();
    const response = await axios(config);
    const duration = Date.now() - startTime;

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      duration
    });
  } catch (error) {
    res.json({
      status: 0,
      statusText: 'Error',
      error: error.message,
      duration: 0
    });
  }
});

app.get('/api/music-proxy', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://music.163.com/'
      },
      timeout: 10000
    });

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

    response.data.pipe(res);
  } catch (error) {
    console.error('Music proxy error:', error.message);
    res.status(500).send('Proxy error');
  }
});

// ---------------------------------------------------------------------------
// 应用截图同源代理
//
// 华为 CDN 的截图（appimg-*.dbankcdn.com/application/screenshutN/...）本身可以直连，
// 但直连意味着每个访客都要自己去连华为 CDN：海外/公司网络/广告拦截插件都可能失败，
// 而且我们完全感知不到。这里改成由服务端取图，浏览器只访问本站同源地址。
//
// 安全边界：
//   * 只允许 https + *.dbankcdn.com + /application/screenshut... 的地址，其它一律 403
//   * 不跟随重定向，8s 超时，单张上限 6 MiB
//   * 校验图片 magic bytes，上游返回非图片时按 502 处理
// 可用 SCREENSHOT_PROXY=off 一键关闭（关闭后前端会自动隐藏截图区块）。
// ---------------------------------------------------------------------------
const SCREENSHOT_PROXY_DISABLED = () => String(process.env.SCREENSHOT_PROXY || '').toLowerCase() === 'off';
const SCREENSHOT_MAX_BYTES = 6 * 1024 * 1024; // 单张上限
const SCREENSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 缓存 7 天
const SCREENSHOT_CACHE_MAX_ENTRIES = Number(process.env.SCREENSHOT_CACHE_ENTRIES || 128);
const SCREENSHOT_CACHE_MAX_BYTES = Number(process.env.SCREENSHOT_CACHE_BYTES || 64 * 1024 * 1024);
const SCREENSHOT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SCREENSHOT_URL_RE = /^https:\/\/([a-z0-9-]+\.)*dbankcdn\.com\/application\/screenshut[A-Za-z0-9]*\/[A-Za-z0-9._/-]*\.(jpe?g|png|webp)$/i;

const screenshotCache = new Map(); // url -> { buffer, contentType, ts }
const screenshotInFlight = new Map(); // url -> Promise<Buffer>
let screenshotCacheBytes = 0;

const isAllowedScreenshotUrl = (raw) => {
  if (!SCREENSHOT_URL_RE.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.dbankcdn.com');
  } catch {
    return false;
  }
};

const sniffImageType = (buffer) => {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length > 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
};

const fetchScreenshot = async (raw) => {
  const response = await axios({
    method: 'get',
    url: raw,
    responseType: 'stream',
    timeout: 8000,
    maxRedirects: 0,
    validateStatus: (status) => status === 200,
    headers: {
      'User-Agent': SCREENSHOT_UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });

  const chunks = [];
  let size = 0;
  for await (const chunk of response.data) {
    size += chunk.length;
    if (size > SCREENSHOT_MAX_BYTES) {
      response.data.destroy();
      throw new Error('screenshot exceeds size limit');
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

// 命中后重新插入，保持 Map 的插入顺序即 LRU 顺序
const rememberScreenshot = (raw, buffer, contentType) => {
  const previous = screenshotCache.get(raw);
  if (previous) screenshotCacheBytes -= previous.buffer.length;
  screenshotCache.delete(raw);
  screenshotCache.set(raw, { buffer, contentType, ts: Date.now() });
  screenshotCacheBytes += buffer.length;

  while (
    screenshotCache.size > SCREENSHOT_CACHE_MAX_ENTRIES ||
    screenshotCacheBytes > SCREENSHOT_CACHE_MAX_BYTES
  ) {
    const oldestKey = screenshotCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = screenshotCache.get(oldestKey);
    screenshotCache.delete(oldestKey);
    screenshotCacheBytes -= oldest.buffer.length;
  }
};

app.get('/api/screenshot', async (req, res) => {
  if (SCREENSHOT_PROXY_DISABLED()) {
    return res.status(403).type('text/plain').send('screenshot proxy disabled');
  }

  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) return res.status(400).type('text/plain').send('url is required');
  if (!isAllowedScreenshotUrl(raw)) return res.status(403).type('text/plain').send('url not allowed');

  const cached = screenshotCache.get(raw);
  if (cached && Date.now() - cached.ts < SCREENSHOT_TTL_MS) {
    rememberScreenshot(raw, cached.buffer, cached.contentType);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Content-Length', String(cached.buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(cached.buffer);
  }
  if (cached) {
    screenshotCache.delete(raw);
    screenshotCacheBytes -= cached.buffer.length;
  }

  try {
    let pending = screenshotInFlight.get(raw);
    if (!pending) {
      pending = fetchScreenshot(raw);
      screenshotInFlight.set(raw, pending);
      pending
        .finally(() => screenshotInFlight.delete(raw))
        .catch(() => {});
    }

    const buffer = await pending;
    const contentType = sniffImageType(buffer);
    if (!contentType) {
      return res.status(502).type('text/plain').send('upstream response is not an image');
    }

    rememberScreenshot(raw, buffer, contentType);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(buffer);
  } catch (error) {
    console.warn('[screenshot proxy]', error.message, raw);
    return res.status(502).type('text/plain').send('screenshot fetch failed');
  }
});

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['host'];
  // 前后端同域，返回相对路径即可
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

app.get('/api/uploads', requireAuth, (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Failed to list uploads:', err);
      return res.status(500).json({ error: 'Failed to list uploads' });
    }

    const fileStats = files
      .map(file => {
        try {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            url: `/uploads/${file}`,
            mtime: stats.mtimeMs,
            size: stats.size
          };
        } catch (e) {
          return null;
        }
      })
      .filter(f => f && /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name))
      .sort((a, b) => b.mtime - a.mtime);

    res.json({ items: fileStats });
  });
});

// Proxy to UptimeRobot
// UptimeRobot 单次调用要 0.7~2.7s，而且每个访客都会打一次 —— 这里加短时缓存 + 并发合并 + 失败兜旧值
const MONITORS_CACHE_TTL_MS = Math.max(0, Number(process.env.MONITORS_CACHE_TTL_SECONDS ?? 60)) * 1000;
let monitorsCache = { at: 0, data: null };
let monitorsInFlight = null;

const fetchMonitorsFromUpstream = async () => {
  let API_KEY = '';
    try {
      await new Promise((resolve) => {
        db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, ['VUE_APP_API_KEY'], (e1, row) => {
          if (!e1 && row && row.value_encrypted) {
            const plain = decrypt(row.value_encrypted);
            if (plain && plain.trim()) API_KEY = plain.trim();
          }
          resolve();
        });
      });
    } catch {}
    if (!API_KEY) API_KEY = process.env.VUE_APP_API_KEY || '';
    if (!API_KEY) {
      return { stat: 'ok', monitors: [] };
    }

    // UptimeRobot requires x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('api_key', API_KEY);
    params.append('format', 'json');
    params.append('logs', '1');
    params.append('response_times', '1');
    params.append('ssl', '1');
    params.append('custom_uptime_ratios', '1-7-30'); // 获取过去1天、7天、30天的可用率

    // Generate 30 daily ranges for the visualization
    const now = Math.floor(Date.now() / 1000);
    const ranges = [];
    for (let i = 29; i >= 0; i--) {
      const start = now - (i + 1) * 86400;
      const end = now - i * 86400;
      ranges.push(`${start}_${end}`);
    }
    params.append('custom_uptime_ranges', ranges.join('-'));

    const response = await axios.post('https://api.uptimerobot.com/v2/getMonitors', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return response.data;
};

app.get('/api/monitors', async (req, res) => {
  const fresh = monitorsCache.data && Date.now() - monitorsCache.at < MONITORS_CACHE_TTL_MS;
  if (fresh) {
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(MONITORS_CACHE_TTL_MS / 1000)}`);
    return res.json(monitorsCache.data);
  }

  try {
    // 同一时刻只有一次上游请求，其他并发请求等它的结果
    if (!monitorsInFlight) {
      monitorsInFlight = fetchMonitorsFromUpstream().finally(() => {
        monitorsInFlight = null;
      });
    }
    const data = await monitorsInFlight;
    monitorsCache = { at: Date.now(), data };
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(MONITORS_CACHE_TTL_MS / 1000)}`);
    res.json(data);
  } catch (error) {
    console.error('UptimeRobot API Error:', error.message);
    // 上游挂了就先用旧数据顶着，别让首页跟着报错
    if (monitorsCache.data) {
      res.setHeader('X-Cache', 'STALE');
      return res.json(monitorsCache.data);
    }
    res.status(500).json({ error: 'Failed to fetch monitors' });
  }
});

// 单个 IP 的最近访问记录（访客日志里点卡片 / 行时展开）
app.get('/api/visitors/ip-history', requireAuth, (req, res) => {
  const ip = String(req.query.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'Missing ip' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);

  db.get(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT path) AS path_kinds,
            COUNT(DISTINCT device) AS device_kinds,
            MIN(timestamp) AS first_seen,
            MAX(timestamp) AS last_seen
       FROM visitors WHERE ip = ?`,
    [ip],
    (err, agg) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT id, ip, location, device, path, timestamp
           FROM visitors WHERE ip = ?
          ORDER BY timestamp DESC LIMIT ?`,
        [ip, limit],
        (err2, rows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({
            ip,
            total: agg?.total || 0,
            path_kinds: agg?.path_kinds || 0,
            device_kinds: agg?.device_kinds || 0,
            first_seen: agg?.first_seen || '',
            last_seen: agg?.last_seen || '',
            location: rows?.[0]?.location || '',
            visitors: rows || []
          });
        }
      );
    }
  );
});

app.get('/api/visitors', (req, res) => {
  const limit = Number(req.query.limit || req.query.pageSize || 50);
  const page = req.query.page ? Number(req.query.page) : null;
  const { location, device, path } = req.query;

  let whereClauses = [];
  let whereParams = [];

  if (location) {
    whereClauses.push(`location LIKE ?`);
    whereParams.push(`%${location}%`);
  }
  if (device) {
    whereClauses.push(`device LIKE ?`);
    whereParams.push(`%${device}%`);
  }
  if (path) {
    whereClauses.push(`path LIKE ?`);
    whereParams.push(`%${path}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  cachedVisitorsGet(
    `agg:${whereSql}:${JSON.stringify(whereParams)}`,
    `SELECT 
      COUNT(*) AS total,
      COUNT(DISTINCT ip) AS unique_ip,
      COUNT(DISTINCT location) AS location_kinds,
      COUNT(DISTINCT device) AS device_kinds
     FROM visitors ${whereSql}`,
    whereParams, 
    (e1, agg) => {
    if (e1) return res.status(500).json({ error: e1.message });
    
    let sql = `SELECT * FROM visitors ${whereSql} ORDER BY timestamp DESC LIMIT ?`;
    let params = [...whereParams, limit];

    if (page) {
      const offset = (page - 1) * limit;
      sql = `SELECT * FROM visitors ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      params = [...whereParams, limit, offset];
    }

    db.all(sql, params, (e2, rows) => {
      if (e2) {
        res.status(500).json({ error: e2.message });
        return;
      }
      // total / unique_ip 跟着筛选条件走，地区与设备分布保持全局，给「分布」视图用
      
      cachedVisitorsAll('loc:global', `SELECT location AS name, COUNT(*) AS count FROM visitors GROUP BY location ORDER BY count DESC`, [], (e3, locRows) => {
        if (e3) {
          res.status(500).json({ error: e3.message });
          return;
        }
        cachedVisitorsAll('dev:global', `SELECT device AS name, COUNT(*) AS count FROM visitors GROUP BY device ORDER BY count DESC`, [], (e4, devRows) => {
          if (e4) {
            res.status(500).json({ error: e4.message });
            return;
          }
          res.json({
            visitors: rows,
            total: agg?.total ?? rows.length,
            unique_ip: agg?.unique_ip ?? 0,
            location_kinds: agg?.location_kinds ?? 0,
            device_kinds: agg?.device_kinds ?? 0,
            locationStats: locRows || [],
            deviceStats: devRows || [],
          });
        });
      });
    });
  });
});

app.post('/api/admin/feedbacks/batch-delete', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM feedbacks WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});
app.post('/api/visitors/batch-delete', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const sql = `DELETE FROM visitors WHERE id IN (${placeholders})`;

  db.run(sql, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/visitors/trend', requireAuth, (req, res) => {
  const days = Number(req.query.days || 30);
  // offset：把窗口整体往回推 N 天，用来跟「上一个周期」做不重叠的对比
  const offset = Math.max(0, Number(req.query.offset || 0));
  const granularity = String(req.query.granularity || 'day');

  // 小时粒度：给「最近24小时 / 今天」这类短窗口用，按小时分桶
  // （时间戳按 UTC 存，这里换算成北京时间再分桶，标签对管理员更直观）
  if (granularity === 'hour') {
    const todayOnly = String(req.query.scope || '') === 'today';
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    // 用递归 CTE 先铺满整条时间轴（今天 = 00:00~23:00 共 24 格；滚动窗口 = 最近 N 格），
    // 再左连接实际数据、缺失的桶补 0 —— 否则没数据的时段直接不画点，图表只有一两个点
    const windowStart = todayOnly
      ? "datetime('now', '+8 hours', 'start of day')"
      : "datetime('now', '+8 hours', '-' || ? || ' hours')";
    // 注意：SQLite 的 'start of' 修饰符只支持 month/year/day，没有 'start of hour'，
    // 这里直接用 strftime('%H:00') 截断到整点
    const bucketsFrom = todayOnly
      ? "strftime('%Y-%m-%d %H:00', datetime('now', '+8 hours', 'start of day'))"
      : "strftime('%Y-%m-%d %H:00', 'now', '+8 hours', '-' || ? || ' hours')";
    const bucketsUntil = todayOnly
      ? "strftime('%Y-%m-%d %H:00', datetime('now', '+8 hours', 'start of day', '+23 hours'))"
      : "strftime('%Y-%m-%d %H:00', 'now', '+8 hours')";

    const sql = `
      WITH RECURSIVE buckets(h) AS (
        SELECT ${bucketsFrom}
        UNION ALL
        SELECT strftime('%Y-%m-%d %H:00', datetime(h, '+1 hour'))
        FROM buckets
        WHERE h < ${bucketsUntil}
      ),
      agg AS (
        SELECT
          strftime('%Y-%m-%d %H:00', datetime(timestamp, '+8 hours')) as bucket,
          COUNT(*) as count,
          COUNT(DISTINCT ip) as unique_ip
        FROM visitors
        WHERE datetime(timestamp, '+8 hours') >= ${windowStart}
        GROUP BY bucket
      )
      SELECT b.h as date, COALESCE(a.count, 0) as count, COALESCE(a.unique_ip, 0) as unique_ip
      FROM buckets b
      LEFT JOIN agg a ON a.bucket = b.h
      ORDER BY b.h ASC
    `;
    const params = todayOnly ? [] : [hours, hours];
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
    return;
  }

  const whereClause = offset
    ? "timestamp >= date('now', '-' || ? || ' days') AND timestamp < date('now', '-' || ? || ' days')"
    : "timestamp >= date('now', '-' || ? || ' days')";
  const sql = `
    SELECT
      strftime('%Y-%m-%d', timestamp) as date,
      COUNT(*) as count,
      COUNT(DISTINCT ip) as unique_ip
    FROM visitors
    WHERE ${whereClause}
    GROUP BY date
    ORDER BY date ASC
  `;

  db.all(sql, offset ? [days + offset, offset] : [days], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Export Visitor Logs
app.get('/api/visitors/export', requireAuth, (req, res) => {
  db.all(`SELECT * FROM visitors ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).send('Database Error');
    
    // Convert to CSV
    const header = ['ID', 'IP', 'Location', 'Device', 'Path', 'Time'];
    const csvRows = rows.map(r => {
      // Escape quotes and handle commas
      const esc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      return [r.id, r.ip, r.location, r.device, r.path, r.timestamp].map(esc).join(',');
    });
    
    const csvContent = '\uFEFF' + [header.join(','), ...csvRows].join('\n'); // Add BOM for Excel
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="visitors-${Date.now()}.csv"`);
    res.send(csvContent);
  });
});

// Friend Links CRUD with pagination and batch
app.get('/api/friend-links', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const offset = (page - 1) * pageSize;
  db.all(
    `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
    (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) AS total FROM friend_links`, [], (e2, count) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: count.total, page, pageSize });
    });
  });
});
app.post('/api/friend-links', requireAuth, (req, res) => {
  const { name, url, weight = 0, enabled = 1, icon_url } = req.body;
  db.run(`INSERT INTO friend_links (name, url, weight, enabled) VALUES (?,?,?,?)`, [name, url, weight, enabled], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const linkId = this.lastID;
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'create', 'friend_links', linkId, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ id: linkId });
    };

    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [linkId, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      afterIcon();
    }
  });
});
app.put('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, weight, enabled, icon_url } = req.body;
  db.run(`UPDATE friend_links SET name=?, url=?, weight=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [name, url, weight, enabled, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'update', 'friend_links', id, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    };

    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [id, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => afterIcon());
    }
  });
});
app.delete('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => {
    db.run(`DELETE FROM friend_links WHERE id=?`, [id], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'delete', 'friend_links', id);
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ deleted: this.changes });
    });
  });
});
app.post('/api/friend-links/batch', requireAuth, (req, res) => {
  const { ids = [], action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ changed: 0 });
  const placeholders = ids.map(()=>'?').join(',');
  if (action === 'delete') {
    db.run(`DELETE FROM friend_links WHERE id IN (${placeholders})`, ids, function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_delete', 'friend_links', null, { ids });
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id IN (${placeholders})`, ids, () => {
        db.all(
          `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
          [],
          (e2, rows) => {
            if (!e2) broadcast('links:update', rows);
          }
        );
        res.json({ changed: this.changes });
      });
    });
  } else if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable' ? 1 : 0;
    db.run(`UPDATE friend_links SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [enabled, ...ids], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_enable', 'friend_links', null, { ids, enabled });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    });
  } else {
    res.status(400).json({ error: 'Unknown action' });
  }
});

// Public friend links for homepage
app.get('/api/public/friend-links', (req, res) => {
  db.all(`SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id WHERE fl.enabled=1 ORDER BY fl.weight DESC, fl.id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Group Chats CRUD
app.get('/api/group-chats', requireAuth, (req, res) => {
  db.all(`SELECT * FROM group_chats ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/group-chats', requireAuth, (req, res) => {
  const { name, link, avatar_url, enabled = 1 } = req.body;
  db.run(`INSERT INTO group_chats (name, link, avatar_url, enabled) VALUES (?,?,?,?)`, [name, link || null, avatar_url || null, Number(enabled) ? 1 : 0], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'group_chats', this.lastID, { name, link, avatar_url, enabled: Number(enabled) ? 1 : 0 });
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ id: this.lastID });
  });
});
app.put('/api/group-chats/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, link, avatar_url, enabled } = req.body || {};

  const sets = [];
  const params = [];
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof link !== 'undefined') { sets.push('link=?'); params.push(link || null); }
  if (typeof avatar_url !== 'undefined') { sets.push('avatar_url=?'); params.push(avatar_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP');

  db.run(`UPDATE group_chats SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'group_chats', id, { name, link, avatar_url, enabled });
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/group-chats/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM group_chats WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'group_chats', id);
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// Public group chats
app.get('/api/public/group-chats', (req, res) => {
  db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Incidents CRUD
app.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)`,
    [title, content, status, type, start_time, end_time],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'incidents', id, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id });
    }
  );
});

app.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time, end_time, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title, status });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/public/incidents/active', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' 
     OR (type = 'maintenance' AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [now], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// Apps CRUD
app.get('/api/apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// --- Comment System ---

// Get comments for a blog post (public)
app.get('/api/public/comments', (req, res) => {
  const { blog_id, page = 1, pageSize = 20, include_ids } = req.query;
  if (!blog_id) return res.status(400).json({ error: 'Missing blog_id' });

  const limit = Number(pageSize);
  const offset = (Number(page) - 1) * limit;

  // Process include_ids (ids of comments that should be visible even if not approved)
  let extraIds = [];
  if (include_ids) {
    if (Array.isArray(include_ids)) {
      extraIds = include_ids.map(Number).filter(n => !isNaN(n));
    } else if (typeof include_ids === 'string') {
      extraIds = include_ids.split(',').map(Number).filter(n => !isNaN(n));
    }
  }

  // Build query
  let whereSql = "blog_id = ? AND (status = 'approved'";
  let params = [blog_id];

  if (extraIds.length > 0) {
    const placeholders = extraIds.map(() => '?').join(',');
    whereSql += ` OR id IN (${placeholders})`;
    params.push(...extraIds);
  }
  whereSql += ")";

  const sql = `SELECT * FROM comments WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) as total FROM comments WHERE ${whereSql}`;

  db.all(
    sql,
    [...params, limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(countSql, params, (e2, count) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ items: rows, total: count.total, page: Number(page), pageSize: limit });
      });
    }
  );
});

// Post a new comment (public)
app.post('/api/public/comments', (req, res) => {
  const { blog_id, parent_id, nickname, email, content } = req.body;
  if (!blog_id || !nickname || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Basic validation
  if (content.length > 1000) return res.status(400).json({ error: 'Content too long' });

  // Default status: pending for moderation
  const status = 'pending'; 
  
  db.run(
    `INSERT INTO comments (blog_id, parent_id, nickname, email, content, status, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [blog_id, parent_id || null, nickname, email || null, content, status, req.ip, req.get('User-Agent')],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status });
    }
  );
});

// Get all comments for admin (with filtering)
app.get('/api/admin/comments', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;
  const status = req.query.status;
  const blogId = req.query.blog_id;

  let whereClause = '1=1';
  const params = [];

  if (status && status !== 'all') {
    whereClause += ' AND c.status = ?';
    params.push(status);
  }
  if (blogId) {
    whereClause += ' AND c.blog_id = ?';
    params.push(blogId);
  }

  const countSql = `SELECT COUNT(*) as total FROM comments c WHERE ${whereClause}`;
  db.get(countSql, params, (err, countResult) => {
    if (err) return res.status(500).json({ error: err.message });

    const sql = `
      SELECT c.*, b.title as blog_title 
      FROM comments c 
      LEFT JOIN blogs b ON c.blog_id = b.id 
      WHERE ${whereClause} 
      ORDER BY c.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    db.all(sql, [...params, pageSize, offset], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ items: rows, total: countResult?.total || 0, page, pageSize });
    });
  });
});

// Update comment (status, content, etc.)
app.put('/api/admin/comments/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { status, content, nickname, email } = req.body || {};

  const updates = [];
  const params = [];

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);
  }
  if (nickname !== undefined) {
    updates.push('nickname = ?');
    params.push(nickname);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    params.push(email);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  db.run(`UPDATE comments SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'comments', id, { status, content });
    res.json({ success: true });
  });
});

// Delete comment(s)
app.delete('/api/admin/comments/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  db.run('DELETE FROM comments WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'comments', id, {});
    res.json({ success: true, deleted: 1 });
  });
});

// Batch delete comments
app.post('/api/admin/comments/batch-delete', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM comments WHERE id IN (${placeholders})`, ids, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'batch-delete', 'comments', 0, { count: ids.length });
    res.json({ success: true, deleted: ids.length });
  });
});

// Batch update comment status
app.post('/api/admin/comments/batch-status', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }
  if (!status) {
    return res.status(400).json({ error: 'No status provided' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [status, ...ids], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'batch-status', 'comments', 0, { count: ids.length, status });
    res.json({ success: true, updated: ids.length });
  });
});

// Get blogs list for filtering
app.get('/api/admin/comments/blogs', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.all('SELECT id, title FROM blogs ORDER BY id DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.get('/api/apps/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const idsRaw = String(req.query.ids || '').trim();
  const limit = Number(req.query.limit || 20);

  if (idsRaw) {
    const ids = idsRaw.split(',').map(v => Number(v)).filter(v => !Number.isNaN(v));
    if (!ids.length) return res.json({ items: [] });
    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT * FROM apps WHERE id IN (${placeholders}) ORDER BY id DESC`, ids, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    });
    return;
  }

  if (!q) return res.json({ items: [] });
  const like = `%${q}%`;
  db.all(
    `SELECT * FROM apps WHERE name LIKE ? OR provider LIKE ? ORDER BY id DESC LIMIT ?`,
    [like, like, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});
app.post('/api/apps', requireAuth, (req, res) => {
  const { name, provider, bg_url, icon_url, download_url, enabled = 1, kind_name, average_rating, download_count_str, original_id } = req.body;
  
  const insertApp = () => {
    db.run(
      `INSERT INTO apps (name, provider, bg_url, icon_url, download_url, enabled, kind_name, average_rating, download_count_str, original_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, provider || null, bg_url || null, icon_url || null, download_url || null, Number(enabled) ? 1 : 0, kind_name || null, average_rating || null, download_count_str || null, original_id || null],
      function(err){
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user?.username, 'create', 'apps', this.lastID, { name });
        db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
          if (!e2) broadcast('apps:update', rows);
        });
        res.json({ id: this.lastID });
      }
    );
  };

  if (original_id) {
    db.get(`SELECT id FROM apps WHERE original_id = ?`, [original_id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) {
        // Already exists, return existing ID
        res.json({ id: row.id, existed: true });
      } else {
        insertApp();
      }
    });
  } else {
    insertApp();
  }
});
app.put('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, provider, bg_url, icon_url, download_url, enabled, kind_name, average_rating, download_count_str, original_id } = req.body || {};

  const sets = [];
  const params = [];
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof provider !== 'undefined') { sets.push('provider=?'); params.push(provider || null); }
  if (typeof bg_url !== 'undefined') { sets.push('bg_url=?'); params.push(bg_url || null); }
  if (typeof icon_url !== 'undefined') { sets.push('icon_url=?'); params.push(icon_url || null); }
  if (typeof download_url !== 'undefined') { sets.push('download_url=?'); params.push(download_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }
  if (typeof kind_name !== 'undefined') { sets.push('kind_name=?'); params.push(kind_name || null); }
  if (typeof average_rating !== 'undefined') { sets.push('average_rating=?'); params.push(average_rating || null); }
  if (typeof download_count_str !== 'undefined') { sets.push('download_count_str=?'); params.push(download_count_str || null); }
  if (typeof original_id !== 'undefined') { sets.push('original_id=?'); params.push(original_id || null); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP');

  db.run(`UPDATE apps SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'apps', id, { name, provider, bg_url, icon_url, download_url, enabled });
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apps WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'apps', id);
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});
app.get('/api/public/apps', (req, res) => {
  db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Public announcements
app.get('/api/public/announcements', (req, res) => {
  const limit = Number(req.query.limit || 20); // Increased limit to ensure we get varied categories
  db.all(
    `SELECT a.id, a.title, a.content_html, a.published_at, a.updated_at, a.category_id, c.name as category_name 
     FROM announcements a 
     LEFT JOIN announcement_categories c ON a.category_id = c.id 
     WHERE a.status='published' 
     ORDER BY a.published_at DESC, a.updated_at DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/public/blog-categories', (req, res) => {
  db.all(`SELECT * FROM blog_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.get('/api/public/blog-tags', (req, res) => {
  db.all(
    `SELECT t.*, COALESCE(cnt.usage_count, 0) as usage_count
     FROM blog_tags t
     LEFT JOIN (
       SELECT tag_id, COUNT(*) as usage_count
       FROM blog_tag_relations
       GROUP BY tag_id
     ) cnt ON t.id = cnt.tag_id
     ORDER BY usage_count DESC, t.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/public/blogs', (req, res) => {
  const limit = Number(req.query.limit || 20);
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const tagId = req.query.tag_id ? Number(req.query.tag_id) : null;
  const params = [];
  let where = `WHERE b.status='published'`;
  if (categoryId) {
    where += ' AND b.category_id=?';
    params.push(categoryId);
  }
  if (tagId) {
    where += ' AND b.id IN (SELECT blog_id FROM blog_tag_relations WHERE tag_id=?)';
    params.push(tagId);
  }
  params.push(limit);
  db.all(
    `SELECT b.*, c.name as category_name,
      (SELECT group_concat(t.id, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_ids,
      (SELECT group_concat(t.name, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_names,
      (SELECT group_concat(t.color, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_colors,
      (SELECT group_concat(a.id, ',') FROM blog_app_relations ar JOIN apps a ON ar.app_id = a.id WHERE ar.blog_id = b.id AND a.enabled = 1) as app_ids,
      CASE WHEN b.password IS NOT NULL AND b.password != '' THEN 1 ELSE 0 END as has_password
     FROM blogs b
     LEFT JOIN blog_categories c ON b.category_id = c.id
     ${where}
     ORDER BY b.published_at DESC, b.updated_at DESC
     LIMIT ?`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/public/blogs/:slug', (req, res) => {
  const { slug } = req.params;
  const password = req.query.password ? String(req.query.password) : '';
  db.get(
    `SELECT b.*, c.name as category_name,
      (SELECT group_concat(t.id, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_ids,
      (SELECT group_concat(t.name, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_names,
      (SELECT group_concat(t.color, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_colors,
      (SELECT group_concat(a.id, ',') FROM blog_app_relations ar JOIN apps a ON ar.app_id = a.id WHERE ar.blog_id = b.id AND a.enabled = 1) as app_ids,
      CASE WHEN b.password IS NOT NULL AND b.password != '' THEN 1 ELSE 0 END as has_password
     FROM blogs b
     LEFT JOIN blog_categories c ON b.category_id = c.id
     WHERE b.slug=? AND b.status='published'`,
    [slug],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.password && row.password !== password) {
        return res.status(403).json({ error: 'password_required' });
      }

      // Increment view count
      db.run(`UPDATE blogs SET views = views + 1 WHERE id = ?`, [row.id]);

      // Fetch related apps from standalone table
      db.all(
        `SELECT * FROM blog_related_apps WHERE blog_id = ? ORDER BY id DESC`,
        [row.id],
        (e2, apps) => {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ ...row, apps });
        }
      );
    }
  );
});

// Announcements & Categories
app.get('/api/announcement-categories', requireAuth, (req, res) => {
  db.all(`SELECT * FROM announcement_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/announcement-categories', requireAuth, (req, res) => {
  const { name, parent_id } = req.body;
  db.run(`INSERT INTO announcement_categories (name, parent_id) VALUES (?,?)`, [name, parent_id || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
app.put('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body;
  db.run(`UPDATE announcement_categories SET name=?, parent_id=? WHERE id=?`, [name, parent_id || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcement_categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/announcements', requireAuth, (req, res) => {
  const { status, page = 1, pageSize = 10 } = req.query;
  const p = Number(page), ps = Number(pageSize);
  const offset = (p - 1) * ps;
  const where = status ? `WHERE status=?` : '';
  const params = status ? [status, ps, offset] : [ps, offset];
  db.all(`SELECT * FROM announcements ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const countParams = status ? [status] : [];
    db.get(`SELECT COUNT(*) AS total FROM announcements ${where}`, countParams, (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page: p, pageSize: ps });
    });
  });
});
app.post('/api/announcements', requireAuth, (req, res) => {
  const { title, content_html, content_markdown, status = 'draft', category_id, scheduled_at } = req.body;
  db.run(`INSERT INTO announcements (title, content_html, content_markdown, status, category_id, scheduled_at) VALUES (?,?,?,?,?,?)`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'announcements', this.lastID, { title });
    res.json({ id: this.lastID });
  });
});
app.put('/api/announcements/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content_html, content_markdown, status, category_id, scheduled_at } = req.body;
  db.run(`UPDATE announcements SET title=?, content_html=?, content_markdown=?, status=?, category_id=?, scheduled_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'announcements', id, { title });
    res.json({ changed: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});
app.delete('/api/announcements/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcements WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'announcements', id);
    res.json({ deleted: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});
app.post('/api/announcements/:id/publish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE announcements SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'publish', 'announcements', id);
    res.json({ changed: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});
app.post('/api/announcements/:id/offline', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE announcements SET status='offline', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'offline', 'announcements', id);
    res.json({ changed: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});

app.get('/api/blog-categories', requireAuth, (req, res) => {
  db.all(`SELECT * FROM blog_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/blog-categories', requireAuth, (req, res) => {
  const { name, parent_id } = req.body;
  db.run(`INSERT INTO blog_categories (name, parent_id) VALUES (?,?)`, [name, parent_id || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
app.put('/api/blog-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body;
  db.run(`UPDATE blog_categories SET name=?, parent_id=? WHERE id=?`, [name, parent_id || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/blog-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM blog_categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/blog-tags', requireAuth, (req, res) => {
  db.all(
    `SELECT t.*, COALESCE(cnt.usage_count, 0) as usage_count
     FROM blog_tags t
     LEFT JOIN (
       SELECT tag_id, COUNT(*) as usage_count
       FROM blog_tag_relations
       GROUP BY tag_id
     ) cnt ON t.id = cnt.tag_id
     ORDER BY t.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});
app.post('/api/blog-tags', requireAuth, (req, res) => {
  const { name, color, group_name } = req.body;
  db.run(`INSERT INTO blog_tags (name, color, group_name) VALUES (?,?,?)`, [name, color || null, group_name || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
app.put('/api/blog-tags/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, color, group_name } = req.body;
  db.run(`UPDATE blog_tags SET name=?, color=?, group_name=? WHERE id=?`, [name, color || null, group_name || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/blog-tags/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM blog_tags WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/blogs', requireAuth, (req, res) => {
  const { status, page = 1, pageSize = 10, category_id, tag_id } = req.query;
  const p = Number(page), ps = Number(pageSize);
  const offset = (p - 1) * ps;
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('b.status=?');
    params.push(status);
  }
  if (category_id) {
    conditions.push('b.category_id=?');
    params.push(Number(category_id));
  }
  if (tag_id) {
    conditions.push('b.id IN (SELECT blog_id FROM blog_tag_relations WHERE tag_id=?)');
    params.push(Number(tag_id));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  db.all(
    `SELECT b.*, c.name as category_name,
      (SELECT group_concat(t.id, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_ids,
      (SELECT group_concat(t.name, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_names,
      (SELECT group_concat(t.color, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_colors,
      (SELECT group_concat(a.id, ',') FROM blog_app_relations ar JOIN apps a ON ar.app_id = a.id WHERE ar.blog_id = b.id) as app_ids
     FROM blogs b
     LEFT JOIN blog_categories c ON b.category_id = c.id
     ${where}
     ORDER BY b.updated_at DESC
     LIMIT ? OFFSET ?`,
    [...params, ps, offset],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Fetch related apps from standalone table for each blog
      const enrichBlogs = async () => {
        const enrichedRows = [];
        for (const row of rows) {
          const apps = await new Promise((resolve) => {
            db.all(`SELECT * FROM blog_related_apps WHERE blog_id = ? ORDER BY id DESC`, [row.id], (e, r) => {
              resolve(e ? [] : r);
            });
          });
          enrichedRows.push({ ...row, apps });
        }
        return enrichedRows;
      };

      const items = await enrichBlogs();
      
      db.get(`SELECT COUNT(*) AS total FROM blogs b ${where}`, params, (e2, c) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ items, total: c.total, page: p, pageSize: ps });
      });
    }
  );
});

app.post('/api/blogs', requireAuth, (req, res) => {
  const { title, slug, content_html, content_markdown, summary, cover_url, cover_focus, author_names, status = 'draft', category_id, seo_title, seo_description, seo_keywords, password, allow_comments = 1, scheduled_at, tag_ids = [], related_apps = [] } = req.body;
  db.run(
    `INSERT INTO blogs (title, slug, content_html, content_markdown, summary, cover_url, cover_focus, author_names, status, category_id, seo_title, seo_description, seo_keywords, password, allow_comments, scheduled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title, slug, content_html || '', content_markdown || null, summary || null, cover_url || null, cover_focus || null, author_names || null, status, category_id || null, seo_title || null, seo_description || null, seo_keywords || null, password || null, Number(allow_comments) ? 1 : 0, scheduled_at || null],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      const blogId = this.lastID;
      const tagIds = Array.isArray(tag_ids) ? tag_ids : [];
      tagIds.forEach((tid) => {
        db.run(`INSERT OR IGNORE INTO blog_tag_relations (blog_id, tag_id) VALUES (?,?)`, [blogId, tid]);
      });
      // Handle related apps (standalone table)
      const apps = Array.isArray(related_apps) ? related_apps : [];
      apps.forEach((app) => {
        db.run(
          `INSERT INTO blog_related_apps (blog_id, name, icon_url, developer_name, kind_name, average_rating, download_count_str, original_id) VALUES (?,?,?,?,?,?,?,?)`,
          [blogId, app.name, app.icon_url || null, app.developer_name || null, app.kind_name || null, app.average_rating || null, app.download_count_str || null, app.original_id || null]
        );
      });
      logAction(req.user?.username, 'create', 'blogs', blogId, { title });
      res.json({ id: blogId });
    }
  );
});

app.put('/api/blogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, slug, content_html, content_markdown, summary, cover_url, cover_focus, author_names, status, category_id, seo_title, seo_description, seo_keywords, password, allow_comments = 1, scheduled_at, tag_ids = [], related_apps = [] } = req.body;
  db.run(
    `UPDATE blogs SET title=?, slug=?, content_html=?, content_markdown=?, summary=?, cover_url=?, cover_focus=?, author_names=?, status=?, category_id=?, seo_title=?, seo_description=?, seo_keywords=?, password=?, allow_comments=?, scheduled_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [title, slug, content_html || '', content_markdown || null, summary || null, cover_url || null, cover_focus || null, author_names || null, status, category_id || null, seo_title || null, seo_description || null, seo_keywords || null, password || null, Number(allow_comments) ? 1 : 0, scheduled_at || null, id],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      db.run(`DELETE FROM blog_tag_relations WHERE blog_id=?`, [id], () => {
        const tagIds = Array.isArray(tag_ids) ? tag_ids : [];
        tagIds.forEach((tid) => {
          db.run(`INSERT OR IGNORE INTO blog_tag_relations (blog_id, tag_id) VALUES (?,?)`, [id, tid]);
        });
      });
      // Update related apps: delete old ones and insert new ones
      db.run(`DELETE FROM blog_related_apps WHERE blog_id=?`, [id], () => {
        const apps = Array.isArray(related_apps) ? related_apps : [];
        apps.forEach((app) => {
          db.run(
            `INSERT INTO blog_related_apps (blog_id, name, icon_url, developer_name, kind_name, average_rating, download_count_str, original_id) VALUES (?,?,?,?,?,?,?,?)`,
            [id, app.name, app.icon_url || null, app.developer_name || null, app.kind_name || null, app.average_rating || null, app.download_count_str || null, app.original_id || null]
          );
        });
      });
      logAction(req.user?.username, 'update', 'blogs', id, { title });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/blogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM blogs WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM blog_tag_relations WHERE blog_id=?`, [id]);
    db.run(`DELETE FROM blog_related_apps WHERE blog_id=?`, [id]);
    logAction(req.user?.username, 'delete', 'blogs', id);
    res.json({ deleted: this.changes });
  });
});

app.post('/api/blogs/:id/publish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE blogs SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'publish', 'blogs', id);
    res.json({ changed: this.changes });
  });
});

app.post('/api/blogs/:id/offline', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE blogs SET status='offline', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'offline', 'blogs', id);
    res.json({ changed: this.changes });
  });
});

app.get('/api/blogs/:id/versions', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.all(`SELECT * FROM blog_versions WHERE blog_id=? ORDER BY created_at DESC`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/blogs/:id/versions', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content_html, content_markdown, summary, cover_url, author_names, status, seo_title, seo_description, seo_keywords } = req.body;
  db.run(
    `INSERT INTO blog_versions (blog_id, title, content_html, content_markdown, summary, cover_url, author_names, status, seo_title, seo_description, seo_keywords) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, title || null, content_html || null, content_markdown || null, summary || null, cover_url || null, author_names || null, status || null, seo_title || null, seo_description || null, seo_keywords || null],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.post('/api/blogs/:id/restore', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { version_id } = req.body;
  db.get(`SELECT * FROM blog_versions WHERE id=? AND blog_id=?`, [version_id, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Version not found' });
    db.run(
      `UPDATE blogs SET title=?, content_html=?, content_markdown=?, summary=?, cover_url=?, author_names=?, status=?, seo_title=?, seo_description=?, seo_keywords=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [row.title, row.content_html, row.content_markdown, row.summary, row.cover_url, row.author_names, row.status, row.seo_title, row.seo_description, row.seo_keywords, id],
      function(e2){
        if (e2) return res.status(500).json({ error: e2.message });
        logAction(req.user?.username, 'restore', 'blogs', id, { version_id });
        res.json({ changed: this.changes });
      }
    );
  });
});

// Changelogs
app.get('/api/public/changelogs', (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.get('/api/changelogs', requireAuth, (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/changelogs', requireAuth, (req, res) => {
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `INSERT INTO changelogs (version, content_html, content_markdown, release_date) VALUES (?,?,?,?)`,
    [version, content_html, content_markdown, release_date || new Date().toISOString()],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'changelogs', this.lastID, { version });
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `UPDATE changelogs SET version=?, content_html=?, content_markdown=?, release_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [version, content_html, content_markdown, release_date, id],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'changelogs', id, { version });
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM changelogs WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'changelogs', id);
    db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('changelogs:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

const getClientIp = (req) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  let cleanIp = ip.toString().split(',')[0].trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  } else if (cleanIp === '::1') {
    cleanIp = '127.0.0.1';
  }
  return cleanIp;
};

const normalizeSubmission = (body) => {
  const toText = (v) => String(v ?? '').trim();
  const name = toText(body?.name);
  const provider = toText(body?.provider);
  const bg_url = toText(body?.bg_url);
  const icon_url = toText(body?.icon_url);
  const download_url = toText(body?.download_url);
  return { name, provider, bg_url, icon_url, download_url };
};

const normalizeFeedback = (body) => {
  const toText = (v) => String(v ?? '').trim();
  const type = toText(body?.type);
  const title = toText(body?.title);
  const description = toText(body?.description);
  const device_type = toText(body?.device_type);
  const os = toText(body?.os);
  const browser = toText(body?.browser);
  const network = toText(body?.network);
  const page_url = toText(body?.page_url);
  const user_role = toText(body?.user_role);
  const email = toText(body?.email);
  return { type, title, description, device_type, os, browser, network, page_url, user_role, email };
};

const validateSubmission = (payload) => {
  if (!payload.name) return '应用名称不能为空';
  if (!payload.provider) return '应用提供者不能为空';
  if (!payload.bg_url) return '背景URL不能为空';
  if (!payload.icon_url) return '图标URL不能为空';
  if (!payload.download_url) return '下载链接不能为空';
  return '';
};

app.post('/api/submissions', (req, res) => {
  const payload = normalizeSubmission(req.body || {});
  const error = validateSubmission(payload);
  if (error) return res.status(400).json({ error });
  const user_ip = getClientIp(req);
  let user_id = null;
  let actor = user_ip || 'guest';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const data = jwt.verify(token, JWT_SECRET);
      user_id = data?.uid || null;
      if (data?.username) actor = data.username;
    } catch {}
  }
  const params = [];
  let whereSql = '';
  if (user_id) {
    whereSql = '(user_id = ? OR user_ip = ?)';
    params.push(user_id, user_ip);
  } else {
    whereSql = 'user_ip = ?';
    params.push(user_ip);
  }
  db.get(
    `SELECT COUNT(*) as count FROM app_submissions WHERE ${whereSql} AND created_at > datetime('now', '-10 minutes')`,
    params,
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.count >= 5) return res.status(429).json({ error: '提交过于频繁，10分钟内最多允许提交5次' });
      
      db.get(`SELECT id FROM apps WHERE name = ?`, [payload.name], (e_dup1, row_dup1) => {
        if (e_dup1) return res.status(500).json({ error: e_dup1.message });
        if (row_dup1) return res.status(400).json({ error: '该应用已收录，请勿重复提交' });

        db.get(`SELECT id FROM app_submissions WHERE name = ? AND status = 'pending'`, [payload.name], (e_dup2, row_dup2) => {
          if (e_dup2) return res.status(500).json({ error: e_dup2.message });
          if (row_dup2) return res.status(400).json({ error: '该应用已在审核中，请勿重复提交' });

          db.run(
            `INSERT INTO app_submissions (name, provider, bg_url, icon_url, download_url, type, status, user_id, user_ip) VALUES (?,?,?,?,?,?,?,?,?)`,
            [payload.name, payload.provider, payload.bg_url, payload.icon_url, payload.download_url, 'sideload', 'pending', user_id, user_ip],
            function(e2) {
              if (e2) return res.status(500).json({ error: e2.message });
              logAction(actor, 'submit', 'app_submissions', this.lastID, { name: payload.name });
              db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e3, rows) => {
                if (!e3) broadcast('submissions:update', rows);
              });
              res.json({ id: this.lastID });
            }
          );
        });
      });
    }
  );
});

app.post('/api/feedback', async (req, res) => {
  const payload = normalizeFeedback(req.body || {});
  if (!payload.type) return res.status(400).json({ error: '反馈类型不能为空' });
  if (!payload.title) return res.status(400).json({ error: '标题不能为空' });
  if (!payload.description) return res.status(400).json({ error: '详细描述不能为空' });

  const email = payload.email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  const ip = getClientIp(req);
  let actor = ip || 'guest';
  let role = 'guest';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const data = jwt.verify(token, JWT_SECRET);
      if (data?.username) actor = data.username;
      if (data?.role) role = String(data.role);
    } catch {}
  }

  const ua = String(req.headers['user-agent'] || '').trim();
  let limit = 0;
  // Prefer DB env_vars for dynamic configuration
  try {
    const key = 'FEEDBACK_RATE_LIMIT_PER_MINUTE';
    await new Promise((resolve) => {
      db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (e1, row) => {
        if (!e1 && row && row.value_encrypted) {
          const plain = decrypt(row.value_encrypted);
          const n = Number(plain);
          if (Number.isFinite(n)) limit = n;
        }
        resolve();
      });
    });
  } catch {}
  if (!limit) {
    const envFile = readEnvFile();
    limit = Number(envFile.FEEDBACK_RATE_LIMIT_PER_MINUTE || process.env.FEEDBACK_RATE_LIMIT_PER_MINUTE || 0) || 0;
  }
  const runInsert = () => {
    db.run(
      `INSERT INTO feedbacks (type, title, description, device_type, os, browser, network, page_url, user_role, email, ip, user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [payload.type, payload.title, payload.description, payload.device_type || null, payload.os || null, payload.browser || null, payload.network || null, payload.page_url || null, payload.user_role || role, email || null, ip, ua],
      function(e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        logAction(actor, 'submit', 'feedbacks', this.lastID, { type: payload.type, title: payload.title });
        const seed = `${this.lastID}-${Date.now()}-${ip}-${ua}`;
        const hash = crypto.createHash('sha256').update(seed).digest('hex');
        db.run(`UPDATE feedbacks SET hash = ? WHERE id = ?`, [hash, this.lastID], function(e3) {
          if (e3) return res.status(500).json({ error: e3.message });
          res.json({ id: this.lastID, hash });
        });
      }
    );
  };
  if (limit > 0) {
    db.get(
      `SELECT COUNT(*) AS count FROM feedbacks WHERE ip = ? AND created_at > datetime('now', '-1 minute')`,
      [ip],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && Number(row.count || 0) >= limit) {
          return res.status(429).json({ error: `提交过于频繁，每分钟最多允许提交${limit}次` });
        }
        runInsert();
      }
    );
  } else {
    runInsert();
  }
});

app.get('/api/admin/feedbacks', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;

  db.get(`SELECT COUNT(*) AS total FROM feedbacks`, [], (e1, agg) => {
    if (e1) return res.status(500).json({ error: e1.message });
    db.all(
      `SELECT id, type, title, description, device_type, os, browser, network, page_url, user_role, email, ip, user_agent, hash, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at FROM feedbacks ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [pageSize, offset],
      (e2, rows) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ items: rows, total: agg?.total || 0, page, pageSize });
      }
    );
  });
});

app.put('/api/admin/feedbacks/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { status, title, description } = req.body || {};
  
  const updates = [];
  const params = [];
  
  if (status) {
    const allowed = new Set(['pending', 'accepted', 'rejected', 'completed']);
    const normalizedStatus = typeof status === 'string' ? status.trim() : '';
    if (!allowed.has(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    updates.push('status=?');
    params.push(normalizedStatus);
  }
  
  if (title !== undefined) {
    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) return res.status(400).json({ error: '标题不能为空' });
    updates.push('title=?');
    params.push(normalizedTitle);
  }
  
  if (description !== undefined) {
    const normalizedDesc = String(description || '').trim();
    if (!normalizedDesc) return res.status(400).json({ error: '详情不能为空' });
    updates.push('description=?');
    params.push(normalizedDesc);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }
  
  params.push(id);
  
  db.get(`SELECT id FROM feedbacks WHERE id=?`, [id], (e1, row) => {
    if (e1) return res.status(500).json({ error: e1.message });
    if (!row) return res.status(404).json({ error: '反馈不存在' });
    
    db.run(`UPDATE feedbacks SET ${updates.join(', ')} WHERE id=?`, params, function(e2) {
      if (e2) return res.status(500).json({ error: e2.message });
      logAction(req.user?.username, 'update', 'feedbacks', id, { status, title_updated: !!title, desc_updated: !!description });
      res.json({ changed: this.changes });
    });
  });
});

app.get('/api/public/feedback/:hash', (req, res) => {
  const hash = String(req.params.hash || '').trim();
  if (!hash) return res.status(400).json({ error: '缺少哈希值' });
  db.get(
    `SELECT id, type, title, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at FROM feedbacks WHERE hash = ?`,
    [hash],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: '未找到反馈' });
      res.json(row);
    }
  );
});

app.get('/api/public/feedbacks/success', (req, res) => {
  const limit = Number(req.query.limit || 10);
  const status = req.query.status;
  
  let whereClause = "status IN ('accepted','completed')";
  const params = [];
  
  if (status && (status === 'accepted' || status === 'completed')) {
    whereClause = "status = ?";
    params.push(status);
  }
  
  params.push(limit);

  db.all(
    `SELECT id, type, title, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at 
     FROM feedbacks 
     WHERE ${whereClause} 
     ORDER BY created_at DESC 
     LIMIT ?`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/submissions', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const status = String(req.query.status || '').trim();
  const params = [];
  let whereSql = '';
  if (status) {
    whereSql = 'WHERE status = ?';
    params.push(status);
  }
  db.all(`SELECT * FROM app_submissions ${whereSql} ORDER BY created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.put('/api/submissions/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { name, provider, bg_url, icon_url, download_url } = req.body || {};
  db.get(`SELECT * FROM app_submissions WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '投稿已处理' });

    const toText = (v) => (typeof v === 'string' ? v.trim() : v);
    const normalized = {
      name: toText(name),
      provider: toText(provider),
      bg_url: toText(bg_url),
      icon_url: toText(icon_url),
      download_url: toText(download_url),
    };
    if (typeof normalized.name !== 'undefined' && !normalized.name) return res.status(400).json({ error: '应用名称不能为空' });
    if (typeof normalized.provider !== 'undefined' && !normalized.provider) return res.status(400).json({ error: '应用提供者不能为空' });
    if (typeof normalized.bg_url !== 'undefined' && !normalized.bg_url) return res.status(400).json({ error: '背景URL不能为空' });
    if (typeof normalized.icon_url !== 'undefined' && !normalized.icon_url) return res.status(400).json({ error: '图标URL不能为空' });
    if (typeof normalized.download_url !== 'undefined' && !normalized.download_url) return res.status(400).json({ error: '下载链接不能为空' });

    const sets = [];
    const params = [];
    if (typeof normalized.name !== 'undefined') { sets.push('name=?'); params.push(normalized.name); }
    if (typeof normalized.provider !== 'undefined') { sets.push('provider=?'); params.push(normalized.provider); }
    if (typeof normalized.bg_url !== 'undefined') { sets.push('bg_url=?'); params.push(normalized.bg_url); }
    if (typeof normalized.icon_url !== 'undefined') { sets.push('icon_url=?'); params.push(normalized.icon_url); }
    if (typeof normalized.download_url !== 'undefined') { sets.push('download_url=?'); params.push(normalized.download_url); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    db.run(`UPDATE app_submissions SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(e2) {
      if (e2) return res.status(500).json({ error: e2.message });
      logAction(req.user?.username, 'update', 'app_submissions', id, { name: normalized.name });
      db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e3, rows) => { if (!e3) broadcast('submissions:update', rows); });
      res.json({ changed: this.changes });
    });
  });
});

app.post('/api/submissions/:id/approve', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { note } = req.body || {};
  db.get(`SELECT * FROM app_submissions WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '投稿已处理' });
    db.run(
      `INSERT INTO apps (name, provider, bg_url, icon_url, download_url, enabled) VALUES (?,?,?,?,?,?)`,
      [row.name, row.provider || '', row.bg_url || '', row.icon_url || '', row.download_url || '', 1],
      function(e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        const appId = this.lastID;
        db.run(
          `UPDATE app_submissions SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewer_id=?, review_note=? WHERE id=?`,
          [req.user?.uid || null, note ? String(note).trim() : null, id],
          function(e3) {
            if (e3) return res.status(500).json({ error: e3.message });
            logAction(req.user?.username, 'approve', 'app_submissions', id, { app_id: appId });
            db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e4, rows) => { if (!e4) broadcast('apps:update', rows); });
            db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e5, rows) => { if (!e5) broadcast('submissions:update', rows); });
            res.json({ id, app_id: appId });
          }
        );
      }
    );
  });
});

app.post('/api/submissions/:id/reject', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { note } = req.body || {};
  db.get(`SELECT * FROM app_submissions WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '投稿已处理' });
    db.run(
      `UPDATE app_submissions SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewer_id=?, review_note=? WHERE id=?`,
      [req.user?.uid || null, note ? String(note).trim() : null, id],
      function(e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        logAction(req.user?.username, 'reject', 'app_submissions', id);
        db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e3, rows) => { if (!e3) broadcast('submissions:update', rows); });
        res.json({ id });
      }
    );
  });
});

// Site Cards CRUD
app.get('/api/site-cards', requireAuth, (req, res) => {
  db.all(`SELECT * FROM site_cards ORDER BY sort_order ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.put('/api/site-cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, enabled, sort_order, style } = req.body;
  
  db.run(
    `UPDATE site_cards SET title=?, enabled=?, sort_order=?, style=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [title, enabled, sort_order, typeof style === 'object' ? JSON.stringify(style) : style, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'site_cards', id, { title, enabled, sort_order });
      res.json({ changed: this.changes });
      db.all(`SELECT * FROM site_cards ORDER BY sort_order ASC`, [], (e2, rows) => {
        if (!e2) broadcast('site_cards:update', rows);
      });
    }
  );
});

// Public Site Cards
app.get('/api/public/site-cards', (req, res) => {
  db.all(`SELECT * FROM site_cards WHERE enabled=1 ORDER BY sort_order ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// About Page
app.get('/api/about', (req, res) => {
  db.get(`SELECT * FROM about_page WHERE id = 1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

app.put('/api/about', requireAuth, (req, res) => {
  const { content_html, content_markdown, author_name, author_avatar, author_github, github_repo, version } = req.body;
  db.run(
    `UPDATE about_page SET content_html=?, content_markdown=?, author_name=?, author_avatar=?, author_github=?, github_repo=?, version=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
    [content_html, content_markdown, author_name, author_avatar, author_github, github_repo, version],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'about_page', 1);
      res.json({ changed: this.changes });
    }
  );
});

// ENV management
const envFilePath = path.join(__dirname, '../.env');
function readEnvFile() {
  if (!fs.existsSync(envFilePath)) return {};
  const content = fs.readFileSync(envFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const obj = {};
  lines.forEach(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) obj[m[1]] = m[2];
  });
  return obj;
}
function writeEnvKey(key, value) {
  const content = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  let found = false;
  const newLines = lines.map(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) newLines.push(`${key}=${value}`);
  fs.writeFileSync(envFilePath, newLines.join('\n'));
}
function categorizeKey(key) {
  if (/^(DB_|DATABASE_)/.test(key)) return 'database';
  if (/^(REDIS_|CACHE_)/.test(key)) return 'cache';
  if (/^(VUE_APP_|API_|THIRD_|SERVICE_)/.test(key)) return 'api';
  return 'other';
}

app.get('/api/env', requireAuth, (req, res) => {
  const envFile = readEnvFile();
  db.all(`SELECT key, value_encrypted, category, updated_at FROM env_vars`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = {};
    // Merge env file values and DB (DB values considered secure; send masked)
    const dbKeys = new Set((rows || []).map(r => r.key));
    Object.keys(envFile).forEach(k => {
      if (dbKeys.has(k)) return;
      const cat = categorizeKey(k);
      if (!result[cat]) result[cat] = [];
      result[cat].push({ key: k, value: envFile[k], secure: false, updated_at: null });
    });
    rows.forEach(r => {
      const cat = r.category || categorizeKey(r.key);
      if (!result[cat]) result[cat] = [];
      const val = r.key === 'FEEDBACK_RATE_LIMIT_PER_MINUTE' ? decrypt(r.value_encrypted) : '••••••';
      result[cat].push({ key: r.key, value: val, secure: true, updated_at: r.updated_at });
    });
    res.json(result);
  });
});

app.put('/api/env', requireAuth, (req, res) => {
  const { key, value, category, secure = true } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const isRateLimit = key === 'FEEDBACK_RATE_LIMIT_PER_MINUTE';
  if (secure || isRateLimit) {
    const enc = encrypt(String(value || ''));
    db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const oldEnc = row ? row.value_encrypted : null;
      const cat = category || categorizeKey(key);
      const upsert = row
        ? `UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`
        : `INSERT INTO env_vars (value_encrypted, category, key) VALUES (?,?,?)`;
      const params = row ? [enc, cat, key] : [enc, cat, key];
      db.run(upsert, params, function(e2){
        if (e2) return res.status(500).json({ error: e2.message });
        db.run(`INSERT INTO env_history (key, old_value_encrypted, new_value_encrypted) VALUES (?,?,?)`, [key, oldEnc, enc]);
        if (!isRateLimit) {
          writeEnvKey(key, String(value || ''));
        }
        logAction(req.user?.username, 'env_set', 'env_vars', null, { key });
        res.json({ ok: true });
      });
    });
  } else {
    writeEnvKey(key, String(value || ''));
    logAction(req.user?.username, 'env_set_plain', 'env_vars', null, { key });
    res.json({ ok: true });
  }
});

app.get('/api/env/history', requireAuth, (req, res) => {
  const key = req.query.key;
  const params = key ? [key] : [];
  const where = key ? 'WHERE key=?' : '';
  db.all(`SELECT * FROM env_history ${where} ORDER BY updated_at DESC LIMIT 100`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/env/rollback', requireAuth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  db.get(`SELECT key, old_value_encrypted FROM env_history WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'history not found' });
    const plain = row.old_value_encrypted ? decrypt(row.old_value_encrypted) : '';
    const cat = categorizeKey(row.key);
    const enc = row.old_value_encrypted;
    db.run(`UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`, [enc, cat, row.key], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      if (row.key !== 'FEEDBACK_RATE_LIMIT_PER_MINUTE') {
        writeEnvKey(row.key, plain);
      }
      logAction(req.user?.username, 'env_rollback', 'env_vars', null, { id });
      res.json({ ok: true });
    });
  });
});

// System Logs
app.get('/api/logs', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;
  
  db.all(`SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`, [pageSize, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) as total FROM operation_logs`, [], (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page, pageSize });
    });
  });
});

app.post('/api/logs/batch-delete', requireAuth, (req, res) => {
  const { ids, clearAll } = req.body;
  
  if (clearAll) {
    db.run(`DELETE FROM operation_logs`, [], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'clear_logs', 'operation_logs', null);
      res.json({ deleted: this.changes });
    });
    return;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM operation_logs WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete_logs', 'operation_logs', null, { count: this.changes });
    res.json({ deleted: this.changes });
  });
});

// Incidents CRUD
app.get('/api/public/incidents/active', (req, res) => {
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [Math.floor(Date.now() / 1000)], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time) VALUES (?,?,?,?,?,?)`,
    [title, content, status, type || 'incident', start_time || null, end_time || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'incidents', this.lastID, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time || null, end_time || null, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// Scheduled publish job
setInterval(() => {
  const now = Date.now();
  db.all(`SELECT id, scheduled_at, status FROM announcements WHERE status='draft' AND scheduled_at IS NOT NULL`, [], (err, rows) => {
    if (err || !rows) return;
    rows.forEach(r => {
      const t = new Date(r.scheduled_at).getTime();
      if (t && t <= now) {
        db.run(`UPDATE announcements SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [r.id]);
      }
    });
  });
  db.all(`SELECT id, scheduled_at FROM blogs WHERE status='draft' AND scheduled_at IS NOT NULL`, [], (err, rows) => {
    if (err || !rows) return;
    const now = Date.now();
    rows.forEach(r => {
      const t = new Date(r.scheduled_at).getTime();
      if (!isNaN(t) && t <= now) {
        db.run(`UPDATE blogs SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [r.id]);
      }
    });
  });
}, 60000);
// WebSocket server
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  clients.forEach((ws) => {
    try { ws.send(msg); } catch {}
  });
}

// Upgrade HTTP -> WS
const server = require('http').createServer(app);
server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  if (url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// Auth helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
function logAction(actor, action, entity, entity_id, payload) {
  const pStr = JSON.stringify(payload || {});
  db.run(
    `INSERT INTO operation_logs (actor, action, entity, entity_id, payload) VALUES (?,?,?,?,?)`,
    [actor || 'unknown', action, entity, entity_id || null, pStr],
    function(err) {
      if (!err) {
        // Construct the log object to broadcast
        // Note: created_at is generated by DB default CURRENT_TIMESTAMP, so we approximate it here or query it.
        // For UI refresh, approximate is usually fine, or we can just trigger a reload signal.
        // Sending the object allows immediate UI update without refetch if desired.
        const newLog = {
          id: this.lastID,
          actor: actor || 'unknown',
          action,
          entity,
          entity_id: entity_id || null,
          payload: pStr,
          created_at: new Date().toISOString()
        };
        broadcast('logs:new', newLog);
      }
    }
  );
}

// Seed admin user
db.get(`SELECT id FROM users WHERE username=?`, ['admin'], (err, row) => {
  if (err) console.error(err);
  const pwd = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(pwd, 10);
  if (!row) {
    db.run(`INSERT INTO users (username, password_hash, role) VALUES (?,?,?)`, ['admin', hash, 'admin']);
  } else if (process.env.ADMIN_PASSWORD) {
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, row.id]);
  }
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

app.post('/api/admin/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

app.post('/api/admin/auth/refresh', requireAuth, (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

app.post('/api/admin/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'Missing parameters' });
  function isPasswordComplex(p) {
    return typeof p === 'string'
      && p.length >= 8
      && /[A-Z]/.test(p)
      && /[a-z]/.test(p)
      && /\d/.test(p)
      && /[^A-Za-z0-9]/.test(p);
  }
  if (!isPasswordComplex(new_password)) {
    logAction(req.user?.username, 'password_change_failed', 'users', req.user?.uid, { reason: 'complexity' });
    return res.status(400).json({ error: '新密码不符合复杂度要求' });
  }
  const uid = req.user?.uid;
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'db_error' });
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'user_not_found' });
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!bcrypt.compareSync(old_password || '', user.password_hash)) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'wrong_old_password' });
      return res.status(401).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, uid], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      try { writeEnvKey('ADMIN_PASSWORD', new_password); } catch {}
      logAction(req.user?.username, 'password_change', 'users', uid);
      res.json({ ok: true });
    });
  });
});

// Admin Overview Dashboard Stats
app.get('/api/admin/overview', requireAuth, (req, res) => {
  const stats = {
    visitorCount: 0,
    appCount: 0,
    feedbackCount: 0,
    commentCount: 0,
    articleCount: 0,
    systemUptime: process.uptime(),
    // 浏览器端拿不到 process.versions，Node 版本只能由后端提供
    nodeVersion: process.version
  };

  const queries = [
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM visitors`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM apps`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM feedbacks WHERE status='pending'`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM comments WHERE status='pending'`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM blogs`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0))))
  ];

  Promise.all(queries).then(results => {
    stats.visitorCount = results[0];
    stats.appCount = results[1];
    stats.feedbackCount = results[2];
    stats.commentCount = results[3];
    stats.articleCount = results[4];
    res.json(stats);
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'Missing parameters' });
  function isPasswordComplex(p) {
    return typeof p === 'string'
      && p.length >= 8
      && /[A-Z]/.test(p)
      && /[a-z]/.test(p)
      && /\d/.test(p)
      && /[^A-Za-z0-9]/.test(p);
  }
  if (!isPasswordComplex(new_password)) {
    logAction(req.user?.username, 'password_change_failed', 'users', req.user?.uid, { reason: 'complexity' });
    return res.status(400).json({ error: '新密码不符合复杂度要求' });
  }
  const uid = req.user?.uid;
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'db_error' });
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'user_not_found' });
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!bcrypt.compareSync(old_password || '', user.password_hash)) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'wrong_old_password' });
      return res.status(401).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, uid], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      try { writeEnvKey('ADMIN_PASSWORD', new_password); } catch {}
      logAction(req.user?.username, 'password_change', 'users', uid);
      res.json({ ok: true });
    });
  });
});

// Music APIs Management

// Public: Get usable music APIs
app.get('/api/music/apis', (req, res) => {
  db.all(
    `SELECT * FROM music_apis WHERE enabled = 1 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, latency ASC, id ASC`, 
    [], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// Admin: Get all music APIs
app.get('/api/admin/music/apis', requireAuth, (req, res) => {
  db.all(`SELECT * FROM music_apis ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Admin: Add music API
app.post('/api/admin/music/apis', requireAuth, (req, res) => {
  const { name, url, type, enabled = 1 } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });
  
  db.run(
    `INSERT INTO music_apis (name, url, type, enabled) VALUES (?,?,?,?)`,
    [name, url, type || 'netease', enabled],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'music_apis', id, { name, url });
      res.json({ id });
    }
  );
});

// Admin: Update music API
app.put('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, type, enabled } = req.body;
  
  const sets = [];
  const params = [];

  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof url !== 'undefined') { sets.push('url=?'); params.push(url); }
  if (typeof type !== 'undefined') { sets.push('type=?'); params.push(type); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(enabled); }

  if (sets.length === 0) {
    return res.json({ changed: 0 });
  }

  sets.push('updated_at=CURRENT_TIMESTAMP');
  params.push(id);
  
  db.run(
    `UPDATE music_apis SET ${sets.join(', ')} WHERE id=?`,
    params,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'music_apis', id, { name, url, enabled });
      res.json({ changed: this.changes });
    }
  );
});

// Admin: Delete music API
app.delete('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM music_apis WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'music_apis', id);
    res.json({ deleted: this.changes });
  });
});

// Admin: Check music API
app.post('/api/admin/music/apis/check', requireAuth, async (req, res) => {
  const { id } = req.body;
  
  const checkUrl = async (url) => {
    const start = Date.now();
    try {
      // Clean URL
      const targetUrl = url.replace(/\/$/, '');
      // Use /banner as a lightweight check endpoint or /search
      const response = await axios.get(`${targetUrl}/banner`, { timeout: 5000 });
      const latency = Date.now() - start;
      if (response.status === 200 && response.data.code === 200) {
        return { status: 'active', latency };
      }
      return { status: 'error', latency: 0 };
    } catch (e) {
      return { status: 'error', latency: 0 };
    }
  };

  if (id) {
    // Check specific API
    db.get(`SELECT * FROM music_apis WHERE id=?`, [id], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'API not found' });
      
      const result = await checkUrl(row.url);
      db.run(
        `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [result.status, result.latency, id],
        function(e2) {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ ...result, id });
        }
      );
    });
  } else {
    // Check all enabled APIs
    db.all(`SELECT * FROM music_apis`, [], async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const results = [];
      for (const row of rows) {
        const result = await checkUrl(row.url);
        await new Promise((resolve) => {
          db.run(
            `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [result.status, result.latency, row.id],
            () => resolve()
          );
        });
        results.push({ id: row.id, ...result });
      }
      res.json({ results });
    });
  }
});

// System Settings API

// Public: Get theme settings
app.get('/api/settings/theme', (req, res) => {
  db.all(`SELECT key, value FROM system_settings WHERE key LIKE 'theme_%'`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  });
});

// Admin: Get all settings
app.get('/api/admin/settings', requireAuth, (req, res) => {
  db.all(`SELECT * FROM system_settings`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  });
});

// Admin: Update settings (batch)
app.put('/api/admin/settings', requireAuth, (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  
  const keys = Object.keys(settings);
  if (keys.length === 0) return res.json({ updated: 0 });

  let errors = [];

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    keys.forEach(key => {
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) 
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        [key, String(settings[key])],
        function(err) {
          if (err) errors.push(err.message);
        }
      );
    });
    db.run('COMMIT', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      if (errors.length > 0) return res.status(500).json({ error: 'Partial update failed', details: errors });
      
      logAction(req.user?.username, 'update', 'system_settings', null, { keys });
      res.json({ updated: keys.length });
    });
  });
});

app.use('/api/admin', (req, res, next) => {
  if (req.url.startsWith('/auth/')) return next();
  return requireAuth(req, res, () => {
    req.url = `/api${req.url}`;
    app.handle(req, res, next);
  });
});


// SPA Fallback - Must be last
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});
  
