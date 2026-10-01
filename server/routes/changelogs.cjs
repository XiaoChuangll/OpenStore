/*
 * 更新日志（含公开列表）
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');

const router = express.Router();

// Changelogs
router.get('/api/public/changelogs', (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.get('/api/changelogs', requireAuth, (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.post('/api/changelogs', requireAuth, (req, res) => {
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `INSERT INTO changelogs (version, content_html, content_markdown, release_date) VALUES (?,?,?,?)`,
    [version, content_html, content_markdown, release_date || new Date().toISOString()],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'changelogs', this.lastID, { version });
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

router.put('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `UPDATE changelogs SET version=?, content_html=?, content_markdown=?, release_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [version, content_html, content_markdown, release_date, id],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'changelogs', id, { version });
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

router.delete('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM changelogs WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'changelogs', id);
    db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('changelogs:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

module.exports = router;
