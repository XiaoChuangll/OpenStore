/*
 * 群聊 CRUD（含公开列表）
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');

const router = express.Router();

// Group Chats CRUD
router.get('/api/group-chats', requireAuth, (req, res) => {
  db.all(`SELECT * FROM group_chats ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
router.post('/api/group-chats', requireAuth, (req, res) => {
  const { name, link, avatar_url, enabled = 1 } = req.body;
  db.run(`INSERT INTO group_chats (name, link, avatar_url, enabled) VALUES (?,?,?,?)`, [name, link || null, avatar_url || null, Number(enabled) ? 1 : 0], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'group_chats', this.lastID, { name, link, avatar_url, enabled: Number(enabled) ? 1 : 0 });
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ id: this.lastID });
  });
});
router.put('/api/group-chats/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, link, avatar_url, enabled } = req.body || {};

  const sets = [];
  const params = [];
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof link !== 'undefined') { sets.push('link=?'); params.push(link || null); }
  if (typeof avatar_url !== 'undefined') { sets.push('avatar_url=?'); params.push(avatar_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP');

  db.run(`UPDATE group_chats SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'group_chats', id, { name, link, avatar_url, enabled });
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ changed: this.changes });
  });
});
router.delete('/api/group-chats/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM group_chats WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'group_chats', id);
    db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('groups:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// Public group chats
router.get('/api/public/group-chats', (req, res) => {
  db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

module.exports = router;
