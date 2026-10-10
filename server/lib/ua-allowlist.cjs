/*
 * 脚本护栏的 UA 放行名单。
 *
 * 判定按前缀匹配（如 top.rayawa.dashboard），命中即不参与「解析不出浏览器名就当脚本」的判定。
 * 单独成文件是为了脱离 sqlite3 / geoip-lite 等依赖做单测。
 */

// 名单条数 / 单条长度上限，避免后台被塞进一份巨大的名单
const MAX_ENTRIES = 50;
const MAX_ENTRY_LEN = 120;

/** 正则转义，让配置里的 . + ( ) 等按字面量匹配 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 编译前缀列表：'a, b' -> [/^a(?![\w.-])/, /^b(?![\w.-])/]
 * 前缀后必须是分隔符，否则 top.rayawa.dashboard 会顺带放行 top.rayawa.dashboardx
 */
const compilePatterns = (raw) =>
  String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((prefix) => new RegExp('^' + escapeRe(prefix) + '(?![\\w.-])'));

/**
 * 把后台输入收敛成规范形式：逗号或换行分隔，去重、小写、去空。
 * 每一条只取第一个空白前的部分，并去掉结尾的 (版本号) ——
 * 这样把整条 UA 粘进来也能得到包名前缀，而不是一段永远匹配不上的长串。
 */
const normalizeAllowUa = (raw) => {
  const seen = new Set();
  const list = [];

  for (const chunk of String(raw ?? '').split(/[\n,]+/)) {
    const first = String(chunk).trim().split(/\s+/)[0] || '';
    const entry = first.replace(/\([^)]*\)$/, '').toLowerCase();
    // 必须由字母数字开头，挡掉「|」「-」这类切出来的碎片
    if (!/^[a-z0-9][a-z0-9._+-]*$/.test(entry)) continue;
    const key = entry.slice(0, MAX_ENTRY_LEN);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(key);
    if (list.length >= MAX_ENTRIES) break;
  }

  return list.join(', ');
};

/** 命中放行名单返回 true；空名单恒为 false */
const makeIsAllowedClient = (patterns) => (ua) => {
  const raw = String(ua || '').trim().toLowerCase();
  return !!raw && patterns.some((re) => re.test(raw));
};

module.exports = { compilePatterns, normalizeAllowUa, makeIsAllowedClient, MAX_ENTRIES };
