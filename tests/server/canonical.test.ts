import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// 服务端模块是 CJS 且无类型声明，按 CJS 引入
const require = createRequire(import.meta.url);
const { canonicalPathFor } = require('../../server/lib/canonical.cjs');
const { applyCanonicalToHtml } = require('../../server/lib/share-cards.cjs');

/*
 * 详情页存在多个等价入口，重复内容会让搜索引擎分散权重。
 * 这里固定「哪个路径指向哪个权威地址」的规则。
 */
describe('详情页 canonical 目标路径', () => {
  const APP = 'C6917568966145319569';

  it('应用详情自身保持不变', () => {
    expect(canonicalPathFor(`/apps/${APP}`, APP)).toBe(`/apps/${APP}`);
  });

  it('面板与旧卡片路由都指向 /apps/<id>', () => {
    expect(canonicalPathFor('/dashboard', APP)).toBe(`/apps/${APP}`);
    expect(canonicalPathFor(`/app/${APP}`, APP)).toBe(`/apps/${APP}`);
  });

  it('更新详情指向自身（内容与应用详情不同，不能合并）', () => {
    expect(canonicalPathFor(`/updates/app/${APP}`, APP)).toBe(`/updates/app/${APP}`);
    // 即使调用方把同一个 ID 当作 appId 传进来，也不能改写成 /apps/<id>
    expect(canonicalPathFor('/updates/app/other-id', APP)).toBe('/updates/app/other-id');
  });

  it('专题指向自身', () => {
    const topic = '010edcf1e2f34f0a825a0cdb6065b52a';
    expect(canonicalPathFor(`/topics/${topic}`, topic)).toBe(`/topics/${topic}`);
  });

  it('无应用 ID 时一律指向自身', () => {
    expect(canonicalPathFor('/', '')).toBe('/');
    expect(canonicalPathFor('/apps', '')).toBe('/apps');
    expect(canonicalPathFor('/dashboard', '')).toBe('/dashboard');
  });

  it('应用 ID 会做 URL 编码', () => {
    expect(canonicalPathFor('/dashboard', 'a b')).toBe('/apps/a%20b');
  });
});

describe('canonical 标签注入', () => {
  const shell = '<html><head><title>t</title></head><body></body></html>';

  it('head 中没有 canonical 时插入', () => {
    const out = applyCanonicalToHtml(shell, 'https://x.test/apps/1');
    expect(out).toContain('<link rel="canonical" href="https://x.test/apps/1" />');
    expect(out.indexOf('canonical')).toBeLessThan(out.indexOf('</head>'));
  });

  it('已存在 canonical 时替换而不是叠加', () => {
    const withOld = '<html><head><link rel="canonical" href="https://old.test/x" /></head><body></body></html>';
    const out = applyCanonicalToHtml(withOld, 'https://x.test/apps/1');
    expect(out).not.toContain('old.test');
    expect(out.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it('URL 里的特殊字符会被转义', () => {
    const out = applyCanonicalToHtml(shell, 'https://x.test/a?b=1&c=2');
    expect(out).toContain('href="https://x.test/a?b=1&amp;c=2"');
  });

  it('未传 URL 时原样返回', () => {
    expect(applyCanonicalToHtml(shell, '')).toBe(shell);
  });
});
