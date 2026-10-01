/*
 * 服务事故 / 维护公告 CRUD（含公开进行中列表）
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');

const router = express.Router();

// Incidents CRUD
router.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time, icon } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time, icon) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, content, status, type, start_time, end_time, icon || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'incidents', id, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id });
    }
  );
});

router.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time, icon } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, icon=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time, end_time, icon || null, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title, status });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

router.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

router.get('/api/public/incidents/active', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' 
     OR ((type = 'maintenance' OR type = 'notice') AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [now], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

module.exports = router;
