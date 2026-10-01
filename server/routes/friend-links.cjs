/*
 * 友情链接 CRUD（含公开列表）
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');

const router = express.Router();

// Friend Links CRUD with pagination and batch
router.get('/api/friend-links', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const offset = (page - 1) * pageSize;
  db.all(
    `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
    (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) AS total FROM friend_links`, [], (e2, count) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: count.total, page, pageSize });
    });
  });
});
router.post('/api/friend-links', requireAuth, (req, res) => {
  const { name, url, weight = 0, enabled = 1, icon_url } = req.body;
  db.run(`INSERT INTO friend_links (name, url, weight, enabled) VALUES (?,?,?,?)`, [name, url, weight, enabled], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const linkId = this.lastID;
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'create', 'friend_links', linkId, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ id: linkId });
    };

    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [linkId, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      afterIcon();
    }
  });
});
router.put('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, weight, enabled, icon_url } = req.body;
  db.run(`UPDATE friend_links SET name=?, url=?, weight=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [name, url, weight, enabled, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'update', 'friend_links', id, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    };

    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [id, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => afterIcon());
    }
  });
});
router.delete('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => {
    db.run(`DELETE FROM friend_links WHERE id=?`, [id], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'delete', 'friend_links', id);
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ deleted: this.changes });
    });
  });
});
router.post('/api/friend-links/batch', requireAuth, (req, res) => {
  const { ids = [], action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ changed: 0 });
  const placeholders = ids.map(()=>'?').join(',');
  if (action === 'delete') {
    db.run(`DELETE FROM friend_links WHERE id IN (${placeholders})`, ids, function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_delete', 'friend_links', null, { ids });
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id IN (${placeholders})`, ids, () => {
        db.all(
          `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
          [],
          (e2, rows) => {
            if (!e2) broadcast('links:update', rows);
          }
        );
        res.json({ changed: this.changes });
      });
    });
  } else if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable' ? 1 : 0;
    db.run(`UPDATE friend_links SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [enabled, ...ids], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_enable', 'friend_links', null, { ids, enabled });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    });
  } else {
    res.status(400).json({ error: 'Unknown action' });
  }
});

// Public friend links for homepage
router.get('/api/public/friend-links', (req, res) => {
  db.all(`SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id WHERE fl.enabled=1 ORDER BY fl.weight DESC, fl.id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

module.exports = router;
