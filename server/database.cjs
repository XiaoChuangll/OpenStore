const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const defaultSiteCards = require('./lib/site-card-defaults.cjs');

const dbPath = path.resolve(__dirname, 'visitors.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

/*
 * SQLite 默认一撞上写锁就立刻抛 SQLITE_BUSY。
 * 后台维护（VACUUM、切日志模式）和前台写访客日志撞在一起时就会报 "database is locked"，
 * 这里给 5 秒等待窗口：让它排队等锁，而不是直接失败。
 */
db.configure('busyTimeout', 5000);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    location TEXT,
    device TEXT,
    path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 访客表数据量大（十万级以上）时，趋势与列表查询都要按时间过滤/排序，
  // 没有索引会退化成全表扫描
  db.run('CREATE INDEX IF NOT EXISTS idx_visitors_timestamp ON visitors(timestamp)');
  db.run('CREATE INDEX IF NOT EXISTS idx_visitors_location ON visitors(location)');
  db.run('CREATE INDEX IF NOT EXISTS idx_visitors_device ON visitors(device)');
  /*
   * 访客量大之后另外两个高频查询也走索引：
   *   ip + timestamp   —— 后台点某个 IP 看「最近访问」（按 ip 过滤 + 按时间排序）
   *   timestamp + ip   —— 趋势里统计「独立 IP」这类按时间窗口的去重计数（覆盖索引，不回表）
   */
  db.all("PRAGMA index_list(visitors)", [], (err, indexRows) => {
    if (err || !Array.isArray(indexRows)) return;
    const names = new Set(indexRows.map((row) => row.name));
    const needIpIndex = !names.has('idx_visitors_ip_time');
    const needTimeIpIndex = !names.has('idx_visitors_time_ip');

    if (needIpIndex) db.run('CREATE INDEX IF NOT EXISTS idx_visitors_ip_time ON visitors(ip, timestamp)');
    if (needTimeIpIndex) db.run('CREATE INDEX IF NOT EXISTS idx_visitors_time_ip ON visitors(timestamp, ip)');

    // 新建索引后刷新一次统计信息，让查询计划立刻用上新索引
    if (needIpIndex || needTimeIpIndex) {
      db.run('ANALYZE visitors', (analyzeErr) => {
        if (analyzeErr) console.error('ANALYZE visitors failed:', analyzeErr.message);
      });
    }
  });

  // Migration: Add path column if not exists
  db.all("PRAGMA table_info(visitors)", [], (err, rows) => {
    if (err) {
      console.error('Error getting table info:', err);
      return;
    }
    const hasPath = rows && Array.isArray(rows) && rows.some(row => row.name === 'path');
    if (!hasPath) {
      console.log('Adding path column to visitors table...');
      db.run("ALTER TABLE visitors ADD COLUMN path TEXT", (err2) => {
        if (err2) console.error('Error adding path column to visitors table:', err2);
        else console.log('Successfully added path column to visitors table.');
      });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS friend_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    weight INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS friend_link_icons (
    friend_link_id INTEGER PRIMARY KEY,
    icon_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS group_chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    link TEXT,
    avatar_url TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS announcement_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content_html TEXT,
    content_markdown TEXT,
    status TEXT CHECK(status IN ('draft','published','offline')) DEFAULT 'draft',
    category_id INTEGER,
    scheduled_at DATETIME,
    published_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    group_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content_html TEXT,
    content_markdown TEXT,
    summary TEXT,
    cover_url TEXT,
    cover_focus TEXT,
    author_names TEXT,
    status TEXT CHECK(status IN ('draft','published','offline')) DEFAULT 'draft',
    category_id INTEGER,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    password TEXT,
    allow_comments INTEGER DEFAULT 1,
    scheduled_at DATETIME,
    published_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_tag_relations (
    blog_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (blog_id, tag_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_app_relations (
    blog_id INTEGER NOT NULL,
    app_id INTEGER NOT NULL,
    PRIMARY KEY (blog_id, app_id)
  )`);

  // New table for standalone article-related apps (decoupled from main apps table)
  db.run(`CREATE TABLE IF NOT EXISTS blog_related_apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blog_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon_url TEXT,
    developer_name TEXT,
    kind_name TEXT,
    average_rating TEXT,
    download_count_str TEXT,
    original_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blog_id INTEGER NOT NULL,
    parent_id INTEGER,
    nickname TEXT NOT NULL,
    email TEXT,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, approved, spam, trash
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS blog_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blog_id INTEGER NOT NULL,
    title TEXT,
    content_html TEXT,
    content_markdown TEXT,
    summary TEXT,
    cover_url TEXT,
    author_names TEXT,
    status TEXT,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS env_vars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value_encrypted TEXT NOT NULL,
    category TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS env_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    old_value_encrypted TEXT,
    new_value_encrypted TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT,
    action TEXT,
    entity TEXT,
    entity_id INTEGER,
    payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS music_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT DEFAULT 'netease',
    status TEXT DEFAULT 'unknown',
    latency INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    status TEXT NOT NULL, -- investigating, identified, monitoring, resolved, scheduled
    type TEXT NOT NULL DEFAULT 'incident', -- incident, maintenance
    start_time INTEGER,
    end_time INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  )`);

  // 脚本护栏拦截记录：每次触发封禁写一条（宽限期内放行的不记）
  db.run(`CREATE TABLE IF NOT EXISTS script_guard_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    location TEXT,
    ua TEXT,
    path TEXT,
    hits INTEGER DEFAULT 0,
    strikes INTEGER DEFAULT 1,
    block_ms INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 硬封禁名单：不区分 UA，命中后该 IP 的一切请求都返回 429；expires_at 为 NULL = 永久
  db.run(`CREATE TABLE IF NOT EXISTS script_guard_bans (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT,
    bg_url TEXT,
    icon_url TEXT,
    download_url TEXT,
    enabled INTEGER DEFAULT 1,
    kind_name TEXT,
    average_rating TEXT,
    download_count_str TEXT,
    original_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 异常应用：屏蔽掉上游拉回来的脏数据，首页列表里不再展示（搜索仍然能搜到）
  db.run(`CREATE TABLE IF NOT EXISTS blocked_apps (
    package TEXT PRIMARY KEY,
    name TEXT,
    icon_url TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS changelogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    content_markdown TEXT,
    content_html TEXT,
    release_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS app_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT,
    bg_url TEXT,
    icon_url TEXT,
    download_url TEXT,
    type TEXT DEFAULT 'sideload',
    status TEXT DEFAULT 'pending',
    user_id INTEGER,
    user_ip TEXT,
    review_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    reviewer_id INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    device_type TEXT,
    os TEXT,
    browser TEXT,
    network TEXT,
    page_url TEXT,
    user_role TEXT,
    email TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.all(`PRAGMA table_info(feedbacks)`, [], (err, cols) => {
    if (err) return console.error('Failed to inspect feedbacks table:', err);
    const names = Array.isArray(cols) ? cols.map(c => c.name) : [];
    if (!names.includes('hash')) {
      db.run(`ALTER TABLE feedbacks ADD COLUMN hash TEXT`, [], (e2) => {
        if (e2) console.error('Failed to add hash column to feedbacks:', e2);
      });
    }
    if (!names.includes('status')) {
      db.run(`ALTER TABLE feedbacks ADD COLUMN status TEXT DEFAULT 'pending'`, [], (e3) => {
        if (e3) console.error('Failed to add status column to feedbacks:', e3);
      });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS site_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT NOT NULL DEFAULT 'home',
    key TEXT NOT NULL,
    title TEXT,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    style TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page, key)
  )`);

  const seedSiteCards = () => {
    defaultSiteCards.forEach(card => {
      db.run(
        `INSERT OR IGNORE INTO site_cards (page, key, title, sort_order, style) VALUES (?, ?, ?, ?, ?)`,
        [card.page, card.key, card.title, card.sort_order, card.style ? JSON.stringify(card.style) : null]
      );
    });
  };

  // 老库的 site_cards 没有 page 列：重建表，已有卡片归到首页「系统」页签，再补齐其它页面的默认卡片
  db.all(`PRAGMA table_info(site_cards)`, [], (err, columns) => {
    const hasPageColumn = !err && Array.isArray(columns) && columns.some(column => column.name === 'page');
    if (hasPageColumn) {
      seedSiteCards();
      return;
    }

    db.serialize(() => {
      db.run(`CREATE TABLE site_cards_page_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page TEXT NOT NULL DEFAULT 'home',
        key TEXT NOT NULL,
        title TEXT,
        enabled INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        style TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(page, key)
      )`);
      db.run(`INSERT OR IGNORE INTO site_cards_page_migration (id, page, key, title, enabled, sort_order, style, updated_at)
              SELECT id, 'system', key, title, enabled, sort_order, style, updated_at FROM site_cards`);
      db.run(`DROP TABLE site_cards`);
      db.run(`ALTER TABLE site_cards_page_migration RENAME TO site_cards`, () => seedSiteCards());
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS about_page (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content_html TEXT,
    content_markdown TEXT,
    author_name TEXT,
    author_avatar TEXT,
    author_github TEXT,
    github_repo TEXT,
    version TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed about_page
  db.get(`SELECT id FROM about_page WHERE id = 1`, [], (err, row) => {
    if (!row) {
      db.run(`INSERT INTO about_page (id, content_html, author_name, version) VALUES (1, '', 'ChuEng', '1.0.0')`);
    }
  });

  // Migrations: ensure new columns exist when DB was created before
  function ensureColumn(table, column, type) {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
      if (err || !rows) return;
      const has = rows.some(r => r.name === column);
      if (!has) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    });
  }
  ensureColumn('announcements', 'content_markdown', 'TEXT');
  // 访客来源标记：1 = 经已知前置反代（如 beta-next.icu）进来的，0 = 直接访问本站。
  // 老数据没有这个信息，默认 0；判定逻辑在 server/index.cjs 的 isViaTrustedFrontProxy()。
  ensureColumn('visitors', 'via_proxy', 'INTEGER DEFAULT 0');
  /*
   * 访客原始 User-Agent。
   * device 是从它解析出来的展示名（丢掉了版本细节），原文留一份便于排查
   * 「某个访客用的到底是什么客户端/版本」这类问题。
   * 注意：转发上游时用的不是它，而是 lib/config.cjs 里统一的 UPSTREAM_USER_AGENT。
   * 老数据没有这一列，值为 NULL（前端据此区分「没记录」和「确实没带 UA」）。
   */
  ensureColumn('visitors', 'ua', 'TEXT');
  /*
   * 这次请求是不是经 /api/v0 转发到应用市场上游的。
   * 转发时用的 UA 是统一的 UPSTREAM_USER_AGENT，和访客自己的 ua 是两回事，
   * 后台要靠这一列决定「这一行该显示哪个 UA」。
   */
  ensureColumn('visitors', 'via_upstream', 'INTEGER DEFAULT 0');
  ensureColumn('announcements', 'published_at', 'DATETIME');
  ensureColumn('announcements', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('group_chats', 'enabled', 'INTEGER DEFAULT 1');
  ensureColumn('apps', 'icon_url', 'TEXT');
  ensureColumn('apps', 'kind_name', 'TEXT');
  ensureColumn('apps', 'average_rating', 'TEXT');
  ensureColumn('apps', 'download_count_str', 'TEXT');
  ensureColumn('apps', 'original_id', 'TEXT');
  ensureColumn('about_page', 'github_repo', 'TEXT');
  ensureColumn('about_page', 'author_avatar', 'TEXT');
  // 事故 / 维护 / 提示 卡片的图标（存图标名，前台按名字取 SVG；留空则按类型取默认图标）
  ensureColumn('incidents', 'icon', 'TEXT');
  ensureColumn('about_page', 'author_github', 'TEXT');
  ensureColumn('about_page', 'content_markdown', 'TEXT');
  ensureColumn('app_submissions', 'review_note', 'TEXT');
  ensureColumn('blogs', 'content_markdown', 'TEXT');
  ensureColumn('blogs', 'summary', 'TEXT');
  ensureColumn('blogs', 'cover_url', 'TEXT');
  ensureColumn('blogs', 'cover_focus', 'TEXT');
  ensureColumn('blogs', 'author_names', 'TEXT');
  ensureColumn('blogs', 'seo_title', 'TEXT');
  ensureColumn('blogs', 'seo_description', 'TEXT');
  ensureColumn('blogs', 'seo_keywords', 'TEXT');
  ensureColumn('blogs', 'password', 'TEXT');
  // 文章密码改成存哈希：password 列保留只为兼容旧数据，读到旧明文时会在校验通过后自动升级成哈希
  ensureColumn('blogs', 'password_hash', 'TEXT');
  ensureColumn('blogs', 'allow_comments', 'INTEGER DEFAULT 1');
  ensureColumn('blogs', 'scheduled_at', 'DATETIME');
  ensureColumn('blogs', 'published_at', 'DATETIME');
  ensureColumn('blogs', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('blogs', 'views', 'INTEGER DEFAULT 0');
});

module.exports = db;
