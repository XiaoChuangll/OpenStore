/*
 * 读写项目根目录 .env。
 *
 * 两条约定：
 *   - 值不含行尾注释。解析语义与 dotenv 一致：引号内的 # 属于值，
 *     引号外「空白 + #」起为注释（`KEY=a # c` → 值 a、注释 # c；`KEY=a#b` → 值 a#b）。
 *     注释由 readEnvComments 单独返回，供后台页面展示；
 *   - 回写保留文件原貌。只替换目标行的值，注释、空行、键顺序均不变，改一个键不影响其它行。
 *
 * readEnvFile 返回值（供后端逻辑使用）；readEnvComments 返回 key → 注释。
 */
const fs = require('fs');
const path = require('path');

const envFilePath = path.join(__dirname, '..', '..', '.env');

const ENV_LINE_RE = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/;

/**
 * 拆出值与行尾注释。
 * @returns {{value: string, comment: string}}
 */
const splitValueAndComment = (rest) => {
  const text = String(rest == null ? '' : rest);

  // 引号包裹：引号内为值，其后为注释
  const quoted = /^\s*(["'])([\s\S]*?)\1\s*(.*)$/.exec(text);
  if (quoted) {
    return { value: quoted[2], comment: quoted[3].trim() };
  }

  // 未加引号：以「前面是空白」的第一个 # 作为注释起点
  const hashIndex = text.search(/(^|\s)#/);
  if (hashIndex === -1) return { value: text.trim(), comment: '' };

  const cut = text[hashIndex] === '#' ? hashIndex : hashIndex + 1;
  return { value: text.slice(0, cut).trim(), comment: text.slice(cut).trim() };
};

/** 定位注释起点在 rest 中的下标；无注释返回 -1。引号内的 # 忽略 */
const findCommentStart = (rest) => {
  const text = String(rest == null ? '' : rest);
  const quoted = /^(\s*)(["'])([\s\S]*?)\2/.exec(text);
  const searchFrom = quoted ? quoted[0].length : 0;
  const tail = text.slice(searchFrom);
  const hashIndex = tail.search(/(^|\s)#/);
  if (hashIndex === -1) return -1;
  return searchFrom + (tail[hashIndex] === '#' ? hashIndex : hashIndex + 1);
};

/**
 * 解析 .env 内容。
 * @returns {{entries: Array<{key: string, value: string, comment: string, lineIndex: number}>, values: Object, comments: Object}}
 */
function parseEnvContent(content) {
  const lines = String(content || '').split(/\r?\n/);
  const entries = [];
  const values = {};
  const comments = {};

  lines.forEach((line, index) => {
    const match = ENV_LINE_RE.exec(line);
    if (!match) return;
    const key = match[1];
    const { value, comment } = splitValueAndComment(match[2]);
    // 同名键以最后一次为准
    values[key] = value;
    comments[key] = comment;
    entries.push({ key, value, comment, lineIndex: index });
  });

  return { entries, values, comments };
}

/** 读取文件内容，不存在时返回空串 */
function readEnvContent() {
  try {
    return fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
  } catch {
    return '';
  }
}

/** 读取全部键值（不含注释） */
function readEnvFile() {
  return parseEnvContent(readEnvContent()).values;
}

/** 读取全部行尾注释 */
function readEnvComments() {
  return parseEnvContent(readEnvContent()).comments;
}

/**
 * 原地更新一个键。
 * 命中已有行时只替换值，注释与原格式保留；不存在时追加到文件末尾。
 */
function writeEnvKey(key, value) {
  const content = readEnvContent();
  const lines = content.length ? content.split(/\r?\n/) : [];
  const safeValue = String(value == null ? '' : value);
  let found = false;

  const nextLines = lines.map((line) => {
    const match = ENV_LINE_RE.exec(line);
    if (!match || match[1] !== key) return line;
    found = true;

    // 保留 `KEY=` 与值之间的空格，以及注释及其前面的空格
    const rest = match[2];
    const commentStart = findCommentStart(rest);
    const trailing = commentStart === -1 ? '' : rest.slice(commentStart).replace(/\s+$/, '');
    const gapBeforeValue = /^\s*/.exec(rest)[0];
    const separator = trailing ? (commentStart > 0 ? ' ' : '') : '';
    return `${key}=${gapBeforeValue}${safeValue}${separator}${trailing}`;
  });

  if (!found) {
    // 末尾若已有空行，插入到空行之前
    if (nextLines.length && nextLines[nextLines.length - 1] !== '') nextLines.push(`${key}=${safeValue}`);
    else nextLines.splice(Math.max(0, nextLines.length - 1), 0, `${key}=${safeValue}`);
  }

  fs.writeFileSync(envFilePath, nextLines.join('\n'));
}

/** 按键名推断后台展示用的分类 */
function categorizeKey(key) {
  if (/^(DB_|DATABASE_)/.test(key)) return 'database';
  if (/^(REDIS_|CACHE_)/.test(key)) return 'cache';
  if (/^(VUE_APP_|API_|THIRD_|SERVICE_)/.test(key)) return 'api';
  return 'other';
}

module.exports = {
  readEnvFile,
  readEnvComments,
  writeEnvKey,
  categorizeKey
};
