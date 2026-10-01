/*
 * 评论：公开读取 / 提交 / 后台审核与批量操作
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { getClientIp } = require('../lib/client-ip.cjs');
const { readNumberSetting } = require('../lib/number-setting.cjs');

const router = express.Router();

// --- Comment System ---

// Get comments for a blog post (public)
router.get('/api/public/comments', (req, res) => {
  const { blog_id, page = 1, pageSize = 20, include_ids } = req.query;
  if (!blog_id) return res.status(400).json({ error: 'Missing blog_id' });

  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = Math.max((Number(page) || 1) - 1, 0) * limit;

  // Process include_ids (ids of comments that should be visible even if not approved)
  let extraIds = [];
  if (include_ids) {
    if (Array.isArray(include_ids)) {
      extraIds = include_ids.map(Number).filter(n => !isNaN(n));
    } else if (typeof include_ids === 'string') {
      extraIds = include_ids.split(',').map(Number).filter(n => !isNaN(n));
    }
  }

  // Build query
  // 公开接口只返回展示必需的字段：comments 表里的 email / ip_address / user_agent
  // 属于评论者隐私，不能再随列表发给访客。
  const PUBLIC_COMMENT_COLUMNS = 'id, blog_id, parent_id, nickname, content, status, created_at, updated_at';

  let whereSql = "blog_id = ? AND (status = 'approved'";
  let params = [blog_id];

  if (extraIds.length > 0) {
    // include_ids 是「刚提交完立刻看到自己那条（含待审核）」用的，
    // 必须限定在这些 id 确实来自同一个来源 IP，否则遍历 id 就能把整个待审队列拖走。
    const placeholders = extraIds.map(() => '?').join(',');
    whereSql += ` OR (id IN (${placeholders}) AND ip_address = ?)`;
    params.push(...extraIds, getClientIp(req));
  }
  whereSql += ")";

  const sql = `SELECT ${PUBLIC_COMMENT_COLUMNS} FROM comments WHERE ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) as total FROM comments WHERE ${whereSql}`;

  db.all(
    sql,
    [...params, limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(countSql, params, (e2, count) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ items: rows, total: count.total, page: Number(page), pageSize: limit });
      });
    }
  );
});

// Post a new comment (public)
// 读取「每分钟限流」这类数值配置：优先后台 env_vars 表，其次 .env / 进程环境变量

router.post('/api/public/comments', async (req, res) => {
  const { blog_id, parent_id, nickname, email, content } = req.body;
  if (!blog_id || !nickname || !content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Basic validation
  if (content.length > 1000) return res.status(400).json({ error: 'Content too long' });
  if (String(nickname).length > 40) return res.status(400).json({ error: '昵称最多 40 个字' });

  // 限流：同一 IP 每分钟最多 COMMENT_RATE_LIMIT_PER_MINUTE 条（默认 5，设 0 关闭）
  const clientIp = getClientIp(req);
  const limit = await readNumberSetting('COMMENT_RATE_LIMIT_PER_MINUTE', 5);
  if (limit > 0) {
    const postedInLastMinute = await new Promise((resolve) => {
      db.get(
        `SELECT COUNT(*) AS count FROM comments WHERE ip_address = ? AND created_at > datetime('now', '-1 minute')`,
        [clientIp],
        (e1, row) => resolve(e1 ? 0 : Number(row?.count || 0))
      );
    });
    if (postedInLastMinute >= limit) {
      return res.status(429).json({ error: `评论过于频繁，每分钟最多 ${limit} 条` });
    }
  }

  // Default status: pending for moderation
  const status = 'pending'; 
  
  db.run(
    `INSERT INTO comments (blog_id, parent_id, nickname, email, content, status, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [blog_id, parent_id || null, nickname, email || null, content, status, clientIp, req.get('User-Agent')],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status });
    }
  );
});

// Get all comments for admin (with filtering)
router.get('/api/admin/comments', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;
  const status = req.query.status;
  const blogId = req.query.blog_id;

  let whereClause = '1=1';
  const params = [];

  if (status && status !== 'all') {
    whereClause += ' AND c.status = ?';
    params.push(status);
  }
  if (blogId) {
    whereClause += ' AND c.blog_id = ?';
    params.push(blogId);
  }

  const countSql = `SELECT COUNT(*) as total FROM comments c WHERE ${whereClause}`;
  db.get(countSql, params, (err, countResult) => {
    if (err) return res.status(500).json({ error: err.message });

    const sql = `
      SELECT c.*, b.title as blog_title 
      FROM comments c 
      LEFT JOIN blogs b ON c.blog_id = b.id 
      WHERE ${whereClause} 
      ORDER BY c.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    db.all(sql, [...params, pageSize, offset], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ items: rows, total: countResult?.total || 0, page, pageSize });
    });
  });
});

// Update comment (status, content, etc.)
router.put('/api/admin/comments/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  const { status, content, nickname, email } = req.body || {};

  const updates = [];
  const params = [];

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);
  }
  if (nickname !== undefined) {
    updates.push('nickname = ?');
    params.push(nickname);
  }
  if (email !== undefined) {
    updates.push('email = ?');
    params.push(email);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  db.run(`UPDATE comments SET ${updates.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'comments', id, { status, content });
    res.json({ success: true });
  });
});

// Delete comment(s)
router.delete('/api/admin/comments/:id', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = Number(req.params.id);
  db.run('DELETE FROM comments WHERE id = ?', [id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'comments', id, {});
    res.json({ success: true, deleted: 1 });
  });
});

// Batch delete comments
router.post('/api/admin/comments/batch-delete', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM comments WHERE id IN (${placeholders})`, ids, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'batch-delete', 'comments', 0, { count: ids.length });
    res.json({ success: true, deleted: ids.length });
  });
});

// Batch update comment status
router.post('/api/admin/comments/batch-status', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }
  if (!status) {
    return res.status(400).json({ error: 'No status provided' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.run(`UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [status, ...ids], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'batch-status', 'comments', 0, { count: ids.length, status });
    res.json({ success: true, updated: ids.length });
  });
});

// Get blogs list for filtering
router.get('/api/admin/comments/blogs', requireAuth, (req, res) => {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.all('SELECT id, title FROM blogs ORDER BY id DESC LIMIT 100', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

module.exports = router;
