import { describe, it, expect } from 'vitest';
import { compilePatterns, normalizeAllowUa, makeIsAllowedClient } from '../../server/lib/ua-allowlist.cjs';

const PARTNER_UA =
  'top.rayawa.dashboard(3.1.0) | OpenHarmony-7.0.0.105(26.0.0.105) API:26 | PLR-AL50/PLR-AL50/PLR-AL50/HL1CYBM | phone/HUAWEI Mate 70 Pro %E4%BC%98%E4%BA%AB%E7%89%88/Kirin9020A';

describe('UA 放行名单', () => {
  it('按前缀命中放行的客户端（机型、版本、芯片不同都能命中）', () => {
    const isAllowed = makeIsAllowedClient(compilePatterns('top.rayawa.dashboard'));

    expect(isAllowed(PARTNER_UA)).toBe(true);
    expect(
      isAllowed(
        'top.rayawa.dashboard(3.1.0) | OpenHarmony-7.0.0.105(26.0.0.105) API:26 | ALN-AL80 | phone/HUAWEI Mate 60 Pro/kirin9000s'
      )
    ).toBe(true);
    expect(isAllowed('TOP.RAYAWA.DASHBOARD(3.1.0)')).toBe(true);
  });

  it('前缀必须成词，不能顺带放行同前缀的其它标识', () => {
    const isAllowed = makeIsAllowedClient(compilePatterns('top.rayawa.dashboard'));

    expect(isAllowed('top.rayawa.dashboardx/1.0')).toBe(false);
    expect(isAllowed('top.rayawa.dashboard-scraper/1.0')).toBe(false);
    expect(isAllowed('top.rayawa.dashboard.evil/1.0')).toBe(false);
  });

  it('不碰没配置的 UA', () => {
    const isAllowed = makeIsAllowedClient(compilePatterns('top.rayawa.dashboard'));

    expect(isAllowed('AppGalleryData/2.0')).toBe(false);
    expect(isAllowed('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36')).toBe(false);
    expect(isAllowed('')).toBe(false);
  });

  it('多个前缀、多余空白与大小写都能处理', () => {
    const isAllowed = makeIsAllowedClient(compilePatterns(' top.rayawa.dashboard , com.example.client '));

    expect(isAllowed(PARTNER_UA)).toBe(true);
    expect(isAllowed('com.example.client/2.0 (Linux)')).toBe(true);
    expect(isAllowed('com.example.other/2.0')).toBe(false);
  });

  it('空配置不放行任何 UA', () => {
    const isAllowed = makeIsAllowedClient(compilePatterns(''));

    expect(isAllowed(PARTNER_UA)).toBe(false);
    expect(compilePatterns('   ')).toHaveLength(0);
  });

  it('正则元字符按字面量匹配', () => {
    const isAllowed = makeIsAllowedClient(compilePatterns('app+v2'));
    expect(isAllowed('app+v2 (x)')).toBe(true);
    expect(isAllowed('apppv2 (x)')).toBe(false);
  });
});

describe('放行名单输入收敛', () => {
  it('一行一个、逗号分隔都能解析，去重且小写', () => {
    expect(normalizeAllowUa('Top.Rayawa.Dashboard\ncom.example.app')).toBe('top.rayawa.dashboard, com.example.app');
    expect(normalizeAllowUa('a.b, a.b ,  a.b')).toBe('a.b');
  });

  it('粘贴整条 UA 时自动截到开头的包名', () => {
    expect(normalizeAllowUa(PARTNER_UA)).toBe('top.rayawa.dashboard');
    expect(
      normalizeAllowUa('top.rayawa.dashboard(3.1.0) | OpenHarmony-7.0.0.105 | phone/HUAWEI Mate 70 Pro')
    ).toBe('top.rayawa.dashboard');
  });

  it('丢掉空白与标点碎片，不让它们变成能匹配任何 UA 的条目', () => {
    expect(normalizeAllowUa('\n\n , |, ---, (x)\n')).toBe('');
  });

  it('空输入得到空字符串', () => {
    expect(normalizeAllowUa('')).toBe('');
    expect(normalizeAllowUa(null)).toBe('');
    expect(normalizeAllowUa(undefined)).toBe('');
  });

  it('单条过长会截断，避免塞进异常长的条目', () => {
    const long = 'a'.repeat(300);
    expect(normalizeAllowUa(long)).toHaveLength(120);
  });

  it('最多保留 50 条', () => {
    const many = Array.from({ length: 60 }, (_, i) => `com.demo.app${i}`).join('\n');
    expect(normalizeAllowUa(many).split(', ')).toHaveLength(50);
  });
});
