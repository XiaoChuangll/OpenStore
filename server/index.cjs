const express = require('express');
const cors = require('cors');
const axios = require('axios');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { WebSocketServer } = require('ws');
const db = require('./database.cjs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Static uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend assets
// Make sure to serve static files *after* the /uploads route so /uploads isn't caught by the SPA fallback or static middleware
app.use(express.static(path.join(__dirname, '../dist')));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Encryption helpers for env values
const secretKeyPath = path.join(__dirname, 'secret.key');
function getSecretKey() {
  const envKey = process.env.ENV_SECRET_KEY;
  if (envKey) return Buffer.from(envKey, 'hex');
  if (fs.existsSync(secretKeyPath)) {
    return fs.readFileSync(secretKeyPath);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(secretKeyPath, key);
  return key;
}
const KEY = getSecretKey();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(data) {
  try {
    const buf = Buffer.from(data, 'base64');
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const enc = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

// Middleware to track visitors
app.use((req, res, next) => {
  // Track public API calls to record visitors
  const isPublicApi = req.path.startsWith('/api/public/') || req.path.startsWith('/api/v0/') || req.path === '/api/monitors' || req.path === '/api/about';
  
  if (isPublicApi && req.method === 'GET') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    // Normalize IP
    let cleanIp = ip.toString().split(',')[0].trim();
    if (cleanIp.startsWith('::ffff:')) {
      cleanIp = cleanIp.substring(7);
    } else if (cleanIp === '::1') {
      cleanIp = '127.0.0.1';
    }
    
    // Get path from query 'path' (from frontend tracker), then referer, then req.path
    let requestPath = req.query.path || req.path;
    
    if (req.headers.referer) {
      try {
        const refUrl = new URL(req.headers.referer);
        // Special case for root to avoid empty path
        const pathFromRef = (refUrl.pathname === '/' ? '/' : refUrl.pathname) + refUrl.search;
        // Only use referer path if it's not a generic root or if we don't have a specific path from query
        if (!req.query.path) {
          requestPath = pathFromRef;
        }
      } catch (e) {
        // ignore invalid referer
      }
    }
    
    // If it's still just an API path, map common ones
    if (requestPath.startsWith('/api/')) {
       if (requestPath === '/api/monitors' || requestPath.startsWith('/api/public/incidents')) {
         requestPath = '/'; // Home/Monitor page
       } else if (requestPath.startsWith('/api/v0/')) {
         requestPath = '/exploration'; // Exploration page
       }
    }

    // De-duplication: Only record if same IP has not visited this path in the last 1 minute
    const now = Date.now();
    const oneMinuteAgo = new Date(now - 60000).toISOString().replace('T', ' ').split('.')[0];
    
    db.get(
      `SELECT id FROM visitors WHERE ip = ? AND path = ? AND timestamp > ? LIMIT 1`,
      [cleanIp, requestPath, oneMinuteAgo],
      (err, row) => {
        if (err) {
          console.error('Error checking visitor de-duplication:', err);
        } else if (!row) {
          // Record new visitor
          const geo = geoip.lookup(cleanIp);
          const location = geo ? [geo.city, geo.country].filter(Boolean).join(' ') : 'Unknown Local';
          
          const parser = new UAParser(req.headers['user-agent']);
          const browser = parser.getBrowser();
          const os = parser.getOS();
          const dev = parser.getDevice();
          
          let deviceStr = '';
          const browserStr = [browser.name, browser.version].filter(Boolean).join(' ');
          if (dev.vendor || dev.model) {
            deviceStr = [dev.vendor, dev.model].filter(Boolean).join(' ');
          }
          const osStr = [os.name, os.version].filter(Boolean).join(' ');
          
          const parts = [];
          if (deviceStr) parts.push(deviceStr);
          if (osStr) parts.push(osStr);
          if (browserStr) parts.push(browserStr);
          
          const device = parts.length > 0 ? parts.join(' - ') : 'Unknown Device';

          db.run(
            `INSERT INTO visitors (ip, location, device, path) VALUES (?, ?, ?, ?)`,
            [cleanIp, location, device, requestPath],
            function(err) {
              if (err) {
                console.error('Error tracking visitor:', err);
              } else {
                // Broadcast via WebSocket
                const newVisitor = {
                  id: this.lastID,
                  ip: cleanIp,
                  location,
                  device,
                  path: requestPath,
                  timestamp: new Date().toISOString()
                };
                broadcast('visitors:new', newVisitor);
              }
            }
          );
        }
      }
    );
  }
  next();
});

// Explicit visitor tracking endpoint
app.get('/api/public/track', (req, res) => {
  res.json({ ok: true });
});

// API Proxy for debugging
app.post('/api/proxy-request', async (req, res) => {
  const { url, method = 'GET', headers = {}, data = null, body = null } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const config = {
      method,
      url,
      headers: {
        ...headers,
        // Remove host header to avoid conflicts, axios/node handles it
        host: undefined
      },
      data: data || body,
      timeout: 10000, // 10s timeout
      validateStatus: () => true // Resolve all status codes
    };

    const startTime = Date.now();
    const response = await axios(config);
    const duration = Date.now() - startTime;

    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
      duration
    });
  } catch (error) {
    res.json({
      status: 0,
      statusText: 'Error',
      error: error.message,
      duration: 0
    });
  }
});

// Music Proxy Endpoint for streaming audio (HTTP -> HTTPS)
app.get('/api/music-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://music.163.com/'
      }
    });

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error('Music proxy error:', error.message);
    res.status(500).send('Proxy error');
  }
});

// Upload endpoint
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  // Use absolute URL or relative URL depending on deployment
  // Since frontend and backend are on same domain/port in production usually, relative is fine.
  // But if proxying, ensure /uploads is accessible.
  // Construct the full URL based on the request host to be safe or keep relative
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['host'];
  // const url = `${protocol}://${host}/uploads/${req.file.filename}`;
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// Proxy to UptimeRobot
app.get('/api/monitors', async (req, res) => {
  try {
    const API_KEY = process.env.VUE_APP_API_KEY;
    if (!API_KEY) {
      throw new Error('API Key not found in environment variables');
    }

    // UptimeRobot requires x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('api_key', API_KEY);
    params.append('format', 'json');
    params.append('logs', '1');
    params.append('response_times', '1');
    params.append('ssl', '1');
    params.append('custom_uptime_ratios', '1-7-30'); // 获取过去1天、7天、30天的可用率

    // Generate 30 daily ranges for the visualization
    const now = Math.floor(Date.now() / 1000);
    const ranges = [];
    for (let i = 29; i >= 0; i--) {
      const start = now - (i + 1) * 86400;
      const end = now - i * 86400;
      ranges.push(`${start}_${end}`);
    }
    params.append('custom_uptime_ranges', ranges.join('-'));

    const response = await axios.post('https://api.uptimerobot.com/v2/getMonitors', params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('UptimeRobot API Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch monitors' });
  }
});

// Get Visitor Stats
app.get('/api/visitors', (req, res) => {
  const limit = Number(req.query.limit || req.query.pageSize || 50);
  const page = req.query.page ? Number(req.query.page) : null;
  const { location, device, path } = req.query;

  let whereClauses = [];
  let whereParams = [];

  if (location) {
    whereClauses.push(`location LIKE ?`);
    whereParams.push(`%${location}%`);
  }
  if (device) {
    whereClauses.push(`device LIKE ?`);
    whereParams.push(`%${device}%`);
  }
  if (path) {
    whereClauses.push(`path LIKE ?`);
    whereParams.push(`%${path}%`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  db.get(
    `SELECT 
      COUNT(*) AS total,
      COUNT(DISTINCT ip) AS unique_ip,
      COUNT(DISTINCT location) AS location_kinds,
      COUNT(DISTINCT device) AS device_kinds
     FROM visitors ${whereSql}`,
    whereParams, 
    (e1, agg) => {
    if (e1) return res.status(500).json({ error: e1.message });
    
    let sql = `SELECT * FROM visitors ${whereSql} ORDER BY timestamp DESC LIMIT ?`;
    let params = [...whereParams, limit];

    if (page) {
      const offset = (page - 1) * limit;
      sql = `SELECT * FROM visitors ${whereSql} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      params = [...whereParams, limit, offset];
    }

    db.all(sql, params, (e2, rows) => {
      if (e2) {
        res.status(500).json({ error: e2.message });
        return;
      }
      // Stats queries (global stats, ignoring filters for overview charts usually, but here we can keep them global or filtered. 
      // The user just asked for filtering records. Let's keep stats global for now as they are "Overview" stats usually.)
      // Actually, if I filter, I might expect stats to change? 
      // The aggregated stats above (total, unique_ip) ARE using the filter now.
      // But location_stats and device_stats below are global. Let's keep them global for the "Distribution" view.
      
      db.all(`SELECT location AS name, COUNT(*) AS count FROM visitors GROUP BY location ORDER BY count DESC`, [], (e3, locRows) => {
        if (e3) {
          res.status(500).json({ error: e3.message });
          return;
        }
        db.all(`SELECT device AS name, COUNT(*) AS count FROM visitors GROUP BY device ORDER BY count DESC`, [], (e4, devRows) => {
          if (e4) {
            res.status(500).json({ error: e4.message });
            return;
          }
          res.json({
            visitors: rows,
            total: agg?.total ?? rows.length,
            unique_ip: agg?.unique_ip ?? 0,
            location_kinds: agg?.location_kinds ?? 0,
            device_kinds: agg?.device_kinds ?? 0,
            locationStats: locRows || [],
            deviceStats: devRows || [],
          });
        });
      });
    });
  });
});

// Batch Delete Visitors
app.post('/api/visitors/batch-delete', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const sql = `DELETE FROM visitors WHERE id IN (${placeholders})`;

  db.run(sql, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

// Get Visitor Trend
app.get('/api/visitors/trend', requireAuth, (req, res) => {
  const days = Number(req.query.days || 30);
  
  // SQLite date function to get date part only
  // timestamp is like '2023-10-27 10:00:00'
  const sql = `
    SELECT 
      strftime('%Y-%m-%d', timestamp) as date,
      COUNT(*) as count,
      COUNT(DISTINCT ip) as unique_ip
    FROM visitors
    WHERE timestamp >= date('now', '-' || ? || ' days')
    GROUP BY date
    ORDER BY date ASC
  `;
  
  db.all(sql, [days], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Export Visitor Logs
app.get('/api/visitors/export', requireAuth, (req, res) => {
  db.all(`SELECT * FROM visitors ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).send('Database Error');
    
    // Convert to CSV
    const header = ['ID', 'IP', 'Location', 'Device', 'Path', 'Time'];
    const csvRows = rows.map(r => {
      // Escape quotes and handle commas
      const esc = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      return [r.id, r.ip, r.location, r.device, r.path, r.timestamp].map(esc).join(',');
    });
    
    const csvContent = '\uFEFF' + [header.join(','), ...csvRows].join('\n'); // Add BOM for Excel
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="visitors-${Date.now()}.csv"`);
    res.send(csvContent);
  });
});

// Friend Links CRUD with pagination and batch
app.get('/api/friend-links', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 10);
  const offset = (page - 1) * pageSize;
  db.all(
    `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC LIMIT ? OFFSET ?`,
    [pageSize, offset],
    (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) AS total FROM friend_links`, [], (e2, count) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: count.total, page, pageSize });
    });
  });
});
app.post('/api/friend-links', requireAuth, (req, res) => {
  const { name, url, weight = 0, enabled = 1, icon_url } = req.body;
  db.run(`INSERT INTO friend_links (name, url, weight, enabled) VALUES (?,?,?,?)`, [name, url, weight, enabled], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const linkId = this.lastID;
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'create', 'friend_links', linkId, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ id: linkId });
    };

    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [linkId, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      afterIcon();
    }
  });
});
app.put('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, weight, enabled, icon_url } = req.body;
  db.run(`UPDATE friend_links SET name=?, url=?, weight=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [name, url, weight, enabled, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const normalizedIconUrl = typeof icon_url === 'string' ? icon_url.trim() : '';
    const afterIcon = () => {
      logAction(req.user?.username, 'update', 'friend_links', id, { name, url, weight, enabled, icon_url: normalizedIconUrl || null });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    };

    if (normalizedIconUrl) {
      db.run(
        `INSERT INTO friend_link_icons (friend_link_id, icon_url) VALUES (?, ?) ON CONFLICT(friend_link_id) DO UPDATE SET icon_url=excluded.icon_url, updated_at=CURRENT_TIMESTAMP`,
        [id, normalizedIconUrl],
        () => afterIcon()
      );
    } else {
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => afterIcon());
    }
  });
});
app.delete('/api/friend-links/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM friend_link_icons WHERE friend_link_id=?`, [id], () => {
    db.run(`DELETE FROM friend_links WHERE id=?`, [id], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'delete', 'friend_links', id);
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ deleted: this.changes });
    });
  });
});
app.post('/api/friend-links/batch', requireAuth, (req, res) => {
  const { ids = [], action } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ changed: 0 });
  const placeholders = ids.map(()=>'?').join(',');
  if (action === 'delete') {
    db.run(`DELETE FROM friend_links WHERE id IN (${placeholders})`, ids, function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_delete', 'friend_links', null, { ids });
      db.run(`DELETE FROM friend_link_icons WHERE friend_link_id IN (${placeholders})`, ids, () => {
        db.all(
          `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
          [],
          (e2, rows) => {
            if (!e2) broadcast('links:update', rows);
          }
        );
        res.json({ changed: this.changes });
      });
    });
  } else if (action === 'enable' || action === 'disable') {
    const enabled = action === 'enable' ? 1 : 0;
    db.run(`UPDATE friend_links SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`, [enabled, ...ids], function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'batch_enable', 'friend_links', null, { ids, enabled });
      db.all(
        `SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id ORDER BY fl.weight DESC, fl.id DESC`,
        [],
        (e2, rows) => {
          if (!e2) broadcast('links:update', rows);
        }
      );
      res.json({ changed: this.changes });
    });
  } else {
    res.status(400).json({ error: 'Unknown action' });
  }
});

// Public friend links for homepage
app.get('/api/public/friend-links', (req, res) => {
  db.all(`SELECT fl.*, fli.icon_url FROM friend_links fl LEFT JOIN friend_link_icons fli ON fli.friend_link_id = fl.id WHERE fl.enabled=1 ORDER BY fl.weight DESC, fl.id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Group Chats CRUD
app.get('/api/group-chats', requireAuth, (req, res) => {
  db.all(`SELECT * FROM group_chats ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/group-chats', requireAuth, (req, res) => {
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
app.put('/api/group-chats/:id', requireAuth, (req, res) => {
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
app.delete('/api/group-chats/:id', requireAuth, (req, res) => {
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
app.get('/api/public/group-chats', (req, res) => {
  db.all(`SELECT * FROM group_chats WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Incidents CRUD
app.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)`,
    [title, content, status, type, start_time, end_time],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'incidents', id, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id });
    }
  );
});

app.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time, end_time, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title, status });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC, created_at DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/public/incidents/active', (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' 
     OR (type = 'maintenance' AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [now], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// Apps CRUD
app.get('/api/apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/apps', requireAuth, (req, res) => {
  const { name, provider, bg_url, icon_url, download_url, enabled = 1 } = req.body;
  db.run(
    `INSERT INTO apps (name, provider, bg_url, icon_url, download_url, enabled) VALUES (?,?,?,?,?,?)`,
    [name, provider || null, bg_url || null, icon_url || null, download_url || null, Number(enabled) ? 1 : 0],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'apps', this.lastID, { name });
      db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
        if (!e2) broadcast('apps:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});
app.put('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, provider, bg_url, icon_url, download_url, enabled } = req.body || {};

  const sets = [];
  const params = [];
  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof provider !== 'undefined') { sets.push('provider=?'); params.push(provider || null); }
  if (typeof bg_url !== 'undefined') { sets.push('bg_url=?'); params.push(bg_url || null); }
  if (typeof icon_url !== 'undefined') { sets.push('icon_url=?'); params.push(icon_url || null); }
  if (typeof download_url !== 'undefined') { sets.push('download_url=?'); params.push(download_url || null); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(Number(enabled) ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP');

  db.run(`UPDATE apps SET ${sets.join(', ')} WHERE id=?`, [...params, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'apps', id, { name, provider, bg_url, icon_url, download_url, enabled });
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apps WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'apps', id);
    db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (e2, rows) => {
      if (!e2) broadcast('apps:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});
app.get('/api/public/apps', (req, res) => {
  db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Public announcements
app.get('/api/public/announcements', (req, res) => {
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

// Announcements & Categories
app.get('/api/announcement-categories', requireAuth, (req, res) => {
  db.all(`SELECT * FROM announcement_categories ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/announcement-categories', requireAuth, (req, res) => {
  const { name, parent_id } = req.body;
  db.run(`INSERT INTO announcement_categories (name, parent_id) VALUES (?,?)`, [name, parent_id || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});
app.put('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, parent_id } = req.body;
  db.run(`UPDATE announcement_categories SET name=?, parent_id=? WHERE id=?`, [name, parent_id || null, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/announcement-categories/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM announcement_categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/announcements', requireAuth, (req, res) => {
  const { status, page = 1, pageSize = 10 } = req.query;
  const p = Number(page), ps = Number(pageSize);
  const offset = (p - 1) * ps;
  const where = status ? `WHERE status=?` : '';
  const params = status ? [status, ps, offset] : [ps, offset];
  db.all(`SELECT * FROM announcements ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const countParams = status ? [status] : [];
    db.get(`SELECT COUNT(*) AS total FROM announcements ${where}`, countParams, (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page: p, pageSize: ps });
    });
  });
});
app.post('/api/announcements', requireAuth, (req, res) => {
  const { title, content_html, content_markdown, status = 'draft', category_id, scheduled_at } = req.body;
  db.run(`INSERT INTO announcements (title, content_html, content_markdown, status, category_id, scheduled_at) VALUES (?,?,?,?,?,?)`, [title, content_html, content_markdown || null, status, category_id || null, scheduled_at || null], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'create', 'announcements', this.lastID, { title });
    res.json({ id: this.lastID });
  });
});
app.put('/api/announcements/:id', requireAuth, (req, res) => {
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
app.delete('/api/announcements/:id', requireAuth, (req, res) => {
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
app.post('/api/announcements/:id/publish', requireAuth, (req, res) => {
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
app.post('/api/announcements/:id/offline', requireAuth, (req, res) => {
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

// Changelogs
app.get('/api/public/changelogs', (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.get('/api/changelogs', requireAuth, (req, res) => {
  db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/changelogs', requireAuth, (req, res) => {
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `INSERT INTO changelogs (version, content_html, content_markdown, release_date) VALUES (?,?,?,?)`,
    [version, content_html, content_markdown, release_date || new Date().toISOString()],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'changelogs', this.lastID, { version });
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { version, content_html, content_markdown, release_date } = req.body;
  db.run(
    `UPDATE changelogs SET version=?, content_html=?, content_markdown=?, release_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [version, content_html, content_markdown, release_date, id],
    function(err){
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'changelogs', id, { version });
      db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
        if (!e2) broadcast('changelogs:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/changelogs/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM changelogs WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'changelogs', id);
    db.all(`SELECT * FROM changelogs ORDER BY release_date DESC, created_at DESC`, [], (e2, rows) => {
      if (!e2) broadcast('changelogs:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// Apps CRUD
app.get('/api/apps', requireAuth, (req, res) => {
  db.all(`SELECT * FROM apps ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});
app.post('/api/apps', requireAuth, (req, res) => {
  const { name, provider, bg_url, download_url, enabled = 1 } = req.body;
  db.run(`INSERT INTO apps (name, provider, bg_url, download_url, enabled) VALUES (?,?,?,?,?)`, [name, provider || '', bg_url || '', download_url || '', enabled], function(err){
    if (err) return res.status(500).json({ error: err.message });
    const id = this.lastID;
    logAction(req.user?.username, 'create', 'apps', id, { name, provider, bg_url, download_url, enabled });
    db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => { if (!e2) broadcast('apps:update', rows); });
    res.json({ id });
  });
});
app.put('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, provider, bg_url, download_url, enabled = 1 } = req.body;
  db.run(`UPDATE apps SET name=?, provider=?, bg_url=?, download_url=?, enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [name, provider || '', bg_url || '', download_url || '', enabled, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'update', 'apps', id, { name, provider, bg_url, download_url, enabled });
    db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => { if (!e2) broadcast('apps:update', rows); });
    res.json({ changed: this.changes });
  });
});
app.delete('/api/apps/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM apps WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'apps', id);
    db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (e2, rows) => { if (!e2) broadcast('apps:update', rows); });
    res.json({ deleted: this.changes });
  });
});
// Public apps
app.get('/api/public/apps', (req, res) => {
  db.all(`SELECT * FROM apps WHERE enabled=1 ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Site Cards CRUD
app.get('/api/site-cards', requireAuth, (req, res) => {
  db.all(`SELECT * FROM site_cards ORDER BY sort_order ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.put('/api/site-cards/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, enabled, sort_order, style } = req.body;
  
  db.run(
    `UPDATE site_cards SET title=?, enabled=?, sort_order=?, style=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [title, enabled, sort_order, typeof style === 'object' ? JSON.stringify(style) : style, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'site_cards', id, { title, enabled, sort_order });
      res.json({ changed: this.changes });
      // Broadcast update if we were using sockets for this, but HomeView just fetches on mount. 
      // If we want real-time we should broadcast.
      db.all(`SELECT * FROM site_cards ORDER BY sort_order ASC`, [], (e2, rows) => {
        if (!e2) broadcast('site_cards:update', rows);
      });
    }
  );
});

// Public Site Cards
app.get('/api/public/site-cards', (req, res) => {
  db.all(`SELECT * FROM site_cards WHERE enabled=1 ORDER BY sort_order ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// About Page
app.get('/api/about', (req, res) => {
  db.get(`SELECT * FROM about_page WHERE id = 1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

app.put('/api/about', requireAuth, (req, res) => {
  const { content_html, content_markdown, author_name, author_avatar, author_github, github_repo, version } = req.body;
  db.run(
    `UPDATE about_page SET content_html=?, content_markdown=?, author_name=?, author_avatar=?, author_github=?, github_repo=?, version=?, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
    [content_html, content_markdown, author_name, author_avatar, author_github, github_repo, version],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'about_page', 1);
      res.json({ changed: this.changes });
    }
  );
});

// ENV management
const envFilePath = path.join(__dirname, '../.env');
function readEnvFile() {
  if (!fs.existsSync(envFilePath)) return {};
  const content = fs.readFileSync(envFilePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const obj = {};
  lines.forEach(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) obj[m[1]] = m[2];
  });
  return obj;
}
function writeEnvKey(key, value) {
  const content = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  let found = false;
  const newLines = lines.map(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) newLines.push(`${key}=${value}`);
  fs.writeFileSync(envFilePath, newLines.join('\n'));
}
function categorizeKey(key) {
  if (/^(DB_|DATABASE_)/.test(key)) return 'database';
  if (/^(REDIS_|CACHE_)/.test(key)) return 'cache';
  if (/^(VUE_APP_|API_|THIRD_|SERVICE_)/.test(key)) return 'api';
  return 'other';
}

app.get('/api/env', requireAuth, (req, res) => {
  const envFile = readEnvFile();
  db.all(`SELECT key, value_encrypted, category, updated_at FROM env_vars`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const result = {};
    // Merge env file values and DB (DB values considered secure; send masked)
    Object.keys(envFile).forEach(k => {
      const cat = categorizeKey(k);
      if (!result[cat]) result[cat] = [];
      result[cat].push({ key: k, value: envFile[k], secure: false, updated_at: null });
    });
    rows.forEach(r => {
      const cat = r.category || categorizeKey(r.key);
      if (!result[cat]) result[cat] = [];
      result[cat].push({ key: r.key, value: '••••••', secure: true, updated_at: r.updated_at });
    });
    res.json(result);
  });
});

app.put('/api/env', requireAuth, (req, res) => {
  const { key, value, category, secure = true } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  if (secure) {
    const enc = encrypt(String(value || ''));
    db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, [key], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const oldEnc = row ? row.value_encrypted : null;
      const cat = category || categorizeKey(key);
      const upsert = row
        ? `UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`
        : `INSERT INTO env_vars (value_encrypted, category, key) VALUES (?,?,?)`;
      const params = row ? [enc, cat, key] : [enc, cat, key];
  db.run(upsert, params, function(e2){
    if (e2) return res.status(500).json({ error: e2.message });
    db.run(`INSERT INTO env_history (key, old_value_encrypted, new_value_encrypted) VALUES (?,?,?)`, [key, oldEnc, enc]);
    // Also write plaintext to .env for runtime usage
    writeEnvKey(key, String(value || ''));
    logAction(req.user?.username, 'env_set', 'env_vars', null, { key });
    res.json({ ok: true });
  });
    });
  } else {
    // Store in .env only
    writeEnvKey(key, String(value || ''));
    logAction(req.user?.username, 'env_set_plain', 'env_vars', null, { key });
    res.json({ ok: true });
  }
});

app.get('/api/env/history', requireAuth, (req, res) => {
  const key = req.query.key;
  const params = key ? [key] : [];
  const where = key ? 'WHERE key=?' : '';
  db.all(`SELECT * FROM env_history ${where} ORDER BY updated_at DESC LIMIT 100`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/env/rollback', requireAuth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  db.get(`SELECT key, old_value_encrypted FROM env_history WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'history not found' });
    const plain = row.old_value_encrypted ? decrypt(row.old_value_encrypted) : '';
    const cat = categorizeKey(row.key);
    const enc = row.old_value_encrypted;
    db.run(`UPDATE env_vars SET value_encrypted=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE key=?`, [enc, cat, row.key], function(e2){
      if (e2) return res.status(500).json({ error: e2.message });
      writeEnvKey(row.key, plain);
      logAction(req.user?.username, 'env_rollback', 'env_vars', null, { id });
      res.json({ ok: true });
    });
  });
});

// System Logs
app.get('/api/logs', requireAuth, (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const offset = (page - 1) * pageSize;
  
  db.all(`SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`, [pageSize, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) as total FROM operation_logs`, [], (e2, c) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ items: rows, total: c.total, page, pageSize });
    });
  });
});

app.post('/api/logs/batch-delete', requireAuth, (req, res) => {
  const { ids, clearAll } = req.body;
  
  if (clearAll) {
    db.run(`DELETE FROM operation_logs`, [], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'clear_logs', 'operation_logs', null);
      res.json({ deleted: this.changes });
    });
    return;
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No IDs provided' });
  }

  const placeholders = ids.map(() => '?').join(',');
  db.run(`DELETE FROM operation_logs WHERE id IN (${placeholders})`, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete_logs', 'operation_logs', null, { count: this.changes });
    res.json({ deleted: this.changes });
  });
});

// Incidents CRUD
app.get('/api/public/incidents/active', (req, res) => {
  db.all(
    `SELECT * FROM incidents 
     WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) 
     ORDER BY type DESC, start_time DESC, created_at DESC`, 
    [Math.floor(Date.now() / 1000)], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

app.get('/api/incidents', requireAuth, (req, res) => {
  db.all(`SELECT * FROM incidents ORDER BY created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

app.post('/api/incidents', requireAuth, (req, res) => {
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `INSERT INTO incidents (title, content, status, type, start_time, end_time) VALUES (?,?,?,?,?,?)`,
    [title, content, status, type || 'incident', start_time || null, end_time || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'create', 'incidents', this.lastID, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { title, content, status, type, start_time, end_time } = req.body;
  db.run(
    `UPDATE incidents SET title=?, content=?, status=?, type=?, start_time=?, end_time=?, updated_at=strftime('%s', 'now') WHERE id=?`,
    [title, content, status, type, start_time || null, end_time || null, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'incidents', id, { title });
      db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
        if (!e2) broadcast('incidents:update', rows);
      });
      res.json({ changed: this.changes });
    }
  );
});

app.delete('/api/incidents/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM incidents WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'incidents', id);
    db.all(`SELECT * FROM incidents WHERE status != 'resolved' OR (type = 'maintenance' AND end_time > ?) ORDER BY type DESC, start_time DESC`, [Math.floor(Date.now() / 1000)], (e2, rows) => {
      if (!e2) broadcast('incidents:update', rows);
    });
    res.json({ deleted: this.changes });
  });
});

// Scheduled publish job
setInterval(() => {
  const now = Date.now();
  db.all(`SELECT id, scheduled_at, status FROM announcements WHERE status='draft' AND scheduled_at IS NOT NULL`, [], (err, rows) => {
    if (err || !rows) return;
    rows.forEach(r => {
      const t = new Date(r.scheduled_at).getTime();
      if (t && t <= now) {
        db.run(`UPDATE announcements SET status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [r.id]);
      }
    });
  });
}, 60000);
// WebSocket server
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  clients.forEach((ws) => {
    try { ws.send(msg); } catch {}
  });
}

// Upgrade HTTP -> WS
const server = require('http').createServer(app);
server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  if (url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

// Auth helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
function logAction(actor, action, entity, entity_id, payload) {
  const pStr = JSON.stringify(payload || {});
  db.run(
    `INSERT INTO operation_logs (actor, action, entity, entity_id, payload) VALUES (?,?,?,?,?)`,
    [actor || 'unknown', action, entity, entity_id || null, pStr],
    function(err) {
      if (!err) {
        // Construct the log object to broadcast
        // Note: created_at is generated by DB default CURRENT_TIMESTAMP, so we approximate it here or query it.
        // For UI refresh, approximate is usually fine, or we can just trigger a reload signal.
        // Sending the object allows immediate UI update without refetch if desired.
        const newLog = {
          id: this.lastID,
          actor: actor || 'unknown',
          action,
          entity,
          entity_id: entity_id || null,
          payload: pStr,
          created_at: new Date().toISOString()
        };
        broadcast('logs:new', newLog);
      }
    }
  );
}

// Seed admin user
db.get(`SELECT id FROM users WHERE username=?`, ['admin'], (err, row) => {
  if (err) console.error(err);
  const pwd = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(pwd, 10);
  if (!row) {
    db.run(`INSERT INTO users (username, password_hash, role) VALUES (?,?,?)`, ['admin', hash, 'admin']);
  } else if (process.env.ADMIN_PASSWORD) {
    db.run(`UPDATE users SET password_hash=? WHERE id=?`, [hash, row.id]);
  }
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

app.post('/api/admin/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username=?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

app.post('/api/admin/auth/refresh', requireAuth, (req, res) => {
  const uid = req.user?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  db.get(`SELECT * FROM users WHERE id=?`, [uid], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const token = jwt.sign({ uid: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  });
});

app.post('/api/admin/auth/change-password', requireAuth, (req, res) => {
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

app.post('/api/auth/change-password', requireAuth, (req, res) => {
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

// Music APIs Management

// Public: Get usable music APIs
app.get('/api/music/apis', (req, res) => {
  db.all(
    `SELECT * FROM music_apis WHERE enabled = 1 ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, latency ASC, id ASC`, 
    [], 
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ items: rows });
    }
  );
});

// Admin: Get all music APIs
app.get('/api/admin/music/apis', requireAuth, (req, res) => {
  db.all(`SELECT * FROM music_apis ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ items: rows });
  });
});

// Admin: Add music API
app.post('/api/admin/music/apis', requireAuth, (req, res) => {
  const { name, url, type, enabled = 1 } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });
  
  db.run(
    `INSERT INTO music_apis (name, url, type, enabled) VALUES (?,?,?,?)`,
    [name, url, type || 'netease', enabled],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      logAction(req.user?.username, 'create', 'music_apis', id, { name, url });
      res.json({ id });
    }
  );
});

// Admin: Update music API
app.put('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, url, type, enabled } = req.body;
  
  const sets = [];
  const params = [];

  if (typeof name !== 'undefined') { sets.push('name=?'); params.push(name); }
  if (typeof url !== 'undefined') { sets.push('url=?'); params.push(url); }
  if (typeof type !== 'undefined') { sets.push('type=?'); params.push(type); }
  if (typeof enabled !== 'undefined') { sets.push('enabled=?'); params.push(enabled); }

  if (sets.length === 0) {
    return res.json({ changed: 0 });
  }

  sets.push('updated_at=CURRENT_TIMESTAMP');
  params.push(id);
  
  db.run(
    `UPDATE music_apis SET ${sets.join(', ')} WHERE id=?`,
    params,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user?.username, 'update', 'music_apis', id, { name, url, enabled });
      res.json({ changed: this.changes });
    }
  );
});

// Admin: Delete music API
app.delete('/api/admin/music/apis/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM music_apis WHERE id=?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user?.username, 'delete', 'music_apis', id);
    res.json({ deleted: this.changes });
  });
});

// Admin: Check music API
app.post('/api/admin/music/apis/check', requireAuth, async (req, res) => {
  const { id } = req.body;
  
  const checkUrl = async (url) => {
    const start = Date.now();
    try {
      // Clean URL
      const targetUrl = url.replace(/\/$/, '');
      // Use /banner as a lightweight check endpoint or /search
      const response = await axios.get(`${targetUrl}/banner`, { timeout: 5000 });
      const latency = Date.now() - start;
      if (response.status === 200 && response.data.code === 200) {
        return { status: 'active', latency };
      }
      return { status: 'error', latency: 0 };
    } catch (e) {
      return { status: 'error', latency: 0 };
    }
  };

  if (id) {
    // Check specific API
    db.get(`SELECT * FROM music_apis WHERE id=?`, [id], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'API not found' });
      
      const result = await checkUrl(row.url);
      db.run(
        `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [result.status, result.latency, id],
        function(e2) {
          if (e2) return res.status(500).json({ error: e2.message });
          res.json({ ...result, id });
        }
      );
    });
  } else {
    // Check all enabled APIs
    db.all(`SELECT * FROM music_apis`, [], async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const results = [];
      for (const row of rows) {
        const result = await checkUrl(row.url);
        await new Promise((resolve) => {
          db.run(
            `UPDATE music_apis SET status=?, latency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [result.status, result.latency, row.id],
            () => resolve()
          );
        });
        results.push({ id: row.id, ...result });
      }
      res.json({ results });
    });
  }
});

app.use('/api/admin', (req, res, next) => {
  if (req.url.startsWith('/auth/')) return next();
  return requireAuth(req, res, () => {
    req.url = `/api${req.url}`;
    app.handle(req, res, next);
  });
});

// SPA Fallback - Must be last
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});
