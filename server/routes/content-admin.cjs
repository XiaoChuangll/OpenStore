/*
 * 内容管理：公告分类与公告、文章分类与标签、文章 CRUD 与版本
 */
const express = require('express');
const db = require('../database.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');
const { hashArticlePassword, articleHasPassword } = require('../lib/article-password.cjs');

const router = express.Router();

// Announcements & Categories
router.get('/api/announcement-categories', requireAuth, (req, res) => {
  db.all(`SELECT * FROM announcement_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
router.post('/api/announcement-categories', requireAuth, (req, res) => {
  const { name, parent_id } = req.body;
  db.run(`INSERT INTO announcement_categories (name, parent_id) VALUES (?,?)`, [name, parent_id || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
router.put('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body;
  db.run(`UPDATE announcement_categories SET name=?, parent_id=? WHERE id=?`, [name, parent_id || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
router.delete('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcement_categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

router.get('/api/announcements', requireAuth, (req, res) => {
  const { status, search, category_id: categoryId, page = 1, pageSize = 10 } = req.query;
  const p = Number(page), ps = Number(pageSize);
  const offset = (p - 1) * ps;
  // 支持按状态 / 标题关键词 / 分类过滤，条件都走参数绑定
  const conditions = [];
  const filterParams = [];
  if (status) {
    conditions.push('status=?');
    filterParams.push(status);
  }
  if (search) {
    conditions.push('title LIKE ?');
    filterParams.push(`%${String(search).trim()}%`);
  }
  if (categoryId !== undefined && categoryId !== null && String(categoryId) !== '') {
    conditions.push('category_id=?');
    filterParams.push(Number(categoryId));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const params = [...filterParams, ps, offset];
  db.all(`SELECT * FROM announcements ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) AS total FROM announcements ${where}`, filterParams, (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page: p, pageSize: ps });
    });
  });
});
router.post('/api/announcements', requireAuth, (req, res) => {
  const { title, content_html, content_markdown, status = 'draft', category_id, scheduled_at } = req.body;
  db.run(`INSERT INTO announcements (title, content_html, content_markdown, status, category_id, scheduled_at) VALUES (?,?,?,?,?,?)`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'announcements', this.lastID, { title });
    res.json({ id: this.lastID });
  });
});
router.put('/api/announcements/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content_html, content_markdown, status, category_id, scheduled_at } = req.body;
  db.run(`UPDATE announcements SET title=?, content_html=?, content_markdown=?, status=?, category_id=?, scheduled_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'announcements', id, { title });
    res.json({ changed: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});
router.delete('/api/announcements/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcements WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'announcements', id);
    res.json({ deleted: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});
router.post('/api/announcements/:id/publish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE announcements SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'publish', 'announcements', id);
    res.json({ changed: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});
router.post('/api/announcements/:id/offline', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE announcements SET status='offline', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'offline', 'announcements', id);
    res.json({ changed: this.changes });
    db.all(`SELECT id, title, content_html, published_at, updated_at FROM announcements WHERE status='published' ORDER BY published_at DESC, updated_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('announcements:update', rows);
    });
  });
});

router.get('/api/blog-categories', requireAuth, (req, res) => {
  db.all(`SELECT * FROM blog_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
router.post('/api/blog-categories', requireAuth, (req, res) => {
  const { name, parent_id } = req.body;
  db.run(`INSERT INTO blog_categories (name, parent_id) VALUES (?,?)`, [name, parent_id || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
router.put('/api/blog-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body;
  db.run(`UPDATE blog_categories SET name=?, parent_id=? WHERE id=?`, [name, parent_id || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
router.delete('/api/blog-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM blog_categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

router.get('/api/blog-tags', requireAuth, (req, res) => {
  db.all(
    `SELECT t.*, COALESCE(cnt.usage_count, 0) as usage_count
     FROM blog_tags t
     LEFT JOIN (
       SELECT tag_id, COUNT(*) as usage_count
       FROM blog_tag_relations
       GROUP BY tag_id
     ) cnt ON t.id = cnt.tag_id
     ORDER BY t.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});
router.post('/api/blog-tags', requireAuth, (req, res) => {
  const { name, color, group_name } = req.body;
  db.run(`INSERT INTO blog_tags (name, color, group_name) VALUES (?,?,?)`, [name, color || null, group_name || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
router.put('/api/blog-tags/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, color, group_name } = req.body;
  db.run(`UPDATE blog_tags SET name=?, color=?, group_name=? WHERE id=?`, [name, color || null, group_name || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
router.delete('/api/blog-tags/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM blog_tags WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

router.get('/api/blogs', requireAuth, (req, res) => {
  const { status, search, page = 1, pageSize = 10, category_id, tag_id } = req.query;
  const p = Number(page), ps = Number(pageSize);
  const offset = (p - 1) * ps;
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('b.status=?');
    params.push(status);
  }
  if (category_id) {
    conditions.push('b.category_id=?');
    params.push(Number(category_id));
  }
  if (tag_id) {
    conditions.push('b.id IN (SELECT blog_id FROM blog_tag_relations WHERE tag_id=?)');
    params.push(Number(tag_id));
  }
  if (search) {
    conditions.push('b.title LIKE ?');
    params.push(`%${String(search).trim()}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  db.all(
    `SELECT b.*, c.name as category_name,
      (SELECT group_concat(t.id, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_ids,
      (SELECT group_concat(t.name, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_names,
      (SELECT group_concat(t.color, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_colors,
      (SELECT group_concat(a.id, ',') FROM blog_app_relations ar JOIN apps a ON ar.app_id = a.id WHERE ar.blog_id = b.id) as app_ids
     FROM blogs b
     LEFT JOIN blog_categories c ON b.category_id = c.id
     ${where}
     ORDER BY b.updated_at DESC
     LIMIT ? OFFSET ?`,
    [...params, ps, offset],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // Fetch related apps from standalone table for each blog
      const enrichBlogs = async () => {
        const enrichedRows = [];
        for (const row of rows) {
          const apps = await new Promise((resolve) => {
            db.all(`SELECT * FROM blog_related_apps WHERE blog_id = ? ORDER BY id DESC`, [row.id], (e, r) => {
              resolve(e ? [] : r);
            });
          });
          // 后台同样不下发明文密码或哈希，只给标记（编辑弹窗据此显示「已设密码」）
          const { password, password_hash, ...rest } = row;
          enrichedRows.push({ ...rest, has_password: articleHasPassword(row) ? 1 : 0, apps });
        }
        return enrichedRows;
      };

      const items = await enrichBlogs();
      
      db.get(`SELECT COUNT(*) AS total FROM blogs b ${where}`, params, (e2, c) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ items, total: c.total, page: p, pageSize: ps });
      });
    }
  );
});

router.post('/api/blogs', requireAuth, (req, res) => {
  const { title, slug, content_html, content_markdown, summary, cover_url, cover_focus, author_names, status = 'draft', category_id, seo_title, seo_description, seo_keywords, password, allow_comments = 1, scheduled_at, tag_ids = [], related_apps = [] } = req.body;
  db.run(
    `INSERT INTO blogs (title, slug, content_html, content_markdown, summary, cover_url, cover_focus, author_names, status, category_id, seo_title, seo_description, seo_keywords, password, password_hash, allow_comments, scheduled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title, slug, content_html || '', content_markdown || null, summary || null, cover_url || null, cover_focus || null, author_names || null, status, category_id || null, seo_title || null, seo_description || null, seo_keywords || null, null, password ? hashArticlePassword(password) : null, Number(allow_comments) ? 1 : 0, scheduled_at || null],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      const blogId = this.lastID;
      const tagIds = Array.isArray(tag_ids) ? tag_ids : [];
      tagIds.forEach((tid) => {
        db.run(`INSERT OR IGNORE INTO blog_tag_relations (blog_id, tag_id) VALUES (?,?)`, [blogId, tid]);
      });
      // Handle related apps (standalone table)
      const apps = Array.isArray(related_apps) ? related_apps : [];
      apps.forEach((app) => {
        db.run(
          `INSERT INTO blog_related_apps (blog_id, name, icon_url, developer_name, kind_name, average_rating, download_count_str, original_id) VALUES (?,?,?,?,?,?,?,?)`,
          [blogId, app.name, app.icon_url || null, app.developer_name || null, app.kind_name || null, app.average_rating || null, app.download_count_str || null, app.original_id || null]
        );
      });
      logAction(req.user?.username, 'create', 'blogs', blogId, { title });
      res.json({ id: blogId });
    }
  );
});

router.put('/api/blogs/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { title, slug, content_html, content_markdown, summary, cover_url, cover_focus, author_names, status, category_id, seo_title, seo_description, seo_keywords, password, allow_comments = 1, scheduled_at, tag_ids = [], related_apps = [] } = req.body;

  /*
   * 密码是三态：
   *   没传 password 字段 -> 保持原样（前端留空表示不改）
   *   password 为空字符串  -> 清除密码
   *   password 有值        -> 设成新密码（只存哈希）
   * 旧数据里是明文，这里顺便转成哈希，之后就只剩哈希了。
   */
  const existing = await new Promise((resolve) => {
    db.get(`SELECT password, password_hash FROM blogs WHERE id=?`, [id], (e, row) => resolve(e ? null : row));
  });
  let nextPasswordHash = null;
  if (typeof password === 'undefined') {
    nextPasswordHash = existing?.password_hash
      || (existing?.password ? hashArticlePassword(existing.password) : null);
  } else if (password) {
    nextPasswordHash = hashArticlePassword(password);
  }

  db.run(
    `UPDATE blogs SET title=?, slug=?, content_html=?, content_markdown=?, summary=?, cover_url=?, cover_focus=?, author_names=?, status=?, category_id=?, seo_title=?, seo_description=?, seo_keywords=?, password=NULL, password_hash=?, allow_comments=?, scheduled_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [title, slug, content_html || '', content_markdown || null, summary || null, cover_url || null, cover_focus || null, author_names || null, status, category_id || null, seo_title || null, seo_description || null, seo_keywords || null, nextPasswordHash, Number(allow_comments) ? 1 : 0, scheduled_at || null, id],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      db.run(`DELETE FROM blog_tag_relations WHERE blog_id=?`, [id], () => {
        const tagIds = Array.isArray(tag_ids) ? tag_ids : [];
        tagIds.forEach((tid) => {
          db.run(`INSERT OR IGNORE INTO blog_tag_relations (blog_id, tag_id) VALUES (?,?)`, [id, tid]);
        });
      });
      // Update related apps: delete old ones and insert new ones
      db.run(`DELETE FROM blog_related_apps WHERE blog_id=?`, [id], () => {
        const apps = Array.isArray(related_apps) ? related_apps : [];
        apps.forEach((app) => {
          db.run(
            `INSERT INTO blog_related_apps (blog_id, name, icon_url, developer_name, kind_name, average_rating, download_count_str, original_id) VALUES (?,?,?,?,?,?,?,?)`,
            [id, app.name, app.icon_url || null, app.developer_name || null, app.kind_name || null, app.average_rating || null, app.download_count_str || null, app.original_id || null]
          );
        });
      });
      logAction(req.user?.username, 'update', 'blogs', id, { title });
      res.json({ changed: this.changes });
    }
  );
});

router.delete('/api/blogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM blogs WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM blog_tag_relations WHERE blog_id=?`, [id]);
    db.run(`DELETE FROM blog_related_apps WHERE blog_id=?`, [id]);
    logAction(req.user?.username, 'delete', 'blogs', id);
    res.json({ deleted: this.changes });
  });
});

router.post('/api/blogs/:id/publish', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE blogs SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'publish', 'blogs', id);
    res.json({ changed: this.changes });
  });
});

router.post('/api/blogs/:id/offline', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`UPDATE blogs SET status='offline', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'offline', 'blogs', id);
    res.json({ changed: this.changes });
  });
});

router.get('/api/blogs/:id/versions', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.all(`SELECT * FROM blog_versions WHERE blog_id=? ORDER BY created_at DESC`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.post('/api/blogs/:id/versions', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content_html, content_markdown, summary, cover_url, author_names, status, seo_title, seo_description, seo_keywords } = req.body;
  db.run(
    `INSERT INTO blog_versions (blog_id, title, content_html, content_markdown, summary, cover_url, author_names, status, seo_title, seo_description, seo_keywords) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, title || null, content_html || null, content_markdown || null, summary || null, cover_url || null, author_names || null, status || null, seo_title || null, seo_description || null, seo_keywords || null],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

router.post('/api/blogs/:id/restore', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { version_id } = req.body;
  db.get(`SELECT * FROM blog_versions WHERE id=? AND blog_id=?`, [version_id, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Version not found' });
    db.run(
      `UPDATE blogs SET title=?, content_html=?, content_markdown=?, summary=?, cover_url=?, author_names=?, status=?, seo_title=?, seo_description=?, seo_keywords=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [row.title, row.content_html, row.content_markdown, row.summary, row.cover_url, row.author_names, row.status, row.seo_title, row.seo_description, row.seo_keywords, id],
      function(e2){
        if (e2) return res.status(500).json({ error: e2.message });
        logAction(req.user?.username, 'restore', 'blogs', id, { version_id });
        res.json({ changed: this.changes });
      }
    );
  });
});

module.exports = router;
