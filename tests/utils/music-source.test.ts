import { describe, expect, it } from 'vitest';
import { mustProxy, preferHttps, proxyUrl, upgradeToHttps } from '../../src/utils/music-source';

const HTTP_AUDIO = 'http://m701.music.126.net/2026/song.mp3?vuutv=abc';
const HTTPS_AUDIO = 'https://m701.music.126.net/2026/song.mp3?vuutv=abc';

describe('upgradeToHttps', () => {
  it('把 http 地址升级成同主机 https，查询串保持不变', () => {
    expect(upgradeToHttps(HTTP_AUDIO)).toBe(HTTPS_AUDIO);
  });

  it('https 地址与空值原样返回', () => {
    expect(upgradeToHttps(HTTPS_AUDIO)).toBe(HTTPS_AUDIO);
    expect(upgradeToHttps('')).toBe('');
  });
});

describe('preferHttps', () => {
  it('https 页面上把 http 音频升级成 https（浏览器可直连，不再占服务器带宽）', () => {
    expect(preferHttps(HTTP_AUDIO, true)).toBe(HTTPS_AUDIO);
  });

  it('http 页面（本地开发）保持原样', () => {
    expect(preferHttps(HTTP_AUDIO, false)).toBe(HTTP_AUDIO);
  });

  it('https 地址在任何页面都不改', () => {
    expect(preferHttps(HTTPS_AUDIO, true)).toBe(HTTPS_AUDIO);
    expect(preferHttps(HTTPS_AUDIO, false)).toBe(HTTPS_AUDIO);
  });
});

describe('mustProxy', () => {
  it('只有 https 页面上的 http 地址需要代理兜底', () => {
    expect(mustProxy(HTTP_AUDIO, true)).toBe(true);
  });

  it('http 页面不需要代理', () => {
    expect(mustProxy(HTTP_AUDIO, false)).toBe(false);
  });

  it('https 地址不需要代理', () => {
    expect(mustProxy(HTTPS_AUDIO, true)).toBe(false);
    expect(mustProxy(HTTPS_AUDIO, false)).toBe(false);
  });
});

describe('proxyUrl', () => {
  const parse = (relative: string) => new URL(relative, 'http://localhost');

  it('拼接出带 url 参数的代理地址，且原地址可被服务端原样解析回来', () => {
    const parsed = parse(proxyUrl(HTTP_AUDIO));
    expect(parsed.pathname).toBe('/api/music-proxy');
    expect(parsed.searchParams.get('url')).toBe(HTTP_AUDIO);
  });

  it('带 filename 时会一并编码进去', () => {
    const parsed = parse(proxyUrl(HTTP_AUDIO, '歌名 - 歌手.mp3'));
    expect(parsed.searchParams.get('filename')).toBe('歌名 - 歌手.mp3');
    expect(parsed.searchParams.get('url')).toBe(HTTP_AUDIO);
  });
});
