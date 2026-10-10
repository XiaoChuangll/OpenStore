/*
 * 文本展示的小工具。
 */

/**
 * 把文本里「百分号编码」的部分解出来。
 *
 * 有些客户端的 UA 会把非 ASCII 内容写成编码（如机型写成 %E4%BC%98%E8%B6%8A%E7%89%88 = 优越版），
 * 服务端原样存库，直接显示没人看得懂。
 *
 * 按连续的 %XX 片段逐段解，坏片段（半截 / 非 UTF-8）原样保留 ——
 * 整串 decodeURIComponent 碰到一个坏片段就抛错，整条 UA 都解不出来。
 * 只认 %XX，不把 '+' 当空格。
 */
export const decodePercentEncoded = (value?: string | null) => {
  const text = String(value ?? '');
  if (!text.includes('%')) return text;
  return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (chunk) => {
    try {
      return decodeURIComponent(chunk);
    } catch {
      return chunk;
    }
  });
};
