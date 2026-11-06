import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAppJsonLd, buildArticleJsonLd, applyJsonLdToHtml } = require('../../server/lib/json-ld.cjs');

/*
 * 结构化数据要「宁缺勿错」：字段缺就不给，不能编造；数值要落在合法区间，
 * 否则会触发搜索引擎的富媒体结果校验失败。
 */
describe('应用结构化数据', () => {
  const info = {
    name: '落日山丘',
    brief_desc: '在火车的轰鸣声中开启一趟世界之旅',
    kind_type_name: '游戏',
    kind_name: '益智解谜',
    version: '1.2.55',
    developer_name: '上海胖布丁网络科技有限公司',
    price: '0',
    info_score: '4.5',
    total_star_rating_count: 243,
    download_count: 101118
  };
  const ctx = { url: 'https://x.test/apps/1', image: 'https://x.test/i.png' };

  it('基本字段齐全', () => {
    const ld = buildAppJsonLd(info, ctx);
    expect(ld['@type']).toBe('SoftwareApplication');
    expect(ld.name).toBe('落日山丘');
    expect(ld.operatingSystem).toBe('HarmonyOS');
    expect(ld.applicationCategory).toBe('游戏 / 益智解谜');
    expect(ld.softwareVersion).toBe('1.2.55');
    expect(ld.author).toEqual({ '@type': 'Organization', name: '上海胖布丁网络科技有限公司' });
    expect(ld.url).toBe('https://x.test/apps/1');
  });

  it('评分数值合法且有计数', () => {
    const ld = buildAppJsonLd(info, ctx);
    expect(ld.aggregateRating.ratingValue).toBe(4.5);
    expect(ld.aggregateRating.ratingCount).toBe(243);
    expect(ld.aggregateRating.bestRating).toBe(5);
  });

  it('缺少计数的评分不输出（避免无效的 AggregateRating）', () => {
    const ld = buildAppJsonLd({ name: 'x', info_score: '4.5' }, ctx);
    expect(ld.aggregateRating).toBeUndefined();
  });

  it('评分或计数非法时忽略', () => {
    expect(buildAppJsonLd({ name: 'x', info_score: '0', total_star_rating_count: 10 }, ctx).aggregateRating).toBeUndefined();
    expect(buildAppJsonLd({ name: 'x', info_score: 'abc', total_star_rating_count: 10 }, ctx).aggregateRating).toBeUndefined();
    expect(buildAppJsonLd({ name: 'x', info_score: '4.5', total_star_rating_count: 0 }, ctx).aggregateRating).toBeUndefined();
  });

  it('免费应用输出 price=0', () => {
    expect(buildAppJsonLd(info, ctx).offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'CNY' });
  });

  it('没有应用名时返回 null', () => {
    expect(buildAppJsonLd(null, ctx)).toBeNull();
    expect(buildAppJsonLd({}, {})).toBeNull();
  });

  it('描述过长会被截断', () => {
    const ld = buildAppJsonLd({ name: 'x', brief_desc: 'a'.repeat(900) }, ctx);
    expect(ld.description.length).toBeLessThanOrEqual(300);
  });
});

describe('文章结构化数据', () => {
  const blog = {
    title: '部署教程',
    seo_description: '测试部署教程',
    summary: '摘要',
    author_names: 'admin, 张三',
    published_at: '2026-03-04 08:56:27',
    updated_at: '2026-03-12 09:44:35'
  };
  const ctx = { url: 'https://x.test/articles/a', image: 'https://x.test/c.png', siteName: 'OpenStore' };

  it('基本字段与作者列表', () => {
    const ld = buildArticleJsonLd(blog, ctx);
    expect(ld['@type']).toBe('Article');
    expect(ld.headline).toBe('部署教程');
    expect(ld.publisher).toEqual({ '@type': 'Organization', name: 'OpenStore' });
    expect(ld.author).toEqual([
      { '@type': 'Person', name: 'admin' },
      { '@type': 'Person', name: '张三' }
    ]);
  });

  it('库中的 UTC 时间戳转成 ISO', () => {
    const ld = buildArticleJsonLd(blog, ctx);
    expect(ld.datePublished).toBe('2026-03-04T08:56:27.000Z');
    expect(ld.dateModified).toBe('2026-03-12T09:44:35.000Z');
  });

  it('没有作者时不输出 author', () => {
    const ld = buildArticleJsonLd({ title: 'x' }, ctx);
    expect(ld.author).toBeUndefined();
    expect(ld.datePublished).toBeUndefined();
  });

  it('没有标题时返回 null', () => {
    expect(buildArticleJsonLd({}, ctx)).toBeNull();
    expect(buildArticleJsonLd(null, ctx)).toBeNull();
  });
});

describe('JSON-LD 注入', () => {
  const shell = '<html><head><title>t</title></head><body></body></html>';

  it('插入到 head 内', () => {
    const out = applyJsonLdToHtml(shell, { '@type': 'Thing', name: 'x' });
    expect(out).toContain('application/ld+json');
    expect(out.indexOf('ld+json')).toBeLessThan(out.indexOf('</head>'));
  });

  it('转义 </script>，避免脚本块被提前闭合', () => {
    const payload = { name: 'evil</script><script>alert(1)</script>' };
    const out = applyJsonLdToHtml(shell, payload);
    // 原始序列不能出现在输出的 JSON 文本里
    expect(out).not.toContain('</script><script>');
    // 转义后仍能被还原为原字符串
    const match = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(out);
    expect(match).not.toBeNull();
    const inner = (match as RegExpExecArray)[1];
    expect(JSON.parse(inner.replace(/<\\\//g, '</')).name).toBe(payload.name);
  });

  it('已存在时替换而不是叠加', () => {
    const withOld = '<html><head><script type="application/ld+json">{"a":1}</script></head></html>';
    const out = applyJsonLdToHtml(withOld, { b: 2 });
    expect(out.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(out).not.toContain('"a":1');
  });

  it('未传数据时原样返回', () => {
    expect(applyJsonLdToHtml(shell, null)).toBe(shell);
  });
});
