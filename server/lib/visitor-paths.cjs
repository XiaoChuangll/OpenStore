/*
 * 前台页面路径归类 + 各数据源的新鲜度定义。
 *
 * 后台「数据新鲜度」面板用它把访客表里的原始路径聚合成可读的页面名，
 * 详情页（/topics/xxx、/articles/xxx…）归并到对应的列表页，榜单保留到二级路径。
 */
const FRESHNESS_SOURCES = [
  // 只统计「前台访客真的会读到」的数据；访客统计、后端进程这类纯后台信息不再出现在这里
  { key: 'apps', label: '应用库', table: 'apps', column: 'updated_at', ttl: 86400 },
  { key: 'blogs', label: '文章', table: 'blogs', column: 'updated_at', ttl: 604800 },
  { key: 'announcements', label: '公告', table: 'announcements', column: 'updated_at', ttl: 604800 },
  { key: 'comments', label: '评论', table: 'comments', column: 'created_at', ttl: 86400 },
  { key: 'friend_links', label: '友情链接', table: 'friend_links', column: 'updated_at', ttl: 2592000 },
  { key: 'group_chats', label: '群聊', table: 'group_chats', column: 'updated_at', ttl: 2592000 }
];

// 页面访问新鲜度：访客表里存的是前台页面路径，这里聚合成「哪个页面最近被访问、近 30 天被访问多少次」。
// 详情页（/topics/xxx、/articles/xxx…）归并到对应的列表页，榜单保留到二级路径。
const PAGE_LABELS = {
  '/': '首页',
  '/exploration': '探索（市场数据）',
  '/apps': '应用列表',
  '/app-cards': '应用卡片',
  '/topics': '专题列表',
  '/updates': '更新',
  '/articles': '文章',
  '/about': '关于',
  '/submit': '投稿',
  '/music': '音乐',
  '/dashboard': '应用详情',
  '/system-status': '系统状态',
  '/rank/total': '总下载榜',
  '/rank/growth': '下载增长榜',
  '/rank/history': '历史榜单',
  '/rank/non-huawei': '非华为榜单'
};

const normalizeVisitorPath = (rawPath) => {
  const path = String(rawPath || '/').split('?')[0].split('#')[0] || '/';
  if (path === '/') return '/';
  const segments = path.split('/').filter(Boolean);
  if (segments[0] === 'rank' && segments.length > 2) return `/${segments.slice(0, 2).join('/')}`;
  if (segments.length > 1 && segments[0] !== 'rank') return `/${segments[0]}`;
  return path;
};

module.exports = { FRESHNESS_SOURCES, PAGE_LABELS, normalizeVisitorPath };
