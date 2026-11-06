/*
 * 详情页的 canonical（权威地址）计算。
 *
 * 同一个应用有多个等价入口，渲染的是同一份数据，不声明权威地址会被搜索引擎
 * 当成多个重复页面：
 *   /apps/X              应用详情（sitemap 使用的形式）
 *   /dashboard?app_id=X  应用数据面板
 *   /app/X               旧版应用卡片路由
 * 这三者统一指向 /apps/<id>。
 *
 * 判断口径以**路径**为准，而不是「调用方是否传了 appId」：
 * 只有应用类路径才改写，/updates/app/X（更新记录）、/topics/X（专题）内容不同，
 * 一律指向自身。这样即使调用方把某个 ID 误当成 appId 传进来也不会算错。
 */

const APP_DETAIL_PATH_RE = /^\/apps\/[^/]+$/;
const APP_ALIAS_PATH_RE = /^\/app\/[^/]+$/;

/**
 * 计算 canonical 路径。
 * @param {string} cleanPath 去掉结尾斜杠的请求路径
 * @param {string} [appId] 请求上下文中的应用 ID；路径本身不是应用类时会被忽略
 * @returns {string} canonical 路径（以 / 开头）
 */
function canonicalPathFor(cleanPath, appId) {
  const path = String(cleanPath || '/');
  const isAppAlias = APP_ALIAS_PATH_RE.test(path) || path === '/dashboard';
  if (isAppAlias && appId) {
    return `/apps/${encodeURIComponent(appId)}`;
  }
  return path;
}

module.exports = { canonicalPathFor };
