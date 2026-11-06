/*
 * 结构化数据（JSON-LD）。
 *
 * 详情页的服务端 HTML 只有 meta、没有正文，搜索引擎难以判断页面讲的是什么。
 * 结构化数据用机器可读的方式补上「这是什么、谁做的、评分多少」，
 * 是这类纯前端渲染站点性价比最高的一步。
 *
 * 用到的字段都来自实际上游响应（应用）或数据库（文章）；缺字段就整块省略，
 * 不编造数值——宁可不给，也不给错。
 */

/**
 * 注入 <script type="application/ld+json">。
 *
 * 必须转义 `</script>`：JSON 文本里若出现该序列会提前结束脚本块，
 * 应用简介、文章正文这类可控性较低的内容都可能带上它。
 */
const applyJsonLdToHtml = (html, jsonLd) => {
  if (!jsonLd) return html;
  const json = JSON.stringify(jsonLd).replace(/<\//g, '<\\/');
  const tag = `<script type="application/ld+json">${json}</script>`;
  const re = /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</head>', `${tag}\n</head>`);
};

/** 数值字段转正数，无效返回 null */
const positiveNumber = (value) => {
  const n = Number(String(value == null ? '' : value).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * 应用结构化数据（SoftwareApplication）。
 *
 * @param {object} info 上游应用信息
 * @param {object} context { url, name, description, image, siteName }
 * @returns {object|null}
 */
const buildAppJsonLd = (info, context = {}) => {
  if (!info || !(info.name || context.name)) return null;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: String(info.name || context.name),
    // 鸿蒙应用；上游没有操作系统字段，这里按站点定位固定声明
    operatingSystem: 'HarmonyOS'
  };

  const description = info.brief_desc || info.briefDesc || info.short_desc || info.intro || context.description;
  if (description) data.description = String(description).slice(0, 300);
  if (context.url) data.url = context.url;
  if (context.image) data.image = context.image;

  const kindType = String(info.kind_type_name || '').trim();
  const kindName = String(info.kind_name || '').trim();
  if (kindType || kindName) data.applicationCategory = [kindType, kindName].filter(Boolean).join(' / ');
  if (info.version) data.softwareVersion = String(info.version);

  const developer = String(info.developer_name || info.dev_en_name || info.supplier || '').trim();
  if (developer) data.author = { '@type': 'Organization', name: developer };

  // 免费/付费：price 为 "0" 视为免费
  const price = String(info.price == null ? '' : info.price).trim();
  if (price !== '') {
    data.offers = { '@type': 'Offer', price, priceCurrency: 'CNY' };
  }

  const rating = positiveNumber(info.info_score) || positiveNumber(info.full_average_rating) || positiveNumber(info.average_rating);
  const ratingCount = positiveNumber(info.total_star_rating_count) || positiveNumber(info.info_rate_count);
  if (rating && ratingCount) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating,
      ratingCount,
      // 上游满分 5 分
      bestRating: 5,
      worstRating: 1
    };
  }

  const downloads = positiveNumber(info.download_count);
  if (downloads) {
    data.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/InstallAction',
      userInteractionCount: downloads
    };
  }

  return data;
};

/**
 * 文章结构化数据（Article）。
 *
 * @param {object} blog 数据库中的文章行
 * @param {object} context { url, name, description, image, siteName }
 * @returns {object|null}
 */
const buildArticleJsonLd = (blog, context = {}) => {
  const headline = String((blog && blog.title) || context.name || '').trim();
  if (!headline) return null;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: headline.slice(0, 110),
    mainEntityOfPage: context.url || undefined,
    publisher: context.siteName
      ? { '@type': 'Organization', name: context.siteName }
      : undefined
  };

  const description = (blog && (blog.seo_description || blog.summary)) || context.description;
  if (description) data.description = String(description).slice(0, 300);
  if (context.url) data.url = context.url;
  if (context.image) data.image = context.image;

  // 已发布时间优先；库中为 UTC，转成 ISO 便于引擎解析
  const published = blog && (blog.published_at || blog.created_at);
  if (published) {
    const date = new Date(String(published).replace(' ', 'T') + 'Z');
    if (!Number.isNaN(date.getTime())) data.datePublished = date.toISOString();
  }
  const updated = blog && blog.updated_at;
  if (updated) {
    const date = new Date(String(updated).replace(' ', 'T') + 'Z');
    if (!Number.isNaN(date.getTime())) data.dateModified = date.toISOString();
  }

  const authors = String((blog && blog.author_names) || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  if (authors.length) data.author = authors.map((name) => ({ '@type': 'Person', name }));

  return JSON.parse(JSON.stringify(data)); // 去掉值为 undefined 的键
};

module.exports = { applyJsonLdToHtml, buildAppJsonLd, buildArticleJsonLd };
