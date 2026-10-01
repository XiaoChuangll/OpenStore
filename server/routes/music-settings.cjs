/*
 * 音乐 API 配置与站点设置
 */
const express = require('express');
const axios = require('axios');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');

const router = express.Router();

// Public: Get usable music APIs
router.get('/api/music/apis', (req, res) => {
  db.all(
    `SELECT * FROM music_apis WHERE enabled = 1 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, latency ASC, id ASC`, 
    [], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// Admin: Get all music APIs
router.get('/api/admin/music/apis', requireAuth, (req, res) => {
  db.all(`SELECT * FROM music_apis ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Admin: Add music API
router.post('/api/admin/music/apis', requireAuth, (req, res) => {
  const { name, url, type, enabled = 1 } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });
  
  db.run(
    `INSERT INTO music_apis (name, url, type, enabled) VALUES (?,?,?,?)`,
    [name, url, type || 'netease', enabled],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'music_apis', id, { name, url });
      res.json({ id });
    }
  );
});

// Admin: Update music API
router.put('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, type, enabled } = req.body;
  
  const sets = [];
  const params = [];

  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof url !== 'undefined') { sets.push('url=?'); params.push(url); }
  if (typeof type !== 'undefined') { sets.push('type=?'); params.push(type); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(enabled); }

  if (sets.length === 0) {
    return res.json({ changed: 0 });
  }

  sets.push('updated_at=CURRENT_TIMESTAMP');
  params.push(id);
  
  db.run(
    `UPDATE music_apis SET ${sets.join(', ')} WHERE id=?`,
    params,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'music_apis', id, { name, url, enabled });
      res.json({ changed: this.changes });
    }
  );
});

// Admin: Delete music API
router.delete('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM music_apis WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'music_apis', id);
    res.json({ deleted: this.changes });
  });
});

// Admin: Check music API
router.post('/api/admin/music/apis/check', requireAuth, async (req, res) => {
  const { id } = req.body;
  
  const checkUrl = async (url) => {
    const start = Date.now();
    try {
      // Clean URL
      const targetUrl = url.replace(/\/$/, '');
      // Use /banner as a lightweight check endpoint or /search
      const response = await axios.get(`${targetUrl}/banner`, { timeout: 5000 });
      const latency = Date.now() - start;
      if (response.status === 200 && response.data.code === 200) {
        return { status: 'active', latency };
      }
      return { status: 'error', latency: 0 };
    } catch (e) {
      return { status: 'error', latency: 0 };
    }
  };

  if (id) {
    // Check specific API
    db.get(`SELECT * FROM music_apis WHERE id=?`, [id], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'API not found' });
      
      const result = await checkUrl(row.url);
      db.run(
        `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [result.status, result.latency, id],
        function(e2) {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ ...result, id });
        }
      );
    });
  } else {
    // Check all enabled APIs
    db.all(`SELECT * FROM music_apis`, [], async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const results = [];
      for (const row of rows) {
        const result = await checkUrl(row.url);
        await new Promise((resolve) => {
          db.run(
            `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [result.status, result.latency, row.id],
            () => resolve()
          );
        });
        results.push({ id: row.id, ...result });
      }
      res.json({ results });
    });
  }
});

// System Settings API

// Public: Get theme settings
router.get('/api/settings/theme', (req, res) => {
  db.all(`SELECT key, value FROM system_settings WHERE key LIKE 'theme_%'`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  });
});

// Admin: Get all settings
router.get('/api/admin/settings', requireAuth, (req, res) => {
  db.all(`SELECT * FROM system_settings`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  });
});

// Admin: Update settings (batch)
router.put('/api/admin/settings', requireAuth, (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  
  const keys = Object.keys(settings);
  if (keys.length === 0) return res.json({ updated: 0 });

  let errors = [];

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    keys.forEach(key => {
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) 
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        [key, String(settings[key])],
        function(err) {
          if (err) errors.push(err.message);
        }
      );
    });
    db.run('COMMIT', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      if (errors.length > 0) return res.status(500).json({ error: 'Partial update failed', details: errors });
      
      logAction(req.user?.username, 'update', 'system_settings', null, { keys });
      res.json({ updated: keys.length });
    });
  });
});

module.exports = router;
