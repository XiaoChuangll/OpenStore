/*
 * 访客统计缓存。
 *
 * 总数 / 地区分布 / 设备分布都是全表聚合，数据量十万级时每次重算要数百毫秒，
 * 所以统一走这里的缓存：过期不阻塞请求，先把旧数据返回、后台只刷新一次。
 * 另外对「前端已经请求过」的那几项做后台预热，避免页面反复等同一个聚合。
 */
const db = require('../database.cjs');

// 访客统计都是「共 N 条 / 分布」这类聚合，访问量大，缓存久一点更划算
const VISITORS_STATS_TTL = 60 * 1000;
// 近半年维度的访客分布算一次要几百毫秒，单独给一个更长的缓存
const VISITORS_INSIGHTS_TTL = 5 * 60 * 1000;
/*
 * 缓存过期后不阻塞请求：先把旧数据返回，后台只刷新一次。
 * 聚合本身要扫十几万行，页面没必要为此等几百毫秒。
 */
const VISITORS_STATS_STALE_TTL = 10 * 60 * 1000;
const VISITORS_INSIGHTS_STALE_TTL = 24 * 60 * 60 * 1000;
const visitorsStatsCache = new Map();

const cachedVisitorsAll = (
  key,
  sql,
  params,
  cb,
  ttl = VISITORS_STATS_TTL,
  staleTtl = VISITORS_STATS_STALE_TTL
) => {
  const hit = visitorsStatsCache.get(key);
  const age = hit ? Date.now() - hit.t : Infinity;
  if (hit && age < ttl) return cb(null, hit.data);

  if (hit && age < staleTtl) {
    // 旧数据先顶上，后台刷新（同一个 key 只跑一次）
    if (!hit.refreshing) {
      hit.refreshing = true;
      db.all(sql, params, (err, rows) => {
        if (err) hit.refreshing = false;
        else visitorsStatsCache.set(key, { t: Date.now(), data: rows });
      });
    }
    return cb(null, hit.data);
  }

  db.all(sql, params, (err, rows) => {
    if (err) return cb(err);
    visitorsStatsCache.set(key, { t: Date.now(), data: rows });
    cb(null, rows);
  });
};

const cachedVisitorsGet = (key, sql, params, cb) => {
  const hit = visitorsStatsCache.get(key);
  const age = hit ? Date.now() - hit.t : Infinity;
  if (hit && age < VISITORS_STATS_TTL) return cb(null, hit.data);

  if (hit && age < VISITORS_STATS_STALE_TTL) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      db.get(sql, params, (err, row) => {
        if (err) hit.refreshing = false;
        else visitorsStatsCache.set(key, { t: Date.now(), data: row });
      });
    }
    return cb(null, hit.data);
  }

  db.get(sql, params, (err, row) => {
    if (err) return cb(err);
    visitorsStatsCache.set(key, { t: Date.now(), data: row });
    cb(null, row);
  });
};

/*
 * 访客列表页头部的总数 / 独立 IP / 地区 / 设备，以及全局地区、设备分布，
 * 都要扫十几万行（首次约 200ms）。这里让它们在后台保持温热：
 * 只预热「前端已经请求过」的那几项，不管没人看过的数据。
 */
const VISITOR_PREWARM_MS = 60 * 1000;
const VISITOR_PREWARM = [
  {
    key: 'agg::[]',
    one: true,
    sql: `SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS unique_ip,
                 COUNT(DISTINCT location) AS location_kinds, COUNT(DISTINCT device) AS device_kinds
            FROM visitors`
  },
  {
    key: 'loc:global',
    one: false,
    sql: `SELECT location AS name, COUNT(*) AS count FROM visitors GROUP BY location ORDER BY count DESC`
  },
  {
    key: 'dev:global',
    one: false,
    sql: `SELECT device AS name, COUNT(*) AS count FROM visitors GROUP BY device ORDER BY count DESC`
  }
];

setInterval(() => {
  VISITOR_PREWARM.forEach((item) => {
    const hit = visitorsStatsCache.get(item.key);
    // 没被请求过就不预热；还新鲜也不用管
    if (!hit || Date.now() - hit.t < VISITORS_STATS_TTL) return;

    if (item.one) {
      db.get(item.sql, [], (err, row) => {
        if (!err) visitorsStatsCache.set(item.key, { t: Date.now(), data: row });
      });
    } else {
      db.all(item.sql, [], (err, rows) => {
        if (!err) visitorsStatsCache.set(item.key, { t: Date.now(), data: rows });
      });
    }
  });
}, VISITOR_PREWARM_MS).unref?.();

module.exports = {
  VISITORS_STATS_TTL,
  VISITORS_STATS_STALE_TTL,
  VISITORS_INSIGHTS_TTL,
  VISITORS_INSIGHTS_STALE_TTL,
  cachedVisitorsAll,
  cachedVisitorsGet
};
