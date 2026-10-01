import { ref } from 'vue';
import { ElMessage } from 'element-plus';

/**
 * 分享 / 链接卡片（og:image、twitter:image）需要带的信息。
 *
 * 规则：
 * - 探索、应用列表、榜单、专题列表、关于… 这类「栏目页」→ 带网站 logo（/og-image.png）
 * - 应用详情、更新详情、专题详情、文章详情这类「信息页」→ 带当前页面的资源图片
 *   （应用图标 / 文章封面）和它自己的文字信息（名称、开发者、简介）
 *
 * 信息页在数据加载完成后调用 setPageShareMeta 注册，离开时自动清空。
 */

export const SITE_NAME = 'OpenStore';
/** 网站 logo（也是默认分享图） */
export const SITE_LOGO = '/og-image.png';
export const SITE_DEFAULT_TITLE = 'OpenStore | 鸿蒙应用市场面板';
export const SITE_DEFAULT_DESCRIPTION =
  'OpenStore 提供华为应用市场看板、鸿蒙应用看板与鸿蒙应用数据面板，支持应用探索、榜单排行与更新动态。';

export interface PageShareMeta {
  /** 卡片标题（不含站点后缀） */
  title: string;
  /** 卡片描述 */
  description?: string;
  /** 当前页面的资源图片：应用图标 / 文章封面 / 专题首图 */
  image?: string;
  /** 注册它的页面地址：只有还在这个页面上时才生效（防止 keep-alive 缓存里的旧信息串页） */
  ownerKey?: string;
}

export const pageShareMeta = ref<PageShareMeta | null>(null);

export const setPageShareMeta = (meta: PageShareMeta | null) => {
  pageShareMeta.value = meta
    ? {
        ...meta,
        image: preferPngForShare(meta.image),
        ownerKey: `${window.location.pathname}${window.location.search}`,
      }
    : null;
};

/**
 * 分享图尽量用 PNG：应用图标上游给的是 webp，微信能认，但 QQ / QQ 空间对 webp 支持很差。
 * 同路径把后缀换成 .png 同样的图还能取到（已实测多枚图标），兼容性更稳。
 */
export const preferPngForShare = (url?: string | null) => {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return '';
  return raw.replace(/\.webp(\?.*)?$/i, '.png$1');
};

export const clearPageShareMeta = () => {
  pageShareMeta.value = null;
};

/** 相对路径补成绝对地址，分享卡片（微信 / QQ / Twitter）只认绝对图片地址 */
export const absoluteAssetUrl = (url?: string | null) => {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;
  const origin = window.location.origin;
  return raw.startsWith('/') ? `${origin}${raw}` : `${origin}/${raw}`;
};

/** 截断过长的简介，卡片描述太长会被平台自己裁掉，不如先裁干净 */
const clampText = (text: string, max = 110) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
};

type RouteLike = {
  path: string;
  fullPath: string;
  query: Record<string, any>;
  meta: Record<string, any>;
};

export interface ShareInfo {
  /** 分享卡片标题：栏目标题（OpenStore | 探索）或信息页自己的标题（应用名称 / 文章标题） */
  title: string;
  description: string;
  image: string;
  url: string;
  /** 浏览器标签标题（信息页也带上站点名，便于多标签区分） */
  documentTitle: string;
}

/** 最近一次算出来的分享信息（路由切换 / 信息页注册时刷新），分享按钮直接用它 */
export const currentShareInfo = ref<ShareInfo | null>(null);

/** 当前页面的分享信息：信息页用自己的资源图和文字，其它页面统一用网站 logo */
export const resolveShareInfo = (route: RouteLike): ShareInfo => {
  /*
    只在「信息页自己注册的信息仍然属于当前地址」时用它。
    前台视图走 keep-alive，离开详情页不会卸载组件，注册过的信息会留在内存里，
    没有这一层校验的话，回到探索 / 应用 / 专题列表等页面时分享图会被上一条详情占住；
    这些页面按要求一律强制用网站 logo。
  */
  const registered = pageShareMeta.value;
  const share = registered && (!registered.ownerKey || registered.ownerKey === route.fullPath) ? registered : null;
  const url = `${window.location.origin}${route.fullPath || window.location.pathname}`;

  if (share && share.title) {
    /*
     * 有些页面注册的标题本身就带站点名（例如音乐页的「OpenStore | 音乐」），
     * 这里再补一次就会变成「OpenStore | OpenStore | 音乐」，先判一下。
     */
    const shareTitle = share.title.startsWith(SITE_NAME) ? share.title : `${SITE_NAME} | ${share.title}`;
    return {
      title: share.title,
      documentTitle: shareTitle,
      description: clampText(share.description || (route.meta?.description as string) || SITE_DEFAULT_DESCRIPTION),
      image: absoluteAssetUrl(share.image) || absoluteAssetUrl(SITE_LOGO),
      url,
    };
  }

  const queryTitle = typeof route.query?.title === 'string' ? route.query.title : '';
  const pageTitle = queryTitle || (route.meta?.title as string) || '';
  return {
    title: pageTitle ? `${SITE_NAME} | ${pageTitle}` : SITE_DEFAULT_TITLE,
    documentTitle: pageTitle ? `${SITE_NAME} | ${pageTitle}` : SITE_DEFAULT_TITLE,
    description: clampText((route.meta?.description as string) || SITE_DEFAULT_DESCRIPTION),
    image: absoluteAssetUrl(SITE_LOGO),
    url,
  };
};

/** 把分享信息写进 head 的 meta（og / twitter / description），并同步 document.title */
export const applyPageMeta = (route: RouteLike) => {
  const info = resolveShareInfo(route);
  currentShareInfo.value = info;
  const isSiteLogo = info.image === absoluteAssetUrl(SITE_LOGO);

  const setMeta = (name: string, content: string, property = false) => {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      if (property) el.setAttribute('property', name);
      else el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  /** image 相关的标签按当前图重建：用网站 logo 时给尺寸，用应用图标等资源图时不写死尺寸 */
  const setImageSizeTags = () => {
    const specs: Array<[string, string]> = isSiteLogo
      ? [
          ['og:image:type', 'image/png'],
          ['og:image:width', '630'],
          ['og:image:height', '630'],
        ]
      : [];
    (['og:image:type', 'og:image:width', 'og:image:height'] as string[]).forEach((name) => {
      const el = document.head.querySelector(`meta[property="${name}"]`);
      const hit = specs.find(([key]) => key === name);
      if (hit) setMeta(hit[0], hit[1], true);
      else if (el) el.remove();
    });
    setMeta('og:image:alt', isSiteLogo ? SITE_NAME : info.title, true);
  };

  const setImageSrcLink = () => {
    let el = document.head.querySelector('link[rel="image_src"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'image_src');
      document.head.appendChild(el);
    }
    el.setAttribute('href', info.image);
  };

  /** QQ / QQ 空间读的是 Schema.org 微数据（itemprop），不是 name/property */
  const setItemProp = (name: string, content: string) => {
    let el = document.head.querySelector(`meta[itemprop="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('itemprop', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  document.title = info.documentTitle;
  setMeta('description', info.description);
  setMeta('og:title', info.title, true);
  setMeta('og:description', info.description, true);
  setMeta('og:url', info.url, true);
  setMeta('og:image', info.image, true);
  setMeta('og:image:url', info.image, true);
  setMeta('og:image:secure_url', info.image, true);
  setImageSizeTags();
  setImageSrcLink();
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', info.title);
  setMeta('twitter:description', info.description);
  setMeta('twitter:image', info.image);
  setItemProp('name', info.title);
  setItemProp('description', info.description);
  setItemProp('image', info.image);
};

/** 把图片抓成 File，能带上就带上；跨域取不到（应用图标多数在 CDN 上）就返回 null */
const toShareFile = async (imageUrl: string): Promise<File | null> => {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.size || blob.size > 4 * 1024 * 1024) return null;
    const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '');
    return new File([blob], `openstore-share.${ext}`, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
};

/**
 * 触发一次分享：
 * 1. 系统分享面板（带标题 / 文字 / 链接，能带上图片就一起带）
 * 2. 不支持系统分享时，退回「复制链接 + 文字」到剪贴板
 */
export const shareCurrentPage = async (message = '已复制分享内容') => {
  const info =
    currentShareInfo.value ||
    resolveShareInfo({
      path: window.location.pathname,
      fullPath: `${window.location.pathname}${window.location.search}`,
      query: {},
      meta: { title: document.title.replace(/^OpenStore\s*[|·-]\s*/, '') },
    });

  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  const payload = { title: info.title, text: info.description, url: info.url };

  if (typeof nav.share === 'function') {
    const file = await toShareFile(info.image);
    try {
      if (file && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
        await nav.share({ ...payload, files: [file] });
        return;
      }
      await nav.share(payload);
      return;
    } catch (error) {
      // 用户点了取消：什么都不做，也不要再弹出「已复制」
      const name = (error as { name?: string })?.name;
      if (name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${info.title}\n${info.description}\n${info.url}`);
    ElMessage.success(message);
  } catch {
    ElMessage.error('分享失败，请手动复制地址栏链接');
  }
};

/**
 * 应用分享信息：标题就是应用名称、副标题（描述）用「应用简介」、图用应用图标。
 * 注意用的是简介（上游 brief_desc：一句话短简介），不是详情页里的长「应用说明」。
 */
export const buildAppShareMeta = (app: Record<string, any>): PageShareMeta => ({
  title: app?.name || '应用详情',
  description:
    app?.brief_desc || app?.briefDesc || app?.short_desc || app?.intro || app?.description || app?.kind_name || '',
  image: app?.icon_url || app?.icon || '',
});
