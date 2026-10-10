import { describe, it, expect } from 'vitest';
import { decodePercentEncoded } from '../../src/utils/text';

/*
 * 有些客户端的 UA 会把非 ASCII 内容写成百分号编码，库里存的是原样，
 * 展示前要解出来；但一个坏片段不能让整条 UA 都解不出来。
 */
describe('decodePercentEncoded', () => {
  it('解出 UA 里编码过的机型名，其余部分原样保留', () => {
    const ua =
      'top.rayawa.dashboard(3.1.0) | OpenHarmony-7.0.0.105 | phone/HUAWEI Mate 70 Pro %E4%BC%98%E8%B6%8A%E7%89%88/Kirin9020A';

    expect(decodePercentEncoded(ua)).toBe(
      'top.rayawa.dashboard(3.1.0) | OpenHarmony-7.0.0.105 | phone/HUAWEI Mate 70 Pro 优越版/Kirin9020A'
    );
  });

  it('坏片段（半截 / 非 UTF-8）原样留着，不影响其它片段', () => {
    expect(decodePercentEncoded('a%20b%/c%E4%BC')).toBe('a b%/c%E4%BC');
  });

  it("不把 '+' 当空格（UA 里的 '+' 就是加号）", () => {
    expect(decodePercentEncoded('Mozilla/5.0 + Safari')).toBe('Mozilla/5.0 + Safari');
  });

  it('空值返回空串', () => {
    expect(decodePercentEncoded(undefined)).toBe('');
    expect(decodePercentEncoded(null)).toBe('');
  });
});
