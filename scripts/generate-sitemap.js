/*
 * 生成构建期的 dist/sitemap.xml 兜底文件。
 *
 * 完整 sitemap（含应用与文章详情页）由服务端运行时输出：GET /sitemap.xml → server/lib/sitemap.cjs。
 * 这里只在 dist 被纯静态托管、请求到不了 Node 时兜底，故只列栏目页。
 * 清单需与 server/lib/sitemap.cjs 的 STATIC_ROUTES 保持一致。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = String(process.env.SITE_ORIGIN || 'https://next.betahub.tech').replace(/\/+$/, '');
const ROUTES = ['/', '/apps', '/updates', '/topics', '/articles', '/about'];

const distDir = path.resolve(__dirname, '../dist');
const outputPath = path.join(distDir, 'sitemap.xml');

try {
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
  const body = ROUTES.map(
    (route) => `  <url>
    <loc>${BASE_URL}${route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${route === '/' ? '1.0' : '0.8'}</priority>
  </url>`
  ).join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

  fs.writeFileSync(outputPath, sitemap, 'utf8');
  console.log(`Sitemap fallback written to ${outputPath} (${ROUTES.length} urls)`);
} catch (error) {
  console.error('Error generating sitemap fallback:', error);
}
