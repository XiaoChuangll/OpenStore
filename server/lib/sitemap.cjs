/*
 * 运行时的 sitemap.xml 生成。
 *
 * 内容：静态栏目页 + 应用详情页（apps.original_id）+ 已发布文章页（blogs.slug）。
 * 构建期 dist/sitemap.xml 只有栏目页兜底，详情页由此处补充。
 * 结果缓存 10 分钟；站点 URL 变更时由调用方 invalidateSitemapCache() 清除。
 */
const db = require('../database.cjs');

/** 与 scripts/generate-sitemap.js 的兜底清单保持一致 */
const STATIC_ROUTES = ['/', '/apps', '/updates', '/topics', '/articles', '/about'];
const CACHE_TTL_MS = 10 * 60 * 1000;

/** 详情页条数上限，避免条目过多 */
const MAX_APP_URLS = 3000;
const MAX_ARTICLE_URLS = 2000;

/** 静态页在 sitemap 中的优先级 */
const PRIORITY = {
  '/': '1.0',
  '/apps': '0.8',
  '/updates': '0.8',
  '/topics': '0.8',
  '/articles': '0.8',
  '/about': '0.5'
};

const xmlEscape = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** 逐段编码路径，保留 / 分隔符 */
const encodePath = (value) =>
  String(value || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

const all = (sql, params = []) =>
  new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows || [])));

/** 标准化为 YYYY-MM-DD；无法解析时返回空串 */
const toDate = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/**
 * 生成 sitemap XML。
 * @param {string} siteUrl 站点 origin，不带结尾斜杠
 * @returns {Promise<{xml: string, count: number}>}
 */
async function buildSitemap(siteUrl) {
  const origin = String(siteUrl || '').replace(/\/+$/, '');
  if (!origin) throw new Error('缺少站点 URL，无法生成 sitemap');

  const today = new Date().toISOString().slice(0, 10);
  const entries = [];

  for (const routePath of STATIC_ROUTES) {
    entries.push({
      loc: `${origin}${routePath}`,
      lastmod: today,
      changefreq: routePath === '/' ? 'hourly' : 'daily',
      priority: PRIORITY[routePath] || '0.7'
    });
  }

  // 应用详情页：/apps/:id 的 id 取自 apps.original_id
  const apps = await all(
    `SELECT original_id, updated_at FROM apps
      WHERE enabled = 1 AND original_id IS NOT NULL AND original_id != ''
      ORDER BY updated_at DESC LIMIT ?`,
    [MAX_APP_URLS]
  );
  for (const app of apps) {
    entries.push({
      loc: `${origin}/apps/${encodePath(app.original_id)}`,
      lastmod: toDate(app.updated_at) || today,
      changefreq: 'weekly',
      priority: '0.6'
    });
  }

  // 文章详情页：仅已发布
  const blogs = await all(
    `SELECT slug, updated_at, published_at FROM blogs
      WHERE status = 'published' AND slug IS NOT NULL AND slug != ''
      ORDER BY COALESCE(updated_at, published_at) DESC LIMIT ?`,
    [MAX_ARTICLE_URLS]
  );
  for (const blog of blogs) {
    entries.push({
      loc: `${origin}/articles/${encodePath(blog.slug)}`,
      lastmod: toDate(blog.updated_at || blog.published_at) || today,
      changefreq: 'weekly',
      priority: '0.6'
    });
  }

  const body = entries
    .map(
      (entry) => `  <url>
    <loc>${xmlEscape(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join('\n');

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    count: entries.length
  };
}

let cache = { at: 0, siteUrl: '', xml: '', count: 0 };

/**
 * 带缓存地获取 sitemap。站点 URL 变化或缓存过期时重新生成。
 * @returns {Promise<{xml: string, count: number, cached: boolean}>}
 */
async function getSitemap(siteUrl) {
  const origin = String(siteUrl || '').replace(/\/+$/, '');
  const fresh = cache.xml && cache.siteUrl === origin && Date.now() - cache.at < CACHE_TTL_MS;
  if (fresh) return { xml: cache.xml, count: cache.count, cached: true };

  const built = await buildSitemap(origin);
  cache = { at: Date.now(), siteUrl: origin, xml: built.xml, count: built.count };
  return { ...built, cached: false };
}

/** 清除缓存，强制下次重新生成 */
function invalidateSitemapCache() {
  cache = { at: 0, siteUrl: '', xml: '', count: 0 };
}

module.exports = { buildSitemap, getSitemap, invalidateSitemapCache, STATIC_ROUTES };
