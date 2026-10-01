/*
 * 图片与文件：应用截图同源代理、文件上传、上传目录列表
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth.cjs');
const { SCREENSHOT_PROXY_DISABLED, SCREENSHOT_TTL_MS, screenshotCache, screenshotInFlight, isAllowedScreenshotUrl, sniffImageType, fetchScreenshot, rememberScreenshot, evictScreenshot } = require('../lib/screenshot.cjs');
const { uploadsDir, UPLOAD_MAX_BYTES, upload } = require('../lib/uploads.cjs');

const router = express.Router();

router.get('/api/screenshot', async (req, res) => {
  if (SCREENSHOT_PROXY_DISABLED()) {
    return res.status(403).type('text/plain').send('screenshot proxy disabled');
  }

  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) return res.status(400).type('text/plain').send('url is required');
  if (!isAllowedScreenshotUrl(raw)) return res.status(403).type('text/plain').send('url not allowed');

  const cached = screenshotCache.get(raw);
  if (cached && Date.now() - cached.ts < SCREENSHOT_TTL_MS) {
    rememberScreenshot(raw, cached.buffer, cached.contentType);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Content-Length', String(cached.buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(cached.buffer);
  }
  if (cached) {
    evictScreenshot(raw);
  }

  try {
    let pending = screenshotInFlight.get(raw);
    if (!pending) {
      pending = fetchScreenshot(raw);
      screenshotInFlight.set(raw, pending);
      pending
        .finally(() => screenshotInFlight.delete(raw))
        .catch(() => {});
    }

    const buffer = await pending;
    const contentType = sniffImageType(buffer);
    if (!contentType) {
      return res.status(502).type('text/plain').send('upstream response is not an image');
    }

    rememberScreenshot(raw, buffer, contentType);
    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.end(buffer);
  } catch (error) {
    console.warn('[screenshot proxy]', error.message, raw);
    return res.status(502).type('text/plain').send('screenshot fetch failed');
  }
});

router.post('/api/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `文件过大，单次上传上限 ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB`
          : err.message
      });
    }
    if (!req.file) return res.status(400).json({ error: '没有收到文件' });
    // 前后端同域，返回相对路径即可
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

router.get('/api/uploads', requireAuth, (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      console.error('Failed to list uploads:', err);
      return res.status(500).json({ error: 'Failed to list uploads' });
    }

    const fileStats = files
      .map(file => {
        try {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          return {
            name: file,
            url: `/uploads/${file}`,
            mtime: stats.mtimeMs,
            size: stats.size
          };
        } catch (e) {
          return null;
        }
      })
      .filter(f => f && /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name))
      .sort((a, b) => b.mtime - a.mtime);

    res.json({ items: fileStats });
  });
});

module.exports = router;
