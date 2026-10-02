const express = require('express');
const cors = require('cors');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database.cjs');
const { createQueuedLookup } = require('./lib/ip-location.cjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 拆分出去的内部模块（注意：必须在 dotenv.config 之后加载，它们会读 process.env）
const { LIVE_LOG_SNAPSHOT, liveLogBuffer, liveSseClients, liveMetrics, pushLiveLog } = require('./lib/live-log.cjs');
const { isViaTrustedFrontProxy, getClientIp } = require('./lib/client-ip.cjs');
const { collectPerfCheckRoutes: collectPerfCheckRoutesIn } = require('./lib/perf-check.cjs');
const {
  SITE_ORIGIN,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_DEFAULT_DESCRIPTION,
  PAGE_SHARE_META,
  CRAWLER_UA_RE,
  absoluteSiteAsset,
  MUSIC_SECTION_TITLES,
  musicHomeShareCard,
  fetchMusicSectionShareCard,
  fetchTrackShareCard,
  fetchTopicShareCard,
  fetchAppShareCard,
  readShareShell,
  applyShareCardToHtml
} = require('./lib/share-cards.cjs');
const { broadcast, attachWebSocket } = require('./lib/realtime.cjs');
const { hardBanGuard } = require('./lib/script-guard.cjs');
const { JWT_SECRET, requireAuth } = require('./middleware/auth.cjs');
const { TRUST_PROXY_HOPS, PORT } = require('./lib/config.cjs');
const { uploadsDir, UPLOAD_FORCE_DOWNLOAD_EXT } = require('./lib/uploads.cjs');

/** 体检要枚举的就是「当前这个 app」上已注册的路由 */
const collectPerfCheckRoutes = () => collectPerfCheckRoutesIn(app);

const app = express();
app.set('trust proxy', TRUST_PROXY_HOPS);

app.use(cors());

/*
 * 硬封禁放在最前面：要在 body 解析、日志、静态资源与 SPA 兜底之前，
 * 否则被封的 IP 仍然能打开页面，就谈不上"硬"。
 * 名单为空时它只做一次 size 判断，正常流量零开销。
 */
app.use(hardBanGuard);

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

// 只记录 /api 请求，避免静态资源刷屏
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  // 重放接口本身的调用不记日志：它真正触发的那个请求会以 kind=replay 记一条，
  // 否则点一次重放会在日志里多出一行 POST /api/admin/replay
  if (req.path === '/api/admin/replay') return next();
  // 性能检测自己发起的请求不记日志：体检会连打几十个接口，不该污染拓扑与健康统计
  if (req.headers['x-openstore-perfcheck'] === '1') return next();
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

// Ensure /uploads is served correctly before SPA fallback
/*
 * /uploads 必须保持匿名可读（文章封面、应用图标这些要公开展示），
 * 但加了三点硬化，避免上传的文件在你的域名下被当成页面执行：
 *   1. nosniff：不让浏览器猜类型；
 *   2. html/svg/xml/js 这类能执行脚本的扩展名一律强制下载，不作为页面打开；
 *   3. 关掉目录索引。
 */
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (UPLOAD_FORCE_DOWNLOAD_EXT.test(path.extname(req.path || ''))) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    next();
  },
  express.static(uploadsDir, { index: false, dotfiles: 'ignore' })
);

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

      // 卡片标题用文章名本身，标签页标题保持「OpenStore | 文章名」
      const title = row.title;
      const docTitle = `${SITE_NAME} | ${row.title}`;
      const description = (row.seo_description || row.summary || '查看文章详细内容').replace(/"/g, '&quot;');
      const defaultKeywords = 'OpenStore,华为应用市场看板,鸿蒙应用看板,鸿蒙应用数据面板,鸿蒙,应用商店,应用下载,榜单,更新,应用分发';
      
      let keywords = row.seo_keywords ? row.seo_keywords : row.title;
      if (keywords) {
        keywords = `${keywords},${defaultKeywords}`;
      } else {
        keywords = defaultKeywords;
      }
      keywords = keywords.replace(/"/g, '&quot;');
      
      // 抓取器只认绝对图片地址：站内相对封面补成绝对，没封面就退回网站 logo
      const image = absoluteSiteAsset(row.cover_url) || SITE_LOGO_URL;

      let modifiedHtml = html;
      
      if (modifiedHtml.includes('<title>')) {
        modifiedHtml = modifiedHtml.replace(/<title>.*?<\/title>/, `<title>${docTitle}</title>`);
      } else {
        modifiedHtml = modifiedHtml.replace('</head>', `<title>${docTitle}</title>\n</head>`);
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


app.use(async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const accept = String(req.headers.accept || '');
  if (!accept.includes('text/html')) return next();

  const rawPath = req.path || '/';
  if (/^\/(api|uploads|admin)(\/|$)/.test(rawPath)) return next();
  if (path.extname(rawPath)) return next();

  const cleanPath = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : '/';
  const appMatch = /^\/(?:apps|updates\/app)\/([^/]+)$/.exec(cleanPath);
  const topicMatch = /^\/topics\/([^/]+)$/.exec(cleanPath);
  const isAppDashboard = cleanPath === '/dashboard';
  const pageMeta = PAGE_SHARE_META[cleanPath];

  const appId = appMatch
    ? decodeURIComponent(appMatch[1])
    : isAppDashboard
      ? String(req.query.app_id || '')
      : '';
  const topicId = topicMatch ? decodeURIComponent(topicMatch[1]) : '';
  // 正在播放 / 音乐页：地址上带 ?track=<歌曲 id> 时，分享卡片用这首歌
  const trackId =
    cleanPath === '/player' || cleanPath === '/music' ? String(req.query.track || '').trim() : '';
  // 音乐页的「更多歌单」列表（?view=radar|recommend|rank）：分享卡片用第一张歌单的封面
  const requestedView = String(req.query.view || '').trim();
  const musicSection =
    cleanPath === '/music' && MUSIC_SECTION_TITLES[requestedView] ? requestedView : '';

  if (!appId && !topicId && !trackId && !pageMeta) return next();

  const shell = await readShareShell();
  if (!shell) return next();

  const url = `${SITE_ORIGIN}${req.originalUrl.split('#')[0]}`;
  const isCrawler = CRAWLER_UA_RE.test(String(req.headers['user-agent'] || ''));

  let card;
  if (appId) {
    const appCard = isCrawler ? await fetchAppShareCard(appId) : null;
    card = appCard || {
      title: `应用详情 - ${SITE_NAME}`,
      description: '查看应用详细信息、评分、版本与更新历史。',
      image: SITE_LOGO_URL
    };
  } else if (musicSection) {
    const sectionCard = isCrawler ? await fetchMusicSectionShareCard(musicSection) : null;
    card = sectionCard || {
      title: `${SITE_NAME} | ${MUSIC_SECTION_TITLES[musicSection]}`,
      description: '畅听海量音乐，发现你的专属歌单。',
      image: SITE_LOGO_URL
    };
  } else if (trackId) {
    const trackCard = isCrawler ? await fetchTrackShareCard(trackId) : null;
    card = trackCard || {
      title: `${SITE_NAME} | ${pageMeta ? pageMeta.title : '正在播放'}`,
      description: '一边听歌一边逛应用市场。',
      image: SITE_LOGO_URL
    };
  } else if (cleanPath === '/music') {
    // 音乐首页没在放歌：图用页面上那张网易云封面，副标题用图旁边那行字
    card = musicHomeShareCard();
  } else if (topicId) {
    const topicCard = isCrawler ? await fetchTopicShareCard(topicId) : null;
    card = topicCard || {
      title: `专题详情 - ${SITE_NAME}`,
      description: '跟随专题逛鸿蒙生态，发现值得一试的应用。',
      image: SITE_LOGO_URL
    };
  } else {
    // 栏目页：带网站 logo
    card = {
      title: `${SITE_NAME} | ${pageMeta.title}`,
      description: pageMeta.description || SITE_DEFAULT_DESCRIPTION,
      seoDescription: pageMeta.seoDescription,
      image: SITE_LOGO_URL
    };
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(applyShareCardToHtml(shell, { ...card, url }));
});

// 静态资源排在 /uploads 之后，否则 /uploads 会被 SPA 兜底或这里的静态中间件截走
app.use(express.static(path.join(__dirname, '../dist')));


app.use((req, res, next) => {
  const isPublicApi = req.path.startsWith('/api/public/') || req.path.startsWith('/api/v0/') || req.path === '/api/monitors' || req.path === '/api/about';

  // 后端自己发起的重放请求不计入访客统计（否则重放一次公开接口就会多一个"访客"）
  const isReplayRequest = req.headers['x-openstore-replay'] === '1';

  if (isPublicApi && req.method === 'GET' && !isReplayRequest) {
    // 统一走 getClientIp：优先取 CDN 给出的客户端 IP 头，其次取 XFF 最左一段
    // （链路是 用户 → EdgeOne → nginx，最左才是真实用户；详见 getClientIp 的注释）
    const cleanIp = getClientIp(req);
    // 来源标记：这次请求是不是经「已知前置反代」进来的（例如 beta-next.icu）。
    // 看 CDN 给出的连接方 IP，访客伪造不了，所以后台那个"代"标记是可信的。
    const viaProxy = isViaTrustedFrontProxy(req) ? 1 : 0;

    /*
     * 这次请求是不是转发到应用市场上游的（/api/v0/*）。
     * 上游请求和普通页面请求要展示的 UA 不一样：前者是服务端统一用的 UPSTREAM_USER_AGENT，
     * 后者才是访客自己的 UA。这里先按真实命中的接口打标，后面入库。
     */
    const viaUpstream = req.path.startsWith('/api/v0') ? 1 : 0;
    
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

    // 快速路径：命中就跳过，省掉 UA 解析和 GeoIP 查询
    db.get(
      `SELECT id FROM visitors WHERE ip = ? AND path = ? AND timestamp > ? LIMIT 1`,
      [cleanIp, requestPath, oneMinuteAgo],
      (err, row) => {
        if (err) {
          console.error('Error checking visitor de-duplication:', err);
        } else if (!row) {
          const geo = geoip.lookup(cleanIp);
          const location = geo ? [geo.city, geo.country].filter(Boolean).join(' ') : 'Unknown Local';

          // 原始 UA 留一份：device 是从它解析出的展示名，原文能看到版本等细节
          const ua = String(req.headers['user-agent'] || '').slice(0, 512);

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

          /**
           * 真正的去重在这里：把「检查 + 插入」写成一条 SQL。
           *
           * 不能只靠上面那次 SELECT —— 首页会同时并发好几个公开接口请求
           * （monitors / incidents / comments / site-cards / overview ...），
           * 它们带着同一个 Referer，去重路径都是 `/`。先查后插时这些请求会
           * 一起通过检查、各插一行，线上出现过「访问一次却记 6~7 条」，
           * 而且时间戳一模一样。条件插入由 SQLite 串行执行，不存在这个竞态。
           */
          db.run(
            `INSERT INTO visitors (ip, location, device, path, via_proxy, ua, via_upstream)
             SELECT ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM visitors WHERE ip = ? AND path = ? AND timestamp > ?
             )`,
            [cleanIp, location, device, requestPath, viaProxy, ua, viaUpstream, cleanIp, requestPath, oneMinuteAgo],
            function(err) {
              if (err) {
                console.error('Error tracking visitor:', err);
              } else if (this.changes > 0) {
                const newVisitor = {
                  id: this.lastID,
                  ip: cleanIp,
                  location,
                  device,
                  path: requestPath,
                  via_proxy: viaProxy,
                  ua,
                  via_upstream: viaUpstream,
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
/*
 * ---- 路由挂载 ----
 * 顺序就是匹配顺序，必须与拆分前各段路由在原文件里的先后保持一致
 * （例如 /api/v0 相关的中间件要排在通用路由前面）。
 * 每个 router 内部写的都是完整路径，所以统一挂在根路径上。
 *
 * 注意：本文件不在这里面注册任何业务路由，全部在 server/routes/ 下。
 */
/*
 * 挂载时顺手记一笔，启动后打印「哪个模块挂了多少条路由」的摘要。
 * 拆成多个文件之后，光看目录不好确认有没有漏挂，这段输出就是给这个用的。
 */
const mountedRouters = [];
const mountRouter = (name, router) => {
  mountedRouters.push({ name, router });
  app.use(router);
};

mountRouter('admin-ops', require('./routes/admin-ops.cjs')({ collectPerfCheckRoutes })); // 数据新鲜度 / 全接口体检 / 调用拓扑 / 访客洞察 / 重放 / 应用总览 / 屏蔽应用
mountRouter('proxy', require('./routes/proxy.cjs'));          // 上游代理：/api/v0 透传、/api/proxy-request、/api/music-proxy
mountRouter('media', require('./routes/media.cjs'));          // 应用截图同源代理、文件上传、上传目录
mountRouter('monitors', require('./routes/monitors.cjs'));    // UptimeRobot 监控状态
mountRouter('visitors', require('./routes/visitors.cjs'));    // 访客日志：列表 / 趋势 / 单 IP 历史 / 导出
mountRouter('database', require('./routes/database.cjs'));    // 数据库管理
mountRouter('friend-links', require('./routes/friend-links.cjs')); // 友情链接
mountRouter('group-chats', require('./routes/group-chats.cjs'));   // 群聊
mountRouter('incidents', require('./routes/incidents.cjs'));  // 服务事故 / 维护公告
mountRouter('apps-read', require('./routes/apps-read.cjs'));  // 应用列表（后台）
mountRouter('comments', require('./routes/comments.cjs'));    // 评论
mountRouter('apps-admin', require('./routes/apps-admin.cjs'));     // 应用 CRUD
mountRouter('public-content', require('./routes/public-content.cjs')); // 前台公开内容：应用 / 公告 / 文章
mountRouter('content-admin', require('./routes/content-admin.cjs'));   // 内容管理：公告、文章、分类标签
mountRouter('changelogs', require('./routes/changelogs.cjs'));     // 更新日志
mountRouter('diagnostics', require('./routes/diagnostics.cjs'));   // 客户端 IP 诊断
mountRouter('submissions', require('./routes/submissions.cjs'));   // 应用投稿与问题反馈
mountRouter('site', require('./routes/site.cjs'));           // 站点卡片 / 关于页
mountRouter('env-logs', require('./routes/env-logs.cjs'));    // 环境变量 / 操作日志

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

/** 统计一个 router 里注册的路由条数 */
const countRouterRoutes = (router) => (router.stack || []).filter((layer) => layer.route).length;

/** 递归统计挂在 app 上的全部路由（含各子 router），用来核对总数 */
const countAppRoutes = (stack) =>
  (stack || []).reduce((sum, layer) => {
    if (layer.route) return sum + 1;
    const handle = layer.handle;
    return sum + (handle && Array.isArray(handle.stack) ? countAppRoutes(handle.stack) : 0);
  }, 0);

/*
 * 启动摘要。拆成多文件之后，光看目录不好确认有没有哪个模块漏挂，
 * 这段输出一眼就能看出来：条数对不对、入口直连的是哪几条。
 */
const printStartupSummary = () => {
  const perRouter = mountedRouters.map(({ name, router }) => ({ name, count: countRouterRoutes(router) }));
  const inRouters = perRouter.reduce((sum, item) => sum + item.count, 0);
  const total = countAppRoutes(app.router && app.router.stack);

  console.log(`[startup] 端口 ${PORT} · 代理信任跳数 ${TRUST_PROXY_HOPS} · Node ${process.version} · PID ${process.pid}`);
  console.log(`[startup] 共 ${total} 条路由 = ${perRouter.length} 个路由模块（${inRouters} 条）+ 入口直连 ${total - inRouters} 条`);
  const width = Math.max(...perRouter.map((r) => r.name.length));
  for (const { name, count } of perRouter) {
    console.log(`[startup]   ${name.padEnd(width)}  ${String(count).padStart(3)} 条`);
  }
};

// Upgrade HTTP -> WS
const server = require('http').createServer(app);
attachWebSocket(server, { jwtSecret: JWT_SECRET });

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  printStartupSummary();
});


// Seed admin user
db.get(`SELECT id FROM users WHERE username=?`, ['admin'], (err, row) => {
  if (err) console.error(err);
  const configuredPwd = String(process.env.ADMIN_PASSWORD || '').trim();
  if (!row) {
    // 没有配置密码时不要再回退到 'admin123' 这种公开的默认口令：
    // 首次初始化改成生成随机密码并打印到启动日志，至少不是人人皆知的密码。
    if (!configuredPwd) {
      const generated = crypto.randomBytes(12).toString('base64url');
      console.warn('[security] 未配置 ADMIN_PASSWORD，已为 admin 生成随机初始密码（仅本次启动打印）：');
      console.warn(`[security] admin 初始密码: ${generated}`);
      console.warn('[security] 请登录后立即修改，或直接在 .env 里设置 ADMIN_PASSWORD。');
      db.run(`INSERT INTO users (username, password_hash, role) VALUES (?,?,?)`, ['admin', bcrypt.hashSync(generated, 10), 'admin']);
    } else {
      db.run(`INSERT INTO users (username, password_hash, role) VALUES (?,?,?)`, ['admin', bcrypt.hashSync(configuredPwd, 10), 'admin']);
    }
  } else if (configuredPwd) {
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [bcrypt.hashSync(configuredPwd, 10), row.id]);
  }
});

// 登录相关接口（原文件里就排在定时任务 / 建管理员账号之后）
mountRouter('auth', require('./routes/auth.cjs'));            // 登录 / 刷新 token / 改密码 / 后台概览
mountRouter('music-settings', require('./routes/music-settings.cjs'));  // 音乐 API 配置 / 站点设置

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
  
