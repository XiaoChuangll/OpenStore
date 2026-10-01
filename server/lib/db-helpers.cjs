/*
 * sqlite3 回调接口的 Promise 包装 + 后台数据库管理要用的标识符安全处理。
 *
 * 表名/列名一律先跟 sqlite_master / PRAGMA table_info 对一遍再用，
 * 拼 SQL 前用 quoteIdent 转义，不给注入留口子。
 */
const path = require('path');
const db = require('../database.cjs');

const DB_FILE_PATH = path.join(__dirname, '..', 'visitors.db');

const dbAllAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
const dbGetAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const dbRunAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });

/** 表名/列名拼进 SQL 前必须过这一层：双引号包裹 + 转义内部双引号 */
const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

const listUserTables = async () =>
  (await dbAllAsync(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )).map((row) => row.name);

const countRows = async (table) => {
  const row = await dbGetAsync(`SELECT COUNT(*) AS c FROM ${quoteIdent(table)}`);
  return Number(row?.c || 0);
};

module.exports = {
  DB_FILE_PATH,
  dbAllAsync,
  dbGetAsync,
  dbRunAsync,
  quoteIdent,
  listUserTables,
  countRows
};
