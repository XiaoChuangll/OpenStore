/*
 * UptimeRobot 监控状态代理。
 *
 * UptimeRobot 单次调用要 0.7~2.7s，而且每个访客都会打一次，
 * 所以这里做短时缓存 + 并发合并（同一时刻只发一次上游请求）+ 失败兜旧值。
 *
 * 本文件只负责取数，HTTP 路由在 index.cjs。
 */
const axios = require('axios');
const db = require('../database.cjs');
const { decrypt } = require('./secret.cjs');

const MONITORS_CACHE_TTL_MS = Math.max(0, Number(process.env.MONITORS_CACHE_TTL_SECONDS ?? 60)) * 1000;
let monitorsCache = { at: 0, data: null };
let monitorsInFlight = null;

const fetchMonitorsFromUpstream = async () => {
  let API_KEY = '';
    try {
      await new Promise((resolve) => {
        db.get(`SELECT value_encrypted FROM env_vars WHERE key=?`, ['VUE_APP_API_KEY'], (e1, row) => {
          if (!e1 && row && row.value_encrypted) {
            const plain = decrypt(row.value_encrypted);
            if (plain && plain.trim()) API_KEY = plain.trim();
          }
          resolve();
        });
      });
    } catch {}
    if (!API_KEY) API_KEY = process.env.VUE_APP_API_KEY || '';
    if (!API_KEY) {
      return { stat: 'ok', monitors: [] };
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
    return response.data;
};

/**
 * 取监控数据，并告知调用方这次是「新鲜缓存」「刚抓的」还是「上游挂了用旧数据兜的」。
 *
 * 和原实现完全一致的三条分支：
 *   fresh  —— 缓存还在 TTL 内，直接返回，不发请求；
 *   fresh-fetch —— 需要抓一次，并发请求共用同一个 Promise（single-flight）；
 *   stale  —— 抓失败但有旧数据，用旧数据顶着，别让首页跟着报错；
 *   error  —— 抓失败且没有旧数据，交给调用方回 500。
 */
const resolveMonitors = async () => {
  const fresh = monitorsCache.data && Date.now() - monitorsCache.at < MONITORS_CACHE_TTL_MS;
  if (fresh) return { state: 'fresh', data: monitorsCache.data };

  try {
    // 同一时刻只有一次上游请求，其他并发请求等它的结果
    if (!monitorsInFlight) {
      monitorsInFlight = fetchMonitorsFromUpstream().finally(() => {
        monitorsInFlight = null;
      });
    }
    const data = await monitorsInFlight;
    monitorsCache = { at: Date.now(), data };
    return { state: 'fresh-fetch', data };
  } catch (error) {
    console.error('UptimeRobot API Error:', error.message);
    // 上游挂了就先用旧数据顶着
    if (monitorsCache.data) return { state: 'stale', data: monitorsCache.data };
    return { state: 'error', error };
  }
};

module.exports = { MONITORS_CACHE_TTL_MS, resolveMonitors };
