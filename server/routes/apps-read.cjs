/*
 * 应用列表（后台读取）
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

// Apps CRUD
router.get('/api/apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

module.exports = router;
