/*
 * 访客日志：列表 / 趋势 / 单 IP 历史 / 导出 / 批量删除
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth } = require('../middleware/auth.cjs');
const { cachedVisitorsAll, cachedVisitorsGet } = require('../lib/visitors-stats.cjs');
const { UPSTREAM_USER_AGENT } = require('../lib/config.cjs');

const router = express.Router();

router.get('/api/visitors/ip-history', requireAuth, (req, res) => {
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
        `SELECT id, ip, location, device, path, timestamp, ua, via_upstream
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
            // 上游请求要展示的 UA（和访客自己的 ua 不是一回事），由服务端给，前端不写死
            upstream_ua: UPSTREAM_USER_AGENT,
            visitors: rows || []
          });
        }
      );
    }
  );
});

router.get('/api/visitors', requireAuth, (req, res) => {
  // 访客记录含真实 IP / 设备 / 访问路径，只对后台开放；limit 必须夹紧，避免被人一次性拖走整张表
  const limit = Math.min(Math.max(Number(req.query.limit || req.query.pageSize) || 50, 1), 200);
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

router.post('/api/admin/feedbacks/batch-delete', requireAuth, (req, res) => {
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
router.post('/api/visitors/batch-delete', requireAuth, (req, res) => {
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

router.get('/api/visitors/trend', requireAuth, (req, res) => {
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
    /*
     * 过滤条件要直接比较 timestamp 列，不能写成 datetime(timestamp,'+8 hours') >= ...
     * 否则列被函数包住，索引用不上，会退化成全表扫描（实测 80ms+ → 1ms）。
     * 结果等价：北京时间窗口起点减回 8 小时就是 UTC 时刻。
     */
    const windowStart = todayOnly
      ? "datetime('now', '+8 hours', 'start of day', '-8 hours')"
      : "datetime('now', '-' || ? || ' hours')";
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
        WHERE timestamp >= ${windowStart}
        GROUP BY bucket
      )
      SELECT b.h as date, COALESCE(a.count, 0) as count, COALESCE(a.unique_ip, 0) as unique_ip
      FROM buckets b
      LEFT JOIN agg a ON a.bucket = b.h
      ORDER BY b.h ASC
    `;
    const params = todayOnly ? [] : [hours, hours];
    // 趋势会被页面反复请求（进页面、切页签、换区间），缓存 1 分钟足够新鲜
    cachedVisitorsAll(
      `trend:hour:${hours}:${todayOnly ? 'today' : 'rolling'}`,
      sql,
      params,
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
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

  cachedVisitorsAll(
    `trend:day:${days}:${offset}`,
    sql,
    offset ? [days + offset, offset] : [days],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Export Visitor Logs
router.get('/api/visitors/export', requireAuth, (req, res) => {
  db.all(`SELECT * FROM visitors ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).send('Database Error');
    
    // Convert to CSV
    const header = ['ID', 'IP', 'Location', 'Device', 'Path', 'Time', 'Source'];
    const csvRows = rows.map(r => {
      // Escape quotes and handle commas
      const esc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      // Source：proxy = 经前置反代进来的，direct = 直接访问本站
      return [r.id, r.ip, r.location, r.device, r.path, r.timestamp, r.via_proxy ? 'proxy' : 'direct'].map(esc).join(',');
    });
    
    const csvContent = '\uFEFF' + [header.join(','), ...csvRows].join('\n'); // Add BOM for Excel
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="visitors-${Date.now()}.csv"`);
    res.send(csvContent);
  });
});

module.exports = router;
