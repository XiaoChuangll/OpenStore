/**
 * 关于页面的共享类型、默认值与选项表。
 *
 * 前台关于页、后台「关于页面」管理、以及服务端兜底都围绕这几个结构：
 *   TechStackItem  技术栈标签（color 直接用 Element Plus 的标签色名）
 *   SocialLinkItem 作者的社交入口（icon 是稳定的字符串名，由 AboutSocialIcon 负责渲染）
 *
 * 图标存名字而不是存 SVG：换图标只要改这里的映射，已经保存过的数据不用动。
 */
export type TagColor = 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface TechStackItem {
  name: string;
  color: TagColor;
}

export type SocialIconName = 'github' | 'link' | 'mail' | 'chat' | 'doc' | 'video' | 'home' | 'star' | 'user';

/** 自动取值的入口：地址/文字由当前配置决定，不用手填 */
export type SocialAutoKind = 'stars' | 'repo' | 'author';

export interface SocialLinkItem {
  label: string;
  url: string;
  icon: SocialIconName;
  /** 设了就按 auto 自动解析（见 resolveSocialLinks） */
  auto?: SocialAutoKind;
}

/**
 * 鸣谢名单里的一位贡献者。
 * github 存的是**用户名**（不是主页地址）——头像直接由用户名拼出来，不用另存一份，
 * 换了头像前台自动就跟着变。
 */
export interface Contributor {
  github: string;
  /** 展示名；留空就用 GitHub 用户名 */
  name?: string;
}

/** 技术栈标签可选配色（和 Element Plus 的 tag type 一一对应） */
export const TECH_COLOR_OPTIONS: { value: TagColor; label: string }[] = [
  { value: 'primary', label: '蓝色' },
  { value: 'success', label: '绿色' },
  { value: 'warning', label: '橙色' },
  { value: 'danger', label: '红色' },
  { value: 'info', label: '灰色' },
];

/** 社交图标可选值 */
export const SOCIAL_ICON_OPTIONS: { value: SocialIconName; label: string }[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'link', label: '链接' },
  { value: 'mail', label: '邮箱' },
  { value: 'chat', label: '聊天 / 群组' },
  { value: 'doc', label: '文档' },
  { value: 'video', label: '视频' },
  { value: 'home', label: '主页' },
  { value: 'star', label: '收藏' },
  { value: 'user', label: '作者' },
];

/** 「社交入口」里可直接添加的自动项 */
export const SOCIAL_AUTO_OPTIONS: { value: SocialAutoKind; label: string; icon: SocialIconName; hint: string }[] = [
  { value: 'stars', label: '星标', icon: 'star', hint: '自动取仓库星数' },
  { value: 'repo', label: '仓库', icon: 'link', hint: '自动取仓库地址' },
  { value: 'author', label: '作者', icon: 'user', hint: '自动取作者名称' },
];

/** 服务端没给数据时的前端兜底（与服务端 about-defaults.cjs 保持一致） */
export const DEFAULT_TECH_STACK: TechStackItem[] = [
  { name: 'Vue 3', color: 'success' },
  { name: 'TypeScript', color: 'primary' },
  { name: 'Vite', color: 'warning' },
  { name: 'Element Plus', color: 'primary' },
  { name: 'Pinia', color: 'warning' },
  { name: 'Apache ECharts', color: 'danger' },
  { name: 'Node.js', color: 'success' },
  { name: 'Express', color: 'info' },
  { name: 'SQLite', color: 'info' },
];

export const DEFAULT_SOCIAL_LINKS: SocialLinkItem[] = [
  { label: '', url: '', icon: 'star', auto: 'stars' },
  { label: '', url: '', icon: 'link', auto: 'repo' },
  { label: '', url: '', icon: 'user', auto: 'author' },
  { label: 'GitHub', url: 'https://github.com/XiaoChuangll', icon: 'github' },
];

/** 鸣谢名单默认为空，由后台自己维护 */
export const DEFAULT_CONTRIBUTORS: Contributor[] = [];

const TAG_COLORS: TagColor[] = ['primary', 'success', 'warning', 'danger', 'info'];

/** 清洗后台传来的技术栈：丢掉落库失败 / 被清空的条目，颜色收敛到合法值 */
export const normalizeTechStack = (value: unknown): TechStackItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<TechStackItem> | null;
      const name = String(raw?.name ?? '').trim();
      if (!name) return null;
      const color = TAG_COLORS.includes(raw?.color as TagColor) ? (raw!.color as TagColor) : 'primary';
      return { name, color };
    })
    .filter((item): item is TechStackItem => item !== null);
};

/** 清洗后台传来的社交链接：没有合法 http(s) 地址的条目直接丢掉 */
export const normalizeSocialLinks = (value: unknown): SocialLinkItem[] => {
  if (!Array.isArray(value)) return [];
  const icons = SOCIAL_ICON_OPTIONS.map((option) => option.value);
  const autos = SOCIAL_AUTO_OPTIONS.map((option) => option.value);
  return value
    .map((item) => {
      const raw = item as Partial<SocialLinkItem> | null;
      const url = String(raw?.url ?? '').trim();
      const auto = autos.includes(raw?.auto as SocialAutoKind) ? (raw!.auto as SocialAutoKind) : undefined;
      // 自动项允许留空（前台按当前配置补），手填项必须有合法地址
      if (!auto && !/^https?:\/\//i.test(url)) return null;
      const label = String(raw?.label ?? '').trim() || url.replace(/^https?:\/\//i, '');
      const icon = icons.includes(raw?.icon as SocialIconName) ? (raw!.icon as SocialIconName) : 'link';
      return auto ? { label, url, icon, auto } : { label, url, icon };
    })
    .filter((item): item is SocialLinkItem => item !== null);
};

/** 解析自动项所需的当前配置 */
export interface SocialResolveContext {
  authorName?: string;
  authorGithub?: string;
  /** owner/repo */
  repoName?: string;
  repoStars?: number | null;
}

/**
 * 把配置好的社交入口解析成可直接渲染的列表。
 * 自动项按当前配置补上地址与默认文案；所需数据缺失的自动项直接丢掉，不留半成品。
 */
export const resolveSocialLinks = (
  value: unknown,
  context: SocialResolveContext
): SocialLinkItem[] => {
  const list = normalizeSocialLinks(value);
  const repo = (context.repoName || '').replace(/^\/+/, '');
  const repoUrl = repo ? `https://github.com/${repo}` : '';
  const repoLabel = repo ? repo.split('/').pop() || repo : '';

  return list
    .map((item) => {
      if (!item.auto) return item;
      if (item.auto === 'stars') {
        if (!repoUrl) return null;
        const label = item.label || (context.repoStars != null ? String(context.repoStars) : '星标');
        return { ...item, label, url: `${repoUrl}/stargazers` };
      }
      if (item.auto === 'repo') {
        if (!repoUrl) return null;
        return { ...item, label: item.label || repoLabel, url: repoUrl };
      }
      // author：没有主页时仍展示名字（渲染成不可点的胶囊）
      const author = (context.authorName || '').trim();
      if (!author) return null;
      return { ...item, label: item.label || author, url: (context.authorGithub || '').trim() };
    })
    .filter((item): item is SocialLinkItem => item !== null);
};

/* ---------------------------------------------------------------- 鸣谢 */

/**
 * 从「用户输入」里取出 GitHub 用户名。
 * 后台允许直接粘主页地址，也允许只写用户名，两种都要能认：
 *   https://github.com/XiaoChuangll/  → XiaoChuangll
 *   github.com/XiaoChuangll           → XiaoChuangll
 *   XiaoChuangll                      → XiaoChuangll
 */
export const githubLoginFrom = (input: string): string => {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  let value = raw;
  try {
    // 没写协议时补一个，方便把 "github.com/xxx" 也当 URL 解析
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (/(^|\.)github\.com$/i.test(url.hostname)) {
      value = url.pathname.replace(/^\/+/, '');
    }
  } catch {
    // 不是 URL，按纯用户名处理
  }
  return value.split(/[/?#]/)[0].replace(/\.git$/i, '').trim();
};

export const githubProfileUrl = (login: string) => `https://github.com/${githubLoginFrom(login)}`;

/**
 * GitHub 头像地址。
 * 用 github.com/<user>.png 这个官方重定向端点，不需要 token、也没有速率限制；
 * 尺寸给 2 倍展示尺寸，避免高分屏发虚。
 */
export const githubAvatarUrl = (login: string, size = 160) => {
  const user = githubLoginFrom(login);
  return user ? `https://github.com/${user}.png?size=${size}` : '';
};

/** 清洗后台传来的鸣谢名单：没有 GitHub 用户名的条目直接丢掉 */
export const normalizeContributors = (value: unknown): Contributor[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<Contributor> | null;
      const github = githubLoginFrom(String(raw?.github ?? ''));
      if (!github) return null;
      const name = String(raw?.name ?? '').trim();
      return name ? { github, name } : { github };
    })
    .filter((item): item is Contributor => item !== null);
};
