/*
 * 后台运营接口：数据新鲜度 / 全接口体检 / 调用拓扑 / 访客洞察 / 请求重放 / 应用总览 / 屏蔽应用
 */
const express = require('express');
const axios = require('axios');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../database.cjs');
const { JWT_SECRET, requireAuth, logAction } = require('../middleware/auth.cjs');
const { pushLiveLog, liveLogBuffer } = require('../lib/live-log.cjs');
const { FRESHNESS_SOURCES, PAGE_LABELS, normalizeVisitorPath } = require('../lib/visitor-paths.cjs');
const { PERF_CHECK_TIMEOUT_MS, PERF_CHECK_BUDGET_MS } = require('../lib/perf-check.cjs');
const { extractCountryCode, matchCnProvince, CITY_TO_PROVINCE } = require('../lib/cities.cjs');
const { getAppsOverview, APP_OVERVIEW_CACHE_TTL, appOverviewCache } = require('../lib/apps-overview.cjs');
const { cachedVisitorsAll, VISITORS_INSIGHTS_TTL, VISITORS_INSIGHTS_STALE_TTL } = require('../lib/visitors-stats.cjs');
const { invalidateBlockedAppsCache } = require('../lib/blocked-apps.cjs');
const { previewWarningPage, getPageConfig, savePageConfig, resetPageConfig, DEFAULT_PAGE_CONFIG, listBlockRecords, clearBlockRecords, unblockIp, scriptGuardSnapshot, triggerBlock } = require('../lib/script-guard.cjs');
const { getClientIp } = require('../lib/client-ip.cjs');
const { PORT } = require('../lib/config.cjs');

module.exports = ({ collectPerfCheckRoutes }) => {
  const router = express.Router();

  router.get('/api/admin/freshness', requireAuth, async (req, res) => {
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
  const UPSTREAM_PROXY_PREFIXES = ['/api/v0', '/api/proxy-request', '/api/music-proxy'];


  router.post('/api/admin/perf-check', requireAuth, async (req, res) => {
    const paths = collectPerfCheckRoutes();
    const base = `http://127.0.0.1:${PORT}`;
    // 临时 token：让检测请求能访问受保护接口，并带上 admin 角色，5 分钟后自动失效
    const token = jwt.sign(
      { uid: req.user?.uid ?? 0, username: req.user?.username || 'perf-check', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    const startedAt = Date.now();
    const results = [];

    for (const path of paths) {
      if (Date.now() - startedAt > PERF_CHECK_BUDGET_MS) {
        results.push({ path, status: 0, ms: 0, bytes: 0, ok: false, skipped: true });
        continue;
      }

      const t0 = process.hrtime.bigint();
      try {
        const resp = await axios.get(base + path, {
          timeout: PERF_CHECK_TIMEOUT_MS,
          validateStatus: () => true,
          maxRedirects: 0,
          responseType: 'text',
          // 打个标记，让实时日志中间件跳过这些请求，避免体检流量污染拓扑 / 健康统计
          headers: { Authorization: `Bearer ${token}`, 'x-openstore-perfcheck': '1' }
        });
        const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data ?? '');
        const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
        // 400 多半是「缺参数」（这类接口不开参数本来就没法访问），单独标记，不算失败
        const needsParam =
          resp.status === 400 && /missing|required|invalid|缺少|参数/i.test(String(body));
        results.push({
          path,
          status: resp.status,
          ms,
          bytes: Buffer.byteLength(body || '', 'utf8'),
          ok: resp.status < 400,
          needsParam
        });
      } catch (error) {
        const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);
        results.push({ path, status: 0, ms, bytes: 0, ok: false, error: error.message });
      }
    }

    results.sort((a, b) => b.ms - a.ms);
    const checked = results.filter((item) => !item.skipped);
    const failed = checked.filter((item) => !item.ok && !item.needsParam).length;
    const needsParams = checked.filter((item) => item.needsParam).length;
    const slow = checked.filter((item) => item.ms >= 500).length;
    const avgMs = checked.length
      ? Math.round(checked.reduce((sum, item) => sum + item.ms, 0) / checked.length)
      : 0;
    const payload = {
      total: checked.length,
      failed,
      needsParams,
      slow,
      avgMs,
      maxMs: checked.reduce((max, item) => Math.max(max, item.ms), 0),
      durationMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      results
    };

    logAction(req.user?.username, 'perf_check', 'system', null, {
      total: payload.total,
      failed,
      slow,
      avgMs
    });
    res.json(payload);
  });

  router.get('/api/admin/topology', requireAuth, (req, res) => {
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


  router.get('/api/admin/visitor-insights', requireAuth, async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days || 180), 1), 3650);
    const since = `-${days} days`;

    /*
     * 这三个聚合要扫最近 N 天（默认 180 天）的访客记录，单次要几百毫秒，
     * 而统计结果本身就是慢变量，缓存 5 分钟足够，页面上就不用每次都等。
     */
    const query = (key, sql, params = []) =>
      new Promise((resolve) => {
        cachedVisitorsAll(
          `insights:${days}:${key}`,
          sql,
          params,
          (err, rows) => resolve(err ? [] : rows),
          VISITORS_INSIGHTS_TTL,
          VISITORS_INSIGHTS_STALE_TTL
        );
      });

    const [locations, hours, weekdayHours] = await Promise.all([
      query(
        'locations',
        `SELECT location, COUNT(*) AS count FROM visitors
         WHERE timestamp >= date('now', ?) GROUP BY location ORDER BY count DESC`,
        [since]
      ),
      query(
        'hours',
        `SELECT strftime('%H', datetime(timestamp, '+8 hours')) AS hour, COUNT(*) AS count
         FROM visitors WHERE timestamp >= date('now', ?) GROUP BY hour ORDER BY hour`,
        [since]
      ),
      query(
        'weekday-hours',
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
  router.post('/api/admin/replay', requireAuth, async (req, res) => {
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

  router.get('/api/public/apps/overview', async (req, res) => {
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



  router.get('/api/admin/blocked-apps', requireAuth, (req, res) => {
    db.all(`SELECT * FROM blocked_apps ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    });
  });

  router.post('/api/admin/blocked-apps', requireAuth, (req, res) => {
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

  router.delete('/api/admin/blocked-apps/:package', requireAuth, (req, res) => {
    const pkg = String(req.params.package || '').trim().toLowerCase();
    if (!pkg) return res.status(400).json({ error: '缺少 package' });

    db.run(`DELETE FROM blocked_apps WHERE package = ?`, [pkg], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      invalidateBlockedAppsCache();
      logAction(req.user?.username, 'delete', 'blocked_apps', pkg, { package: pkg });
      res.json({ success: true });
    });
  });

  /*
   * 脚本护栏的警告页预览：后台「概览 → 快捷操作 → 脚本拦截」面板用。
   * 纯渲染，不调用护栏中间件 —— 不计数、不进封禁表、不影响任何 IP，点多少次都安全。
   * 返回 JSON 而不是直接吐 HTML，是为了复用后台已有的 JWT 头鉴权（新窗口打开带不上 Authorization）。
   */
  router.get('/api/admin/script-guard/preview', requireAuth, (req, res) => {
    res.json({ html: previewWarningPage() });
  });

  /*
   * 警告页自定义：读 / 存 / 恢复默认。
   * 存在 system_settings 的 script_guard_page 键里，lib 侧有内存缓存，保存后立刻对
   * 下一个被拦的请求生效 —— 不用重启，也不用改 .env。
   */
  router.get('/api/admin/script-guard/page', requireAuth, (req, res) => {
    res.json({ config: getPageConfig(), defaults: DEFAULT_PAGE_CONFIG });
  });

  router.put('/api/admin/script-guard/page', requireAuth, (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    savePageConfig(req.body, (err, config) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'script_guard_page', null, { title: config.title });
      res.json({ success: true, config });
    });
  });

  router.post('/api/admin/script-guard/page/reset', requireAuth, (req, res) => {
    resetPageConfig((err, config) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'script_guard_page', null, { reset: true });
      res.json({ success: true, config });
    });
  });

  /*
   * 拦截记录：每次「触发封禁」落一条（宽限期内的放行不记）。
   * active 是当前仍在封禁期内的 IP（内存态），前端据此把对应行标成「拦截中」。
   */
  router.get('/api/admin/script-guard/blocks', requireAuth, (req, res) => {
    listBlockRecords(req.query.limit, (err, items) => {
      if (err) return res.status(500).json({ error: err.message });
      const snapshot = scriptGuardSnapshot();
      res.json({ items, active: snapshot.blocked, stats: snapshot.stats });
    });
  });

  router.delete('/api/admin/script-guard/blocks', requireAuth, (req, res) => {
    clearBlockRecords((err) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'delete', 'script_guard_blocks', null, {});
      res.json({ success: true });
    });
  });

  // 手动解封（误伤时用）：只清内存里的封禁状态，不动已写下的记录
  router.post('/api/admin/script-guard/unblock', requireAuth, (req, res) => {
    const ip = String(req.body?.ip || '').trim();
    if (!ip) return res.status(400).json({ error: 'Missing ip' });
    const released = unblockIp(ip);
    logAction(req.user?.username, 'update', 'script_guard_unblock', null, { ip, released });
    res.json({ success: true, released });
  });

  /*
   * 一键触发真实拦截：对**当前管理员自己的 IP** 执行一次真实封禁。
   * 不是预览 —— 会写拦截记录、进内存封禁表、打实时日志，重复点按同样的 4 倍规则升级。
   * 浏览器本身不受影响（浏览器 UA 根本不进护栏逻辑），误伤时在「拦截记录」里解封即可。
   */
  router.post('/api/admin/script-guard/trigger', requireAuth, (req, res) => {
    const ip = getClientIp(req);
    const result = triggerBlock(ip, { ua: req.body?.ua, path: req.body?.path });
    if (!result) return res.status(400).json({ error: '无法解析请求来源 IP' });
    logAction(req.user?.username, 'update', 'script_guard_trigger', null, {
      ip: result.ip,
      strikes: result.strikes,
      blockMs: result.blockMs
    });
    res.json(result);
  });

  return router;
};
