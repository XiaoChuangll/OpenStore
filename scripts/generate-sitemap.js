import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://next.betahub.tech'; // 请替换为你的网站域名

const routerPath = path.resolve(__dirname, '../src/router/index.ts');
const outputPath = path.resolve(__dirname, '../dist/sitemap.xml');

// 确保dist目录存在
const distDir = path.resolve(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

try {
  const routerContent = fs.readFileSync(routerPath, 'utf8');
  const routes = [];

  // 匹配静态路由，排除动态路由和重定向
  // 匹配 path: '/' 或 path: '/some-path' 这种形式的路由
  const staticRouteRegex = /path: '(?!:|\*\/)(.*?)(?<!\*\/)'/g;
  let match;
  while ((match = staticRouteRegex.exec(routerContent)) !== null) {
    const routePath = match[1];
    // 排除重定向路由和管理后台路由
    if (routePath && !routePath.includes(':') && !routePath.includes('*') && !routePath.startsWith('/admin')) {
      routes.push(routePath);
    }
  }

  // 过滤掉重复的路由
  const uniqueRoutes = [...new Set(routes)];

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  uniqueRoutes.forEach(route => {
    const url = `${BASE_URL}${route}`;
    sitemap += `
  <url>
    <loc>${url}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  sitemap += `
</urlset>`;

  fs.writeFileSync(outputPath, sitemap, 'utf8');
  console.log('Sitemap generated successfully at:', outputPath);
} catch (error) {
  console.error('Error generating sitemap:', error);
}
