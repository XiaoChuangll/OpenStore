/*
 * 前台公开内容：应用 / 公告 / 文章分类标签 / 文章列表与详情
 */
const express = require('express');
const db = require('../database.cjs');
const { hashArticlePassword, verifyArticlePassword } = require('../lib/article-password.cjs');

const router = express.Router();

router.get('/api/public/apps', (req, res) => {
  db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Public announcements
router.get('/api/public/announcements', (req, res) => {
  const limit = Number(req.query.limit || 20); // Increased limit to ensure we get varied categories
  db.all(
    `SELECT a.id, a.title, a.content_html, a.published_at, a.updated_at, a.category_id, c.name as category_name 
     FROM announcements a 
     LEFT JOIN announcement_categories c ON a.category_id = c.id 
     WHERE a.status='published' 
     ORDER BY a.published_at DESC, a.updated_at DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

router.get('/api/public/blog-categories', (req, res) => {
  db.all(`SELECT * FROM blog_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

router.get('/api/public/blog-tags', (req, res) => {
  db.all(
    `SELECT t.*, COALESCE(cnt.usage_count, 0) as usage_count
     FROM blog_tags t
     LEFT JOIN (
       SELECT tag_id, COUNT(*) as usage_count
       FROM blog_tag_relations
       GROUP BY tag_id
     ) cnt ON t.id = cnt.tag_id
     ORDER BY usage_count DESC, t.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});


router.get('/api/public/blogs', (req, res) => {
  const limit = Number(req.query.limit || 20);
  const categoryId = req.query.category_id ? Number(req.query.category_id) : null;
  const tagId = req.query.tag_id ? Number(req.query.tag_id) : null;
  const params = [];
  let where = `WHERE b.status='published'`;
  if (categoryId) {
    where += ' AND b.category_id=?';
    params.push(categoryId);
  }
  if (tagId) {
    where += ' AND b.id IN (SELECT blog_id FROM blog_tag_relations WHERE tag_id=?)';
    params.push(tagId);
  }
  params.push(limit);
  db.all(
    `SELECT b.*, c.name as category_name,
      (SELECT group_concat(t.id, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_ids,
      (SELECT group_concat(t.name, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_names,
      (SELECT group_concat(t.color, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_colors,
      (SELECT group_concat(a.id, ',') FROM blog_app_relations ar JOIN apps a ON ar.app_id = a.id WHERE ar.blog_id = b.id AND a.enabled = 1) as app_ids,
      CASE WHEN (b.password IS NOT NULL AND b.password != '')
                 OR (b.password_hash IS NOT NULL AND b.password_hash != '')
           THEN 1 ELSE 0 END as has_password
     FROM blogs b
     LEFT JOIN blog_categories c ON b.category_id = c.id
     ${where}
     ORDER BY b.published_at DESC, b.updated_at DESC
     LIMIT ?`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // password 是明文存储的文章密码，绝不能出现在公开响应里；
      // 设了密码的文章连正文一起摘掉，否则列表接口就能绕过密码保护。
      res.json({
        items: rows.map((row) => {
          const { password, password_hash, ...rest } = row;
          if (password || password_hash) {
            rest.content_html = null;
            rest.content_markdown = null;
          }
          return rest;
        })
      });
    }
  );
});

router.get('/api/public/blogs/:slug', (req, res) => {
  const { slug } = req.params;
  const password = req.query.password ? String(req.query.password) : '';
  db.get(
    `SELECT b.*, c.name as category_name,
      (SELECT group_concat(t.id, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_ids,
      (SELECT group_concat(t.name, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_names,
      (SELECT group_concat(t.color, ',') FROM blog_tag_relations r JOIN blog_tags t ON r.tag_id = t.id WHERE r.blog_id = b.id) as tag_colors,
      (SELECT group_concat(a.id, ',') FROM blog_app_relations ar JOIN apps a ON ar.app_id = a.id WHERE ar.blog_id = b.id AND a.enabled = 1) as app_ids,
      CASE WHEN (b.password IS NOT NULL AND b.password != '')
                 OR (b.password_hash IS NOT NULL AND b.password_hash != '')
           THEN 1 ELSE 0 END as has_password
     FROM blogs b
     LEFT JOIN blog_categories c ON b.category_id = c.id
     WHERE b.slug=? AND b.status='published'`,
    [slug],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      const passwordOk = verifyArticlePassword(row, password);
      if (passwordOk === false) {
        return res.status(403).json({ error: 'password_required' });
      }
      if (!row.password_hash && row.password) {
        // 旧数据是明文密码：这次校验通过，顺手升级成哈希，之后就不留明文了
        db.run(`UPDATE blogs SET password_hash=?, password=NULL WHERE id=?`, [hashArticlePassword(row.password), row.id]);
      }
      // 明文和哈希都不回传给前端
      const { password: _articlePassword, password_hash: _articlePasswordHash, ...publicBlog } = row;

      // Increment view count
      db.run(`UPDATE blogs SET views = views + 1 WHERE id = ?`, [row.id]);

      // Fetch related apps from standalone table
      db.all(
        `SELECT * FROM blog_related_apps WHERE blog_id = ? ORDER BY id DESC`,
        [row.id],
        (e2, apps) => {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ ...publicBlog, apps });
        }
      );
    }
  );
});

module.exports = router;
