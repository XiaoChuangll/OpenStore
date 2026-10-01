/*
 * UptimeRobot 监控状态
 */
const express = require('express');
const { resolveMonitors, MONITORS_CACHE_TTL_MS } = require('../lib/monitors.cjs');

const router = express.Router();

router.get('/api/monitors', async (req, res) => {
  const result = await resolveMonitors();
  if (result.state === 'error') {
    return res.status(500).json({ error: 'Failed to fetch monitors' });
  }
  res.setHeader('X-Cache', result.state === 'fresh' ? 'HIT' : result.state === 'stale' ? 'STALE' : 'MISS');
  if (result.state !== 'stale') {
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(MONITORS_CACHE_TTL_MS / 1000)}`);
  }
  res.json(result.data);
});

module.exports = router;
