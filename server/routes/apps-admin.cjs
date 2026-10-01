/*
 * 应用 CRUD：搜索 / 新增 / 修改 / 删除
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');

const router = express.Router();

router.get('/api/apps/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const idsRaw = String(req.query.ids || '').trim();
  const limit = Number(req.query.limit || 20);

  if (idsRaw) {
    const ids = idsRaw.split(',').map(v => Number(v)).filter(v => !Number.isNaN(v));
    if (!ids.length) return res.json({ items: [] });
    const placeholders = ids.map(() => '?').join(',');
    db.all(`SELECT * FROM apps WHERE id IN (${placeholders}) ORDER BY id DESC`, ids, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    });
    return;
  }

  if (!q) return res.json({ items: [] });
  const like = `%${q}%`;
  db.all(
    `SELECT * FROM apps WHERE name LIKE ? OR provider LIKE ? ORDER BY id DESC LIMIT ?`,
    [like, like, limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});
router.post('/api/apps', requireAuth, (req, res) => {
  const { name, provider, bg_url, icon_url, download_url, enabled = 1, kind_name, average_rating, download_count_str, original_id } = req.body;
  
  const insertApp = () => {
    db.run(
      `INSERT INTO apps (name, provider, bg_url, icon_url, download_url, enabled, kind_name, average_rating, download_count_str, original_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, provider || null, bg_url || null, icon_url || null, download_url || null, Number(enabled) ? 1 : 0, kind_name || null, average_rating || null, download_count_str || null, original_id || null],
      function(err){
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user?.username, 'create', 'apps', this.lastID, { name });
        db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
          if (!e2) broadcast('apps:update', rows);
        });
        res.json({ id: this.lastID });
      }
    );
  };

  if (original_id) {
    db.get(`SELECT id FROM apps WHERE original_id = ?`, [original_id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row) {
        // Already exists, return existing ID
        res.json({ id: row.id, existed: true });
      } else {
        insertApp();
      }
    });
  } else {
    insertApp();
  }
});
router.put('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, provider, bg_url, icon_url, download_url, enabled, kind_name, average_rating, download_count_str, original_id } = req.body || {};

  const sets = [];
  const params = [];
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof provider !== 'undefined') { sets.push('provider=?'); params.push(provider || null); }
  if (typeof bg_url !== 'undefined') { sets.push('bg_url=?'); params.push(bg_url || null); }
  if (typeof icon_url !== 'undefined') { sets.push('icon_url=?'); params.push(icon_url || null); }
  if (typeof download_url !== 'undefined') { sets.push('download_url=?'); params.push(download_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }
  if (typeof kind_name !== 'undefined') { sets.push('kind_name=?'); params.push(kind_name || null); }
  if (typeof average_rating !== 'undefined') { sets.push('average_rating=?'); params.push(average_rating || null); }
  if (typeof download_count_str !== 'undefined') { sets.push('download_count_str=?'); params.push(download_count_str || null); }
  if (typeof original_id !== 'undefined') { sets.push('original_id=?'); params.push(original_id || null); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP');

  db.run(`UPDATE apps SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'apps', id, { name, provider, bg_url, icon_url, download_url, enabled });
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ changed: this.changes });
  });
});
router.delete('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apps WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'apps', id);
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
