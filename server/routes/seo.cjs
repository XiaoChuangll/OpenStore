/*
 * SEO 收录提交：后台接口（/api/admin/seo/*）。
 *
 * 鉴权在路由内部声明（router.use(requireAuth)），不依赖 index.cjs 的 /api/admin 闸门 ——
 * 本路由挂在该闸门之前，闸门拦不到它。位置原因见 index.cjs 的挂载注释。
 *
 * 返回给前端的 key 一律脱敏（maskKey）；明文仅用于服务端出站请求。
 */
const express = require('express');
const crypto = require('crypto');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const seo = require('../lib/seo-submit.cjs');

/**
 * @param {object} [deps]
 * @param {Function} [deps.onConfigChange] 站点 URL 变更后的回调（清 sitemap 缓存）
 */
module.exports = ({ onConfigChange } = {}) => {
  const router = express.Router();

  router.use(requireAuth);

  /** 配置转前端可见形态：剔除明文 key，补充 key 是否已配置 */
  const publicConfig = (config) => ({
    enabled: config.enabled,
    autoSubmit: config.autoSubmit,
    bingEnabled: config.bingEnabled,
    indexNowEnabled: config.indexNowEnabled,
    siteUrl: config.siteUrl,
    batchSize: config.batchSize,
    dailyLimit: config.dailyLimit,
    submitHour: config.submitHour,
    minHits: config.minHits,
    requestDelayMs: config.requestDelayMs,
    bingKeyMasked: config.bingKeyMasked,
    bingKeyConfigured: !!config.plainBingKey,
    indexNowKey: config.indexNowKey,
    indexNowKeyLocation: `${config.siteUrl}/indexnow-key.txt`
  });

  /** 队列概况：队列总量、待提交、今日已提交、近 7 天成功与失败数 */
  const queueStats = (config) =>
    new Promise((resolve) => {
      const out = { pending: 0, totalQueued: 0, submittedToday: 0, failedToday: 0, successRecent: 0 };

      db.get(`SELECT COUNT(*) AS total FROM seo_url_queue`, [], (err, row) => {
        if (!err && row) out.totalQueued = Number(row.total) || 0;

        db.get(
          `SELECT COUNT(DISTINCT url) AS n FROM seo_submissions
            WHERE status = 'success' AND created_at >= datetime('now', '+8 hours', 'start of day', '-8 hours')`,
          [],
          (err2, today) => {
            if (!err2 && today) out.submittedToday = Number(today.n) || 0;

            db.get(
              `SELECT
                 SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
                 SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success
               FROM seo_submissions WHERE created_at >= datetime('now', '-7 days')`,
              [],
              (err3, recent) => {
                if (!err3 && recent) {
                  out.failedToday = Number(recent.failed) || 0;
                  out.successRecent = Number(recent.success) || 0;
                }
                seo
                  .countPending(config)
                  .then((n) => {
                    out.pending = n;
                    resolve(out);
                  })
                  .catch(() => resolve(out));
              }
            );
          }
        );
      });
    });

  /* ---------------------------- 读取 ---------------------------- */

  /** 配置、统计与运行状态 */
  router.get('/api/admin/seo/status', async (req, res) => {
    try {
      const config = await seo.loadConfig();
      const [stats, schedule] = await Promise.all([queueStats(config), seo.schedulerState(config)]);

      res.json({
        config: publicConfig(config),
        stats,
        runtime: {
          running: seo.isRunning(),
          lastRunDay: schedule.lastRunDay,
          ranToday: schedule.ranToday,
          nextRunText: schedule.nextRunText,
          siteOrigin: config.siteUrl
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /** 下一轮将提交的 URL 明细 */
  router.get('/api/admin/seo/pending', async (req, res) => {
    try {
      const config = await seo.loadConfig();
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 2000);
      const rows = await seo.selectPending(config, limit);
      res.json({ items: rows, minHits: config.minHits, siteUrl: config.siteUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /** 提交记录，支持按状态、通道、URL 筛选与分页 */
  router.get('/api/admin/seo/submissions', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const clauses = [];
    const params = [];

    if (req.query.status) {
      clauses.push('status = ?');
      params.push(String(req.query.status));
    }
    if (req.query.channel) {
      clauses.push('channel = ?');
      params.push(String(req.query.channel));
    }
    if (req.query.url) {
      clauses.push('url LIKE ?');
      params.push(`%${String(req.query.url)}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    db.get(`SELECT COUNT(*) AS total FROM seo_submissions ${where}`, params, (err, agg) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT * FROM seo_submissions ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
        (err2, rows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ total: agg?.total || 0, page, limit, items: rows || [] });
        }
      );
    });
  });

  /** 队列中最近入队的路径 */
  router.get('/api/admin/seo/queue', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    db.all(`SELECT * FROM seo_url_queue ORDER BY last_seen DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows || [] });
    });
  });

  /** 查询必应当日剩余额度；查询不可用时返回 available:false */
  router.get('/api/admin/seo/quota', async (req, res) => {
    try {
      const config = await seo.loadConfig();
      const quota = await seo.fetchBingQuota(config, {});
      if (!quota) {
        return res.json({
          available: false,
          message: config.plainBingKey ? '查询失败（网络或鉴权问题）' : '未配置必应 API key'
        });
      }
      res.json({
        available: true,
        dailyQuota: quota.dailyQuota,
        monthlyQuota: quota.monthlyQuota,
        dailyLimit: seo.BING_DAILY_MAX,
        selfLimit: config.dailyLimit
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /* ---------------------------- 写入 ---------------------------- */

  /** 保存配置。bingApiKey 传空串表示清除，不传表示保持原值 */
  router.put('/api/admin/seo/config', async (req, res) => {
    const body = req.body || {};
    const patch = {};

    for (const key of ['enabled', 'autoSubmit', 'bingEnabled', 'indexNowEnabled']) {
      if (body[key] !== undefined) patch[key] = body[key] ? 1 : 0;
    }
    for (const key of ['batchSize', 'dailyLimit', 'submitHour', 'minHits', 'requestDelayMs']) {
      if (body[key] !== undefined && body[key] !== '') patch[key] = Math.floor(Number(body[key]));
    }
    if (body.siteUrl !== undefined) {
      const raw = String(body.siteUrl || '').trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(raw)) {
        return res.status(400).json({ error: '站点 URL 必须以 http:// 或 https:// 开头' });
      }
      patch.siteUrl = raw;
    }
    if (body.bingApiKey !== undefined) patch.bing_api_key = String(body.bingApiKey || '').trim();

    if (!Object.keys(patch).length) return res.status(400).json({ error: '没有需要更新的字段' });

    const result = await seo.saveSettings(patch);
    if (result.error) return res.status(500).json({ error: result.error });

    logAction(req.user?.username, 'update', 'seo_config', null, {
      keys: Object.keys(patch).map((k) => (k === 'bing_api_key' ? 'bing_api_key(变更)' : k))
    });

    // 站点 URL 变更后同步清掉 sitemap 缓存
    if (patch.siteUrl && typeof onConfigChange === 'function') {
      try {
        onConfigChange();
      } catch {
        /* 清缓存失败不影响配置保存 */
      }
    }

    const config = await seo.loadConfig();
    res.json({ updated: result.updated, config: publicConfig(config) });
  });

  /** 重新生成 IndexNow key（旧 key 文件随即失效） */
  router.post('/api/admin/seo/indexnow-key', async (req, res) => {
    const next = crypto.randomBytes(16).toString('hex');
    const result = await seo.saveSettings({ indexnow_key: next });
    if (result.error) return res.status(500).json({ error: result.error });

    logAction(req.user?.username, 'rotate', 'seo_indexnow_key', null, {});
    const config = await seo.loadConfig();
    res.json({ indexNowKey: config.indexNowKey, indexNowKeyLocation: `${config.siteUrl}/indexnow-key.txt` });
  });

  /** 手动执行一轮提交；limit 可临时指定 */
  router.post('/api/admin/seo/submit', async (req, res) => {
    if (seo.isRunning()) {
      return res.status(409).json({ error: '已有一轮提交正在进行，请稍后再试' });
    }
    const limit = Number(req.body?.limit);
    const summary = await seo.runSubmission({
      source: 'manual',
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined
    });
    logAction(req.user?.username, 'submit', 'seo', null, {
      attempted: summary.attempted,
      succeeded: summary.succeeded,
      skipped: !!summary.skipped,
      reason: summary.reason || summary.error || ''
    });
    res.json(summary);
  });

  /** 清理队列中已提交且不在保留期内的条目 */
  router.post('/api/admin/seo/queue/cleanup', (req, res) => {
    db.run(
      `DELETE FROM seo_url_queue
        WHERE submit_status = 'submitted'
          AND normalized_url NOT IN (
            SELECT url FROM seo_submissions
             WHERE status = 'success' AND created_at > datetime('now', '-4 days')
          )`,
      [],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user?.username, 'cleanup', 'seo_queue', null, { deleted: this.changes });
        res.json({ deleted: this.changes });
      }
    );
  });

  return router;
};
