const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'visitors.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    location TEXT,
    device TEXT,
    path TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

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

  db.run(`CREATE TABLE IF NOT EXISTS apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT,
    bg_url TEXT,
    icon_url TEXT,
    download_url TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  db.run(`CREATE TABLE IF NOT EXISTS site_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    title TEXT,
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    style TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed site_cards
  const defaultCards = [
    { key: 'friend_links', title: '友情链接', sort_order: 10, style: JSON.stringify({ span: 12, accent: 'bg-yellow' }) },
    { key: 'group_chats', title: '群聊', sort_order: 20, style: JSON.stringify({ span: 12, accent: 'bg-green' }) },
    { key: 'announcements', title: '公告', sort_order: 30, style: JSON.stringify({ span: 24, accent: 'bg-yellow' }) },
    { key: 'apps', title: '应用', sort_order: 40, style: JSON.stringify({ span: 24, accent: 'bg-yellow' }) },
    { key: 'music', title: '在线播放', sort_order: 5, style: JSON.stringify({ span: 24, accent: 'bg-red' }) }
  ];

  defaultCards.forEach(card => {
    db.run(`INSERT OR IGNORE INTO site_cards (key, title, sort_order, style) VALUES (?, ?, ?, ?)`, [card.key, card.title, card.sort_order, card.style]);
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
  ensureColumn('announcements', 'published_at', 'DATETIME');
  ensureColumn('announcements', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  ensureColumn('group_chats', 'enabled', 'INTEGER DEFAULT 1');
  ensureColumn('apps', 'icon_url', 'TEXT');
  ensureColumn('about_page', 'github_repo', 'TEXT');
  ensureColumn('about_page', 'author_avatar', 'TEXT');
  ensureColumn('about_page', 'author_github', 'TEXT');
  ensureColumn('about_page', 'content_markdown', 'TEXT');
});

module.exports = db;
