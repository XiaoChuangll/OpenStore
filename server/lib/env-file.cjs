/*
 * 直接读写项目根目录 .env 的轻量工具。
 *
 * 后台改 ADMIN_PASSWORD / 改环境变量时会同步回写文件，让下次重启也生效。
 * 注意这里不做 .env 语法解析之外的任何校验，写入的值原样落盘。
 */
const fs = require('fs');
const path = require('path');

const envFilePath = path.join(__dirname, '..', '..', '.env');

function readEnvFile() {
  if (!fs.existsSync(envFilePath)) return {};
  const content = fs.readFileSync(envFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const obj = {};
  lines.forEach(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) obj[m[1]] = m[2];
  });
  return obj;
}
function writeEnvKey(key, value) {
  const content = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  let found = false;
  const newLines = lines.map(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) newLines.push(`${key}=${value}`);
  fs.writeFileSync(envFilePath, newLines.join('\n'));
}
function categorizeKey(key) {
  if (/^(DB_|DATABASE_)/.test(key)) return 'database';
  if (/^(REDIS_|CACHE_)/.test(key)) return 'cache';
  if (/^(VUE_APP_|API_|THIRD_|SERVICE_)/.test(key)) return 'api';
  return 'other';
}

module.exports = { envFilePath, readEnvFile, writeEnvKey, categorizeKey };
