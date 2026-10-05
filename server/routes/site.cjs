/*
 * 站点卡片与关于页
 */
const express = require('express');
const db = require('../database.cjs');
const defaultSiteCards = require('../lib/site-card-defaults.cjs');
const { requireAuth, logAction } = require('../middleware/auth.cjs');
const { broadcast } = require('../lib/realtime.cjs');

const router = express.Router();

// Site Cards CRUD
router.get('/api/site-cards', requireAuth, (req, res) => {
  db.all(`SELECT * FROM site_cards ORDER BY page ASC, sort_order ASC, id ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// 拖拽排序：按传入的 id 顺序重写该页面的 sort_order
router.put('/api/site-cards/order', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(n => Number.isInteger(n)) : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });

  db.serialize(() => {
    ids.forEach((id, index) => {
      db.run(`UPDATE site_cards SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [index + 1, id]);
    });
    // SELECT 必须和写入放在同一个串行块里，否则会读到写入前的旧数据
    db.all(`SELECT * FROM site_cards ORDER BY page ASC, sort_order ASC, id ASC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'site_cards', null, { order: ids });
      broadcast('site_cards:update', rows);
      res.json({ items: rows });
    });
  });
});

// 恢复某个页面的卡片默认配置：顺序、标题、显隐、样式，并清掉该页面多余的卡片
router.post('/api/site-cards/reset', requireAuth, (req, res) => {
  const page = String(req.body?.page || '').trim();
  const defaults = defaultSiteCards.filter((card) => card.page === page);
  if (!page || !defaults.length) return res.status(400).json({ error: 'unknown page' });

  const keys = defaults.map((card) => card.key);
  const placeholders = keys.map(() => '?').join(', ');

  db.serialize(() => {
    db.run(`DELETE FROM site_cards WHERE page = ? AND key NOT IN (${placeholders})`, [page, ...keys]);
    defaults.forEach((card) => {
      db.run(
        `INSERT INTO site_cards (page, key, title, enabled, sort_order, style)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(page, key) DO UPDATE SET
           title = excluded.title,
           enabled = 1,
           sort_order = excluded.sort_order,
           style = excluded.style,
           updated_at = CURRENT_TIMESTAMP`,
        [card.page, card.key, card.title, card.sort_order, card.style ? JSON.stringify(card.style) : null]
      );
    });
    // 同理：恢复后的数据要等写入完成再查
    db.all(`SELECT * FROM site_cards ORDER BY page ASC, sort_order ASC, id ASC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'site_cards_reset', 'site_cards', null, { page });
      broadcast('site_cards:update', rows);
      res.json({ items: rows });
    });
  });
});

router.put('/api/site-cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};

  // 只更新传过来的字段：后台的开关只发 enabled，不能把标题 / 权重 / 样式一起清空
  const fields = [];
  const values = [];
  if (body.title !== undefined) {
    fields.push('title = ?');
    values.push(body.title);
  }
  if (body.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(body.enabled ? 1 : 0);
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(body.sort_order);
  }
  if (body.style !== undefined) {
    fields.push('style = ?');
    values.push(typeof body.style === 'object' ? JSON.stringify(body.style) : body.style);
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });

  db.run(
    `UPDATE site_cards SET ${fields.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [...values, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'site_cards', id, body);
      res.json({ changed: this.changes });
      db.all(`SELECT * FROM site_cards ORDER BY page ASC, sort_order ASC, id ASC`, [], (e2, rows) => {
        if (!e2) broadcast('site_cards:update', rows);
      });
    }
  );
});

// Public Site Cards
router.get('/api/public/site-cards', (req, res) => {
  const page = typeof req.query.page === 'string' && req.query.page.trim() ? req.query.page.trim() : '';
  /*
   * 关于页的卡片是固定模板，前端要按后台配置隐藏「已关闭」的卡片，
   * 所以这里允许显式要求返回全部卡片（含未启用），带上 enabled 让前端自己判断显隐。
   * 首页 / 系统页仍走默认的 enabled=1 过滤。
   */
  const includeDisabled = req.query.include_disabled === '1' || req.query.include_disabled === 'true';
  const clauses = [];
  if (!includeDisabled) clauses.push('enabled=1');
  if (page) clauses.push('page = ?');
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const order = page ? 'sort_order ASC, id ASC' : 'page ASC, sort_order ASC, id ASC';
  const sql = `SELECT * FROM site_cards${where} ORDER BY ${order}`;

  db.all(sql, page ? [page] : [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// About Page
const { DEFAULT_TECH_STACK, DEFAULT_SOCIAL_LINKS, DEFAULT_CONTRIBUTORS } = require('../lib/about-defaults.cjs');

/**
 * 把 about_page 里的 JSON 文本列还原成数组。
 * tech_stack / social_links 允许存空数组（= 后台刻意清空），
 * 所以只有「从没存过」（NULL / 空串 / 解析失败）才回落到默认值。
 */
const parseJsonList = (raw, fallback) => {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const shapeAboutRow = (row) => {
  if (!row) return {};
  return {
    ...row,
    tech_stack: parseJsonList(row.tech_stack, DEFAULT_TECH_STACK),
    social_links: parseJsonList(row.social_links, DEFAULT_SOCIAL_LINKS),
    contributors: parseJsonList(row.contributors, DEFAULT_CONTRIBUTORS),
  };
};

/** 前端可能传数组，也可能直接传 JSON 字符串；统一成待落库的文本 */
const serializeList = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return JSON.stringify(value);
  return null;
};

router.get('/api/about', (req, res) => {
  db.get(`SELECT * FROM about_page WHERE id = 1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(shapeAboutRow(row));
  });
});

router.put('/api/about', requireAuth, (req, res) => {
  const body = req.body || {};

  /*
   * 只更新请求里带的字段：
   * 后台的各个分区可能分开保存，缺字段不能把这个字段清成 NULL。
   */
  const columns = ['content_html', 'content_markdown', 'author_name', 'author_avatar', 'author_github', 'github_repo', 'version', 'site_name', 'tagline', 'hero_grid_text'];
  const fields = [];
  const values = [];

  columns.forEach((column) => {
    if (body[column] === undefined) return;
    fields.push(`${column} = ?`);
    values.push(body[column]);
  });

  if (body.tech_stack !== undefined) {
    fields.push('tech_stack = ?');
    values.push(serializeList(body.tech_stack));
  }
  if (body.social_links !== undefined) {
    fields.push('social_links = ?');
    values.push(serializeList(body.social_links));
  }
  if (body.contributors !== undefined) {
    fields.push('contributors = ?');
    values.push(serializeList(body.contributors));
  }

  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });

  db.run(
    `UPDATE about_page SET ${fields.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
    values,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'about_page', 1, { fields: columns.filter((c) => body[c] !== undefined) });
      // 更新后回读一次：前台和后台都拿解析好的数组，不用各自再解析
      db.get(`SELECT * FROM about_page WHERE id = 1`, [], (e2, row) => {
        if (e2) return res.json({ changed: this.changes });
        const item = shapeAboutRow(row);
        // 前台「关于」页据此作废缓存并重新拉取（保存即生效）
        broadcast('about:update', item);
        res.json({ changed: this.changes, item });
      });
    }
  );
});

module.exports = router;
