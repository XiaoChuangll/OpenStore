/*
 * 应用投稿与问题反馈：提交 / 后台处理 / 公开查询
 */
const express = require('express');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database.cjs');
const { JWT_SECRET, requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');
const { decrypt } = require('../lib/secret.cjs');
const { readEnvFile } = require('../lib/env-file.cjs');
const { getClientIp } = require('../lib/client-ip.cjs');
const { validateSubmission, normalizeSubmission, normalizeFeedback } = require('../lib/submission-validation.cjs');

const router = express.Router();

router.post('/api/submissions', (req, res) => {
  const payload = normalizeSubmission(req.body || {});
  const error = validateSubmission(payload);
  if (error) return res.status(400).json({ error });
  const user_ip = getClientIp(req);
  let user_id = null;
  let actor = user_ip || 'guest';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const data = jwt.verify(token, JWT_SECRET);
      user_id = data?.uid || null;
      if (data?.username) actor = data.username;
    } catch {}
  }
  const params = [];
  let whereSql = '';
  if (user_id) {
    whereSql = '(user_id = ? OR user_ip = ?)';
    params.push(user_id, user_ip);
  } else {
    whereSql = 'user_ip = ?';
    params.push(user_ip);
  }
  db.get(
    `SELECT COUNT(*) as count FROM app_submissions WHERE ${whereSql} AND created_at > datetime('now', '-10 minutes')`,
    params,
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (row && row.count >= 5) return res.status(429).json({ error: '提交过于频繁，10分钟内最多允许提交5次' });
      
      db.get(`SELECT id FROM apps WHERE name = ?`, [payload.name], (e_dup1, row_dup1) => {
        if (e_dup1) return res.status(500).json({ error: e_dup1.message });
        if (row_dup1) return res.status(400).json({ error: '该应用已收录，请勿重复提交' });

        db.get(`SELECT id FROM app_submissions WHERE name = ? AND status = 'pending'`, [payload.name], (e_dup2, row_dup2) => {
          if (e_dup2) return res.status(500).json({ error: e_dup2.message });
          if (row_dup2) return res.status(400).json({ error: '该应用已在审核中，请勿重复提交' });

          db.run(
            `INSERT INTO app_submissions (name, provider, bg_url, icon_url, download_url, type, status, user_id, user_ip) VALUES (?,?,?,?,?,?,?,?,?)`,
            [payload.name, payload.provider, payload.bg_url, payload.icon_url, payload.download_url, 'sideload', 'pending', user_id, user_ip],
            function(e2) {
              if (e2) return res.status(500).json({ error: e2.message });
              logAction(actor, 'submit', 'app_submissions', this.lastID, { name: payload.name });
              db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e3, rows) => {
                if (!e3) broadcast('submissions:update', rows);
              });
              res.json({ id: this.lastID });
            }
          );
        });
      });
    }
  );
});

router.post('/api/feedback', async (req, res) => {
  const payload = normalizeFeedback(req.body || {});
  if (!payload.type) return res.status(400).json({ error: '反馈类型不能为空' });
  if (!payload.title) return res.status(400).json({ error: '标题不能为空' });
  if (!payload.description) return res.status(400).json({ error: '详细描述不能为空' });

  const email = payload.email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }

  const ip = getClientIp(req);
  let actor = ip || 'guest';
  let role = 'guest';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const data = jwt.verify(token, JWT_SECRET);
      if (data?.username) actor = data.username;
      if (data?.role) role = String(data.role);
    } catch {}
  }

  const ua = String(req.headers['user-agent'] || '').trim();
  let limit = 0;
  // Prefer DB env_vars for dynamic configuration
  try {
    const key = 'FEEDBACK_RATE_LIMIT_PER_MINUTE';
    await new Promise((resolve) => {
      db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (e1, row) => {
        if (!e1 && row && row.value_encrypted) {
          const plain = decrypt(row.value_encrypted);
          const n = Number(plain);
          if (Number.isFinite(n)) limit = n;
        }
        resolve();
      });
    });
  } catch {}
  if (!limit) {
    const envFile = readEnvFile();
    limit = Number(envFile.FEEDBACK_RATE_LIMIT_PER_MINUTE || process.env.FEEDBACK_RATE_LIMIT_PER_MINUTE || 0) || 0;
  }
  const runInsert = () => {
    db.run(
      `INSERT INTO feedbacks (type, title, description, device_type, os, browser, network, page_url, user_role, email, ip, user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [payload.type, payload.title, payload.description, payload.device_type || null, payload.os || null, payload.browser || null, payload.network || null, payload.page_url || null, payload.user_role || role, email || null, ip, ua],
      function(e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        logAction(actor, 'submit', 'feedbacks', this.lastID, { type: payload.type, title: payload.title });
        const seed = `${this.lastID}-${Date.now()}-${ip}-${ua}`;
        const hash = crypto.createHash('sha256').update(seed).digest('hex');
        db.run(`UPDATE feedbacks SET hash = ? WHERE id = ?`, [hash, this.lastID], function(e3) {
          if (e3) return res.status(500).json({ error: e3.message });
          res.json({ id: this.lastID, hash });
        });
      }
    );
  };
  if (limit > 0) {
    db.get(
      `SELECT COUNT(*) AS count FROM feedbacks WHERE ip = ? AND created_at > datetime('now', '-1 minute')`,
      [ip],
      (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row && Number(row.count || 0) >= limit) {
          return res.status(429).json({ error: `提交过于频繁，每分钟最多允许提交${limit}次` });
        }
        runInsert();
      }
    );
  } else {
    runInsert();
  }
});

router.get('/api/admin/feedbacks', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;

  db.get(`SELECT COUNT(*) AS total FROM feedbacks`, [], (e1, agg) => {
    if (e1) return res.status(500).json({ error: e1.message });
    db.all(
      `SELECT id, type, title, description, device_type, os, browser, network, page_url, user_role, email, ip, user_agent, hash, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at FROM feedbacks ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [pageSize, offset],
      (e2, rows) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ items: rows, total: agg?.total || 0, page, pageSize });
      }
    );
  });
});

router.put('/api/admin/feedbacks/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { status, title, description } = req.body || {};
  
  const updates = [];
  const params = [];
  
  if (status) {
    const allowed = new Set(['pending', 'accepted', 'rejected', 'completed']);
    const normalizedStatus = typeof status === 'string' ? status.trim() : '';
    if (!allowed.has(normalizedStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    updates.push('status=?');
    params.push(normalizedStatus);
  }
  
  if (title !== undefined) {
    const normalizedTitle = String(title || '').trim();
    if (!normalizedTitle) return res.status(400).json({ error: '标题不能为空' });
    updates.push('title=?');
    params.push(normalizedTitle);
  }
  
  if (description !== undefined) {
    const normalizedDesc = String(description || '').trim();
    if (!normalizedDesc) return res.status(400).json({ error: '详情不能为空' });
    updates.push('description=?');
    params.push(normalizedDesc);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: '没有需要更新的字段' });
  }
  
  params.push(id);
  
  db.get(`SELECT id FROM feedbacks WHERE id=?`, [id], (e1, row) => {
    if (e1) return res.status(500).json({ error: e1.message });
    if (!row) return res.status(404).json({ error: '反馈不存在' });
    
    db.run(`UPDATE feedbacks SET ${updates.join(', ')} WHERE id=?`, params, function(e2) {
      if (e2) return res.status(500).json({ error: e2.message });
      logAction(req.user?.username, 'update', 'feedbacks', id, { status, title_updated: !!title, desc_updated: !!description });
      res.json({ changed: this.changes });
    });
  });
});

router.get('/api/public/feedback/:hash', (req, res) => {
  const hash = String(req.params.hash || '').trim();
  if (!hash) return res.status(400).json({ error: '缺少哈希值' });
  db.get(
    `SELECT id, type, title, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at FROM feedbacks WHERE hash = ?`,
    [hash],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: '未找到反馈' });
      res.json(row);
    }
  );
});

router.get('/api/public/feedbacks/success', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const status = req.query.status;
  
  let whereClause = "status IN ('accepted','completed')";
  const params = [];
  
  if (status && (status === 'accepted' || status === 'completed')) {
    whereClause = "status = ?";
    params.push(status);
  }
  
  params.push(limit);

  db.all(
    `SELECT id, type, title, status, strftime('%Y-%m-%dT%H:%M:%SZ', created_at) AS created_at 
     FROM feedbacks 
     WHERE ${whereClause} 
     ORDER BY created_at DESC 
     LIMIT ?`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

router.get('/api/submissions', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const status = String(req.query.status || '').trim();
  const params = [];
  let whereSql = '';
  if (status) {
    whereSql = 'WHERE status = ?';
    params.push(status);
  }
  db.all(`SELECT * FROM app_submissions ${whereSql} ORDER BY created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.put('/api/submissions/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { name, provider, bg_url, icon_url, download_url } = req.body || {};
  db.get(`SELECT * FROM app_submissions WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '投稿已处理' });

    const toText = (v) => (typeof v === 'string' ? v.trim() : v);
    const normalized = {
      name: toText(name),
      provider: toText(provider),
      bg_url: toText(bg_url),
      icon_url: toText(icon_url),
      download_url: toText(download_url),
    };
    if (typeof normalized.name !== 'undefined' && !normalized.name) return res.status(400).json({ error: '应用名称不能为空' });
    if (typeof normalized.provider !== 'undefined' && !normalized.provider) return res.status(400).json({ error: '应用提供者不能为空' });
    if (typeof normalized.bg_url !== 'undefined' && !normalized.bg_url) return res.status(400).json({ error: '背景URL不能为空' });
    if (typeof normalized.icon_url !== 'undefined' && !normalized.icon_url) return res.status(400).json({ error: '图标URL不能为空' });
    if (typeof normalized.download_url !== 'undefined' && !normalized.download_url) return res.status(400).json({ error: '下载链接不能为空' });

    const sets = [];
    const params = [];
    if (typeof normalized.name !== 'undefined') { sets.push('name=?'); params.push(normalized.name); }
    if (typeof normalized.provider !== 'undefined') { sets.push('provider=?'); params.push(normalized.provider); }
    if (typeof normalized.bg_url !== 'undefined') { sets.push('bg_url=?'); params.push(normalized.bg_url); }
    if (typeof normalized.icon_url !== 'undefined') { sets.push('icon_url=?'); params.push(normalized.icon_url); }
    if (typeof normalized.download_url !== 'undefined') { sets.push('download_url=?'); params.push(normalized.download_url); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    db.run(`UPDATE app_submissions SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(e2) {
      if (e2) return res.status(500).json({ error: e2.message });
      logAction(req.user?.username, 'update', 'app_submissions', id, { name: normalized.name });
      db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e3, rows) => { if (!e3) broadcast('submissions:update', rows); });
      res.json({ changed: this.changes });
    });
  });
});

router.post('/api/submissions/:id/approve', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { note } = req.body || {};
  db.get(`SELECT * FROM app_submissions WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '投稿已处理' });
    db.run(
      `INSERT INTO apps (name, provider, bg_url, icon_url, download_url, enabled) VALUES (?,?,?,?,?,?)`,
      [row.name, row.provider || '', row.bg_url || '', row.icon_url || '', row.download_url || '', 1],
      function(e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        const appId = this.lastID;
        db.run(
          `UPDATE app_submissions SET status='approved', reviewed_at=CURRENT_TIMESTAMP, reviewer_id=?, review_note=? WHERE id=?`,
          [req.user?.uid || null, note ? String(note).trim() : null, id],
          function(e3) {
            if (e3) return res.status(500).json({ error: e3.message });
            logAction(req.user?.username, 'approve', 'app_submissions', id, { app_id: appId });
            db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e4, rows) => { if (!e4) broadcast('apps:update', rows); });
            db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e5, rows) => { if (!e5) broadcast('submissions:update', rows); });
            res.json({ id, app_id: appId });
          }
        );
      }
    );
  });
});

router.post('/api/submissions/:id/reject', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { note } = req.body || {};
  db.get(`SELECT * FROM app_submissions WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '投稿不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '投稿已处理' });
    db.run(
      `UPDATE app_submissions SET status='rejected', reviewed_at=CURRENT_TIMESTAMP, reviewer_id=?, review_note=? WHERE id=?`,
      [req.user?.uid || null, note ? String(note).trim() : null, id],
      function(e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        logAction(req.user?.username, 'reject', 'app_submissions', id);
        db.all(`SELECT * FROM app_submissions ORDER BY created_at DESC`, [], (e3, rows) => { if (!e3) broadcast('submissions:update', rows); });
        res.json({ id });
      }
    );
  });
});

module.exports = router;
