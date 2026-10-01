/*
 * 环境变量管理与操作日志
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { encrypt, decrypt } = require('../lib/secret.cjs');
const { readEnvFile, writeEnvKey, categorizeKey } = require('../lib/env-file.cjs');

const router = express.Router();

router.get('/api/env', requireAuth, (req, res) => {
  const envFile = readEnvFile();
  db.all(`SELECT key, value_encrypted, category, updated_at FROM env_vars`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = {};
    // Merge env file values and DB (DB values considered secure; send masked)
    const dbKeys = new Set((rows || []).map(r => r.key));
    Object.keys(envFile).forEach(k => {
      if (dbKeys.has(k)) return;
      const cat = categorizeKey(k);
      if (!result[cat]) result[cat] = [];
      result[cat].push({ key: k, value: envFile[k], secure: false, updated_at: null });
    });
    rows.forEach(r => {
      const cat = r.category || categorizeKey(r.key);
      if (!result[cat]) result[cat] = [];
      const val = r.key === 'FEEDBACK_RATE_LIMIT_PER_MINUTE' ? decrypt(r.value_encrypted) : '••••••';
      result[cat].push({ key: r.key, value: val, secure: true, updated_at: r.updated_at });
    });
    res.json(result);
  });
});

router.put('/api/env', requireAuth, (req, res) => {
  const { key, value, category, secure = true } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  const isRateLimit = key === 'FEEDBACK_RATE_LIMIT_PER_MINUTE';
  if (secure || isRateLimit) {
    const enc = encrypt(String(value || ''));
    db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const oldEnc = row ? row.value_encrypted : null;
      const cat = category || categorizeKey(key);
      const upsert = row
        ? `UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`
        : `INSERT INTO env_vars (value_encrypted, category, key) VALUES (?,?,?)`;
      const params = row ? [enc, cat, key] : [enc, cat, key];
      db.run(upsert, params, function(e2){
        if (e2) return res.status(500).json({ error: e2.message });
        db.run(`INSERT INTO env_history (key, old_value_encrypted, new_value_encrypted) VALUES (?,?,?)`, [key, oldEnc, enc]);
        if (!isRateLimit) {
          writeEnvKey(key, String(value || ''));
        }
        logAction(req.user?.username, 'env_set', 'env_vars', null, { key });
        res.json({ ok: true });
      });
    });
  } else {
    writeEnvKey(key, String(value || ''));
    logAction(req.user?.username, 'env_set_plain', 'env_vars', null, { key });
    res.json({ ok: true });
  }
});

router.get('/api/env/history', requireAuth, (req, res) => {
  const key = req.query.key;
  const params = key ? [key] : [];
  const where = key ? 'WHERE key=?' : '';
  db.all(`SELECT * FROM env_history ${where} ORDER BY updated_at DESC LIMIT 100`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.post('/api/env/rollback', requireAuth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  db.get(`SELECT key, old_value_encrypted FROM env_history WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'history not found' });
    const plain = row.old_value_encrypted ? decrypt(row.old_value_encrypted) : '';
    const cat = categorizeKey(row.key);
    const enc = row.old_value_encrypted;
    db.run(`UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`, [enc, cat, row.key], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      if (row.key !== 'FEEDBACK_RATE_LIMIT_PER_MINUTE') {
        writeEnvKey(row.key, plain);
      }
      logAction(req.user?.username, 'env_rollback', 'env_vars', null, { id });
      res.json({ ok: true });
    });
  });
});

// System Logs
router.get('/api/logs', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;
  const { search, action, actor } = req.query;

  // 支持按关键词 / 动作 / 操作人筛选，条件全部参数绑定
  const conditions = [];
  const filterParams = [];
  if (action) {
    conditions.push('action = ?');
    filterParams.push(String(action));
  }
  if (actor) {
    conditions.push('actor = ?');
    filterParams.push(String(actor));
  }
  if (search) {
    conditions.push('(actor LIKE ? OR action LIKE ? OR entity LIKE ? OR payload LIKE ?)');
    const like = `%${String(search).trim()}%`;
    filterParams.push(like, like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  db.all(
    `SELECT * FROM operation_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...filterParams, pageSize, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT COUNT(*) as total FROM operation_logs ${where}`, filterParams, (e2, c) => {
        if (e2) return res.status(500).json({ error: e2.message });
        // 下拉筛选用的动作/操作人清单，以及今天的操作条数
        db.all(`SELECT action, COUNT(*) AS count FROM operation_logs GROUP BY action ORDER BY count DESC LIMIT 30`, [], (e3, actions) => {
          if (e3) return res.status(500).json({ error: e3.message });
          db.all(`SELECT actor, COUNT(*) AS count FROM operation_logs GROUP BY actor ORDER BY count DESC LIMIT 30`, [], (e4, actors) => {
            if (e4) return res.status(500).json({ error: e4.message });
            db.get(
              `SELECT COUNT(*) AS count FROM operation_logs WHERE date(created_at, '+8 hours') = date('now', '+8 hours')`,
              [],
              (e5, today) => {
                if (e5) return res.status(500).json({ error: e5.message });
                res.json({
                  items: rows,
                  total: c.total,
                  page,
                  pageSize,
                  actions: actions || [],
                  actors: actors || [],
                  today_count: today?.count || 0
                });
              }
            );
          });
        });
      });
    }
  );
});

router.post('/api/logs/batch-delete', requireAuth, (req, res) => {
  const { ids, clearAll } = req.body;
  
  if (clearAll) {
    db.run(`DELETE FROM operation_logs`, [], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'clear_logs', 'operation_logs', null);
      res.json({ deleted: this.changes });
    });
    return;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM operation_logs WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete_logs', 'operation_logs', null, { count: this.changes });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
