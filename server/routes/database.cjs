/*
 * 后台「数据库管理」：概览 / 表数据浏览 / 维护 / 备份 / 只读 SQL
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { DB_FILE_PATH, dbAllAsync, dbGetAsync, dbRunAsync, quoteIdent, listUserTables, countRows } = require('../lib/db-helpers.cjs');
const { DB_MAINTENANCE_ACTIONS } = require('../lib/db-maintenance.cjs');

const router = express.Router();

/*
 * ============================ 数据库管理 ============================
 * 后台「数据 → 数据库管理」用的接口：概览 / 表数据浏览 / 维护 / 备份 / 只读 SQL。
 *
 * 几条硬规矩：
 *   1. 全部要管理员登录（requireAuth），并写操作日志；
 *   2. 表名、列名一律先跟 sqlite_master / PRAGMA table_info 对一遍再用，
 *      拼 SQL 前用 quoteIdent 转义，不给注入留口子；
 *   3. SQL 控制台只放行 SELECT / WITH / EXPLAIN / PRAGMA，且只能单条语句，
 *      结果最多 500 行 —— 避免在后台里误删线上数据；
 *   4. 备份走 VACUUM INTO，拿到的是完整一致快照（WAL 下也安全）。
 */
router.get('/api/admin/database/overview', requireAuth, async (req, res) => {
  try {
    const [versionRow, pageSizeRow, pageCountRow, freelistRow, journalRow, autoVacuumRow, encodingRow] =
      await Promise.all([
        dbGetAsync('SELECT sqlite_version() AS v'),
        dbGetAsync('PRAGMA page_size'),
        dbGetAsync('PRAGMA page_count'),
        dbGetAsync('PRAGMA freelist_count'),
        dbGetAsync('PRAGMA journal_mode'),
        dbGetAsync('PRAGMA auto_vacuum'),
        dbGetAsync('PRAGMA encoding')
      ]);

    const tables = await listUserTables();
    const tableInfos = [];
    let totalRows = 0;
    for (const name of tables) {
      const [rows, cols, indexes] = await Promise.all([
        countRows(name),
        dbAllAsync(`PRAGMA table_info(${quoteIdent(name)})`),
        dbAllAsync(`PRAGMA index_list(${quoteIdent(name)})`)
      ]);
      totalRows += rows;
      tableInfos.push({ name, rows, columns: cols.length, indexes: indexes.length });
    }
    tableInfos.sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));

    const objects = await dbAllAsync(
      `SELECT type, COUNT(*) AS c FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' GROUP BY type`
    );
    const objectCount = (type) => Number(objects.find((o) => o.type === type)?.c || 0);

    let fileSize = 0;
    let fileMtime = null;
    let walBytes = 0;
    let shmBytes = 0;
    try {
      const stat = fs.statSync(DB_FILE_PATH);
      fileSize = stat.size;
      fileMtime = stat.mtime.toISOString();
    } catch {
      /* 文件读不到就留空，界面显示「—」 */
    }
    // WAL 模式下的 -wal / -shm 是旁挂文件：主库看起来变小是正常的，实际占用要把 wal 算上
    for (const [suffix, setter] of [['-wal', (n) => (walBytes = n)], ['-shm', (n) => (shmBytes = n)]]) {
      try {
        setter(fs.statSync(DB_FILE_PATH + suffix).size);
      } catch {
        setter(0);
      }
    }

    const pageSize = Number(pageSizeRow?.page_size || 0);
    res.json({
      file: { path: DB_FILE_PATH, sizeBytes: fileSize, mtime: fileMtime, walBytes, shmBytes },
      sqlite: { version: versionRow?.v || '' },
      pragmas: {
        pageSize,
        pageCount: Number(pageCountRow?.page_count || 0),
        freelistCount: Number(freelistRow?.freelist_count || 0),
        journalMode: journalRow?.journal_mode || '',
        autoVacuum: Number(autoVacuumRow?.auto_vacuum ?? 0),
        encoding: encodingRow?.encoding || ''
      },
      // 空闲页占比高说明删过大量数据，VACUUM 能收回磁盘（线上是 20 万+ 的访客表）
      freeBytes: pageSize * Number(freelistRow?.freelist_count || 0),
      counts: {
        tables: objectCount('table'),
        indexes: objectCount('index'),
        views: objectCount('view'),
        triggers: objectCount('trigger'),
        totalRows
      },
      tables: tableInfos
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/database/tables/:name', requireAuth, async (req, res) => {
  try {
    const name = String(req.params.name || '');
    if (!(await listUserTables()).includes(name)) {
      return res.status(404).json({ error: '表不存在' });
    }

    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const columns = await dbAllAsync(`PRAGMA table_info(${quoteIdent(name)})`);
    const columnNames = columns.map((c) => c.name);

    let orderBy = columnNames.includes(String(req.query.orderBy || '')) ? String(req.query.orderBy) : '';
    let order = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    if (!orderBy) {
      // 没指定排序时，INTEGER PRIMARY KEY（rowid 别名）自增最自然：默认最新的排最前
      const pk = columns.find((c) => Number(c.pk || 0) > 0 && /INT/i.test(String(c.type || '')));
      if (pk) {
        orderBy = pk.name;
        order = 'DESC';
      }
    }
    const keyword = String(req.query.q || '').trim();

    let whereSql = '';
    let whereParams = [];
    if (keyword) {
      // 只在文本类列里搜，且最多取 8 列，避免 20 万行表上拼出超长的 WHERE
      const searchable = columns
        .filter((c) => !/INT|REAL|NUM|BLOB/i.test(String(c.type || '')))
        .map((c) => c.name)
        .slice(0, 8);
      if (searchable.length) {
        whereSql = ` WHERE ${searchable.map((c) => `CAST(${quoteIdent(c)} AS TEXT) LIKE ?`).join(' OR ')}`;
        whereParams = searchable.map(() => `%${keyword}%`);
      }
    }

    const totalRow = await dbGetAsync(`SELECT COUNT(*) AS c FROM ${quoteIdent(name)}${whereSql}`, whereParams);
    const orderSql = orderBy ? ` ORDER BY ${quoteIdent(orderBy)} ${order}` : '';
    const rows = await dbAllAsync(
      `SELECT * FROM ${quoteIdent(name)}${whereSql}${orderSql} LIMIT ? OFFSET ?`,
      [...whereParams, pageSize, (page - 1) * pageSize]
    );

    res.json({
      table: name,
      page,
      pageSize,
      total: Number(totalRow?.c || 0),
      columns: columns.map((c) => ({ name: c.name, type: c.type || '', pk: Number(c.pk || 0) > 0 })),
      rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/api/admin/database/maintenance', requireAuth, async (req, res) => {
  const action = String(req.body?.action || '');
  const entry = DB_MAINTENANCE_ACTIONS[action];
  if (!entry) return res.status(400).json({ error: '不支持的维护操作' });

  const startedAt = Date.now();
  try {
    const rows = await dbAllAsync(entry.sql);
    const durationMs = Date.now() - startedAt;
    logAction(req.user?.username, 'maintenance', 'database', action, { durationMs });
    res.json({ action, label: entry.label, durationMs, rows: rows.slice(0, 50) });
  } catch (err) {
    // VACUUM / REINDEX 在并发写入时可能撞上 SQLITE_BUSY，把原始错误给出去更好排查
    res.status(500).json({ error: err.message, action });
  }
});

/*
 * 发送备份文件：客户端支持 gzip 就压缩后再传（SQLite 里重复文本多，79MB → 14MB，
 * 压缩约 0.4 秒；浏览器按 Content-Encoding 透明解压，存下来仍是能直接打开的 .db）。
 * 没带 Accept-Encoding 的客户端走 res.download，保留 Content-Length / Range 语义。
 */
const ACCEPTS_GZIP_RE = /\bgzip\b/i;

/* 清理临时快照：Windows 上句柄可能还没释放，unlink 失败要重试，否则会攒下残留 */
const removeTempFile = (file, attempt = 0) => {
  fs.unlink(file, (err) => {
    if (!err || err.code === 'ENOENT') return;
    if (attempt >= 5) {
      console.error('[database] 清理备份临时文件失败:', file, err.message);
      return;
    }
    setTimeout(() => removeTempFile(file, attempt + 1), 200);
  });
};

const sendBackupFile = (req, res, file, downloadName) => {
  // 正常发完或客户端中途断开都清临时文件（重复清理无副作用）
  res.on('close', () => removeTempFile(file));
  res.setHeader('Cache-Control', 'no-store');

  if (!ACCEPTS_GZIP_RE.test(String(req.headers['accept-encoding'] || ''))) {
    res.download(file, downloadName, () => removeTempFile(file));
    return;
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Encoding', 'gzip');
  // 同一地址对不同 Accept-Encoding 的响应不同，给中间缓存提示
  res.setHeader('Vary', 'Accept-Encoding');

  const source = fs.createReadStream(file);
  source.on('error', () => res.destroy());
  // 等级 1：压到 18% 已经够，再往上只多省两个百分点、CPU 却翻倍
  source.pipe(zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED })).pipe(res);
};

router.get('/api/admin/database/backup', requireAuth, async (req, res) => {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const target = path.join(os.tmpdir(), `visitors-backup-${stamp}-${crypto.randomBytes(4).toString('hex')}.db`);
  try {
    // VACUUM INTO 生成一致快照：比起直接发原文件，WAL 里的未合并数据也会包含进去
    await dbRunAsync('VACUUM INTO ?', [target]);
    logAction(req.user?.username, 'backup', 'database', null, { file: path.basename(target) });
    sendBackupFile(req, res, target, `visitors-${stamp}.db`);
  } catch (err) {
    removeTempFile(target);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/database/query', requireAuth, async (req, res) => {
  const raw = String(req.body?.sql || '').trim();
  if (!raw) return res.status(400).json({ error: 'SQL 不能为空' });

  const withoutTrailing = raw.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return res.status(400).json({ error: '只允许单条语句' });
  }
  if (!/^(select|with|explain|pragma)\b/i.test(withoutTrailing)) {
    return res.status(400).json({ error: '只允许 SELECT / WITH / EXPLAIN / PRAGMA 查询' });
  }
  // PRAGMA 带 "=" 是赋值写法（能改库设置），查询台只该用来"看"
  if (/^pragma\b/i.test(withoutTrailing) && withoutTrailing.includes('=')) {
    return res.status(400).json({ error: 'PRAGMA 只允许查询写法；要改设置请用上面的维护按钮' });
  }

  const startedAt = Date.now();
  try {
    // SELECT/WITH 外面再套一层 LIMIT，防止一条 SELECT * 把整张表拉进内存
    const sql = /^(select|with)\b/i.test(withoutTrailing)
      ? `SELECT * FROM (${withoutTrailing}) LIMIT 501`
      : withoutTrailing;
    const rows = await dbAllAsync(sql);
    const truncated = rows.length > 500;
    res.json({
      durationMs: Date.now() - startedAt,
      rowCount: Math.min(rows.length, 500),
      truncated,
      columns: rows.length ? Object.keys(rows[0]) : [],
      rows: rows.slice(0, 500)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
