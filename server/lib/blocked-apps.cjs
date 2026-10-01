/*
 * 异常应用（屏蔽列表）的内存缓存。
 *
 * 上游偶尔会返回脏数据，后台可以按包名把应用屏蔽掉。
 * 这个表很小但读得极频繁（每次浏览/筛选都要用），所以进程内缓存 10 秒，
 * 后台增删时调用 invalidateBlockedAppsCache() 立即失效。
 */
const db = require('../database.cjs');
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

module.exports = { loadBlockedAppPackages, invalidateBlockedAppsCache };
