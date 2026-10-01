/*
 * 登录 / 刷新 token / 改密码 / 后台概览
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../database.cjs');
const { JWT_SECRET, requireAuth, logAction, loginKeyOf, loginLockRemainingMs, recordLoginFailure, clearLoginFailures, LOGIN_DUMMY_HASH } = require('../middleware/auth.cjs');
const { writeEnvKey } = require('../lib/env-file.cjs');
const { cachedVisitorsGet } = require('../lib/visitors-stats.cjs');

const router = express.Router();

// Auth endpoints
router.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const loginKey = loginKeyOf(req, username);
  const lockedMs = loginLockRemainingMs(loginKey);
  if (lockedMs > 0) {
    res.setHeader('Retry-After', String(Math.ceil(lockedMs / 1000)));
    return res.status(429).json({ error: `尝试过于频繁，请 ${Math.ceil(lockedMs / 1000)} 秒后再试` });
  }
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!bcrypt.compareSync(password || '', user?.password_hash || LOGIN_DUMMY_HASH) || !user) {
      recordLoginFailure(loginKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    clearLoginFailures(loginKey);
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

router.post('/api/admin/auth/login', (req, res) => {
  const { username, password } = req.body;
  const loginKey = loginKeyOf(req, username);
  const lockedMs = loginLockRemainingMs(loginKey);
  if (lockedMs > 0) {
    res.setHeader('Retry-After', String(Math.ceil(lockedMs / 1000)));
    return res.status(429).json({ error: `尝试过于频繁，请 ${Math.ceil(lockedMs / 1000)} 秒后再试` });
  }
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!bcrypt.compareSync(password || '', user?.password_hash || LOGIN_DUMMY_HASH) || !user) {
      recordLoginFailure(loginKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    clearLoginFailures(loginKey);
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

router.post('/api/admin/auth/refresh', requireAuth, (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

router.post('/api/admin/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'Missing parameters' });
  function isPasswordComplex(p) {
    return typeof p === 'string'
      && p.length >= 8
      && /[A-Z]/.test(p)
      && /[a-z]/.test(p)
      && /\d/.test(p)
      && /[^A-Za-z0-9]/.test(p);
  }
  if (!isPasswordComplex(new_password)) {
    logAction(req.user?.username, 'password_change_failed', 'users', req.user?.uid, { reason: 'complexity' });
    return res.status(400).json({ error: '新密码不符合复杂度要求' });
  }
  const uid = req.user?.uid;
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'db_error' });
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'user_not_found' });
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!bcrypt.compareSync(old_password || '', user.password_hash)) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'wrong_old_password' });
      return res.status(401).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, uid], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      try { writeEnvKey('ADMIN_PASSWORD', new_password); } catch {}
      logAction(req.user?.username, 'password_change', 'users', uid);
      res.json({ ok: true });
    });
  });
});

// Admin Overview Dashboard Stats
router.get('/api/admin/overview', requireAuth, (req, res) => {
  const stats = {
    visitorCount: 0,
    uniqueIpCount: 0,
    locationKinds: 0,
    appCount: 0,
    feedbackCount: 0,
    commentCount: 0,
    articleCount: 0,
    systemUptime: process.uptime(),
    // 浏览器端拿不到 process.versions，Node 版本只能由后端提供
    nodeVersion: process.version
  };

  const queries = [
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM visitors`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM apps`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM feedbacks WHERE status='pending'`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM comments WHERE status='pending'`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0)))),
    new Promise((resolve) => db.get(`SELECT COUNT(*) as count FROM blogs`, [], (err, row) => resolve(err ? 0 : (row ? row.count : 0))))
  ];

  Promise.all(queries).then(results => {
    stats.visitorCount = results[0];
    stats.appCount = results[1];
    stats.feedbackCount = results[2];
    stats.commentCount = results[3];
    stats.articleCount = results[4];

    // 独立 IP 复用访客页那套聚合缓存（后台每分钟预热），不用再扫一次 18 万行
    cachedVisitorsGet(
      'agg::[]',
      `SELECT COUNT(*) AS total, COUNT(DISTINCT ip) AS unique_ip,
              COUNT(DISTINCT location) AS location_kinds, COUNT(DISTINCT device) AS device_kinds
         FROM visitors`,
      [],
      (err, agg) => {
        stats.uniqueIpCount = err || !agg ? 0 : (agg.unique_ip || 0);
        stats.locationKinds = err || !agg ? 0 : (agg.location_kinds || 0);
        res.json(stats);
      }
    );
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

router.post('/api/auth/change-password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: 'Missing parameters' });
  function isPasswordComplex(p) {
    return typeof p === 'string'
      && p.length >= 8
      && /[A-Z]/.test(p)
      && /[a-z]/.test(p)
      && /\d/.test(p)
      && /[^A-Za-z0-9]/.test(p);
  }
  if (!isPasswordComplex(new_password)) {
    logAction(req.user?.username, 'password_change_failed', 'users', req.user?.uid, { reason: 'complexity' });
    return res.status(400).json({ error: '新密码不符合复杂度要求' });
  }
  const uid = req.user?.uid;
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'db_error' });
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'user_not_found' });
      return res.status(404).json({ error: '用户不存在' });
    }
    if (!bcrypt.compareSync(old_password || '', user.password_hash)) {
      logAction(req.user?.username, 'password_change_failed', 'users', uid, { reason: 'wrong_old_password' });
      return res.status(401).json({ error: '旧密码不正确' });
    }
    const hash = bcrypt.hashSync(new_password, 10);
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, uid], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      try { writeEnvKey('ADMIN_PASSWORD', new_password); } catch {}
      logAction(req.user?.username, 'password_change', 'users', uid);
      res.json({ ok: true });
    });
  });
});

module.exports = router;
