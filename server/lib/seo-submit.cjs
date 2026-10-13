/*
 * SEO 收录提交：把访客真实访问过的前台路径提交给搜索引擎。
 *
 * 数据流：
 *   index.cjs（访客入库后）→ enqueuePath()
 *     → seo_url_queue（按归一化 URL 聚合 hits / first_seen / last_seen）
 *       → runSubmission()：取数 → 归一化过滤 → 按额度分批提交
 *         → 必应 Webmaster API（主）/ IndexNow（备）
 *           → seo_submissions（提交记录）
 *
 * 两条通道：
 *   - 必应 Webmaster API：需后台生成的 API key，单请求 ≤500 条、10000 条/天，
 *     可用 GetUrlSubmissionQuota 查询剩余额度；
 *   - IndexNow：无需后台操作，靠站点托管的 key 文件验证归属，单请求 ≤10000 条，
 *     无额度查询接口，限速时返回 429。
 */
const crypto = require('crypto');
const axios = require('axios');
const db = require('../database.cjs');
const { SITE_ORIGIN } = require('./share-cards.cjs');
const { encrypt, decrypt } = require('./secret.cjs');
const { pushLiveLog } = require('./live-log.cjs');

/* ============================ 配置 ============================ */

const SETTING_PREFIX = 'seo_';

/** 配置默认值；后台面板的初值与此一致 */
const DEFAULT_CONFIG = {
  // 总开关。关闭后访客路径仍会入队，只是不再自动提交
  enabled: 1,
  autoSubmit: 1,
  bingEnabled: 1,
  indexNowEnabled: 1,
  // 站点根 URL，须与必应后台验证过的站点一致
  siteUrl: SITE_ORIGIN,
  // 单次请求的 URL 条数
  batchSize: 200,
  // 每日提交上限
  dailyLimit: 5000,
  // 每天几点（北京时间 0~23）执行自动提交
  submitHour: 0,
  // 单条 URL 至少被访问几次才提交
  minHits: 1,
  // 相邻两批之间的间隔，避免触发限速
  requestDelayMs: 1200
};

/** 数值型配置的取值范围 */
const NUM_RANGES = {
  batchSize: [1, 500],
  dailyLimit: [1, 10000],
  submitHour: [0, 23],
  minHits: [1, 100],
  requestDelayMs: [0, 10000]
};
const BOOL_KEYS = ['enabled', 'autoSubmit', 'bingEnabled', 'indexNowEnabled'];

const clampNumber = (value, [min, max], fallback) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const toBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return /^(1|true|yes|on)$/i.test(String(value).trim()) ? 1 : 0;
};

/**
 * 读取配置：system_settings 中所有 seo_ 前缀的键。
 * 返回的 plainBingKey 是明文，仅供服务端出站请求使用，对外须用 maskKey 脱敏。
 * bing_api_key 解密失败（如更换过 ENV_SECRET_KEY）时按未配置处理。
 */
const loadConfig = () =>
  new Promise((resolve) => {
    db.all(`SELECT key, value FROM system_settings WHERE key LIKE '${SETTING_PREFIX}%'`, [], (err, rows) => {
      const raw = {};
      for (const row of err ? [] : rows || []) {
        raw[String(row.key).slice(SETTING_PREFIX.length)] = row.value;
      }

      const config = { ...DEFAULT_CONFIG };
      config.siteUrl = String(raw.siteUrl || DEFAULT_CONFIG.siteUrl || SITE_ORIGIN).replace(/\/+$/, '');
      for (const key of BOOL_KEYS) config[key] = toBool(raw[key], DEFAULT_CONFIG[key]);
      for (const [key, range] of Object.entries(NUM_RANGES)) {
        config[key] = clampNumber(raw[key], range, DEFAULT_CONFIG[key]);
      }

      // IndexNow key 由 database.cjs 首次启动时生成；此处兜底处理库被清空的情况
      config.indexNowKey = String(raw.indexnow_key || '').trim();
      if (!/^[a-zA-Z0-9-]{8,128}$/.test(config.indexNowKey)) {
        config.indexNowKey = crypto.randomBytes(16).toString('hex');
        saveSettings({ indexnow_key: config.indexNowKey }).catch(() => {});
      }

      config.bingKeyMasked = maskKey(decrypt(String(raw.bing_api_key || '')));
      config.plainBingKey = decrypt(String(raw.bing_api_key || ''));
      resolve(config);
    });
  });

/**
 * 批量写入配置。
 * bing_api_key 加密后存储，传空串表示清除；其余键原样存字符串。
 * @returns {Promise<{updated: number, error?: string}>}
 */
const saveSettings = (patch = {}) =>
  new Promise((resolve) => {
    const entries = Object.entries(patch);
    if (!entries.length) return resolve({ updated: 0 });

    let settled = 0;
    let failed = null;
    const done = () => {
      settled += 1;
      if (settled < entries.length) return;
      if (failed) resolve({ updated: 0, error: failed.message });
      else resolve({ updated: entries.length });
    };

    entries.forEach(([key, value]) => {
      const shouldEncrypt = key === 'bing_api_key';
      const stored = shouldEncrypt ? (value ? encrypt(String(value)) : '') : String(value ?? '');
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
        [`${SETTING_PREFIX}${key}`, stored],
        (err) => {
          if (err && !failed) failed = err;
          done();
        }
      );
    });
  });

/** 只保留末 4 位，用于界面回显与日志 */
function maskKey(plain) {
  const value = String(plain || '');
  if (!value) return '';
  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

/** 抹掉文本中的 API key（必应协议把 key 放在 URL 查询参数里） */
const redact = (text) =>
  String(text == null ? '' : text)
    .replace(/([?&](?:apikey|key)=)[^&\s]*/gi, '$1***')
    .replace(/sampleapikey[a-z0-9]*/gi, '***')
    .slice(0, 500);

/* ====================== URL 归一化与过滤 ====================== */

/** 静态资源后缀，不进入提交队列 */
const STATIC_EXT_RE = /\.(?:js|mjs|css|map|json|xml|txt|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|eot|otf|mp3|mp4|webm|m4a|wav|ogg|zip|gz|exe|apk|hsp|pdf|csv)$/i;

/** 不应被收录的路径：后台、接口、上传与静态资源、无索引价值的页面 */
const isExcludedPath = (pathname) => {
  const p = pathname.toLowerCase();
  if (p.startsWith('/admin')) return true;
  if (p.startsWith('/api')) return true;
  if (p.startsWith('/uploads')) return true;
  if (p.startsWith('/assets')) return true;
  if (['/login', '/admin/login', '/submit'].includes(p)) return true;
  // 播放器地址带 ?track= 会衍生大量近似 URL
  if (p === '/player') return true;
  if (STATIC_EXT_RE.test(p)) return true;
  return false;
};

/**
 * 把访客路径转换为可提交的规范 URL。
 *
 * 处理内容：丢弃追踪参数（utm_* / from / share 等）、参数按字典序排序、
 * 去掉结尾多余斜杠、拒绝站外地址与非前台路径。
 *
 * @param {string} rawPath 访客原始路径，可为 "/x/y" 或同源绝对地址
 * @param {string} siteUrl 站点 origin
 * @returns {string} 规范 URL；不可提交时返回空串
 */
function normalizeUrl(rawPath, siteUrl) {
  const origin = String(siteUrl || SITE_ORIGIN || '').replace(/\/+$/, '');
  if (!origin) return '';

  const raw = String(rawPath == null ? '' : rawPath).trim();
  if (!raw) return '';

  // 站点相对路径压平重复斜杠；"//" 开头是协议相对地址，一律拒绝
  const isAbsolute = /^https?:\/\//i.test(raw);
  if (!isAbsolute && !raw.startsWith('/')) return '';
  if (!isAbsolute && raw.startsWith('//')) return '';
  const candidate = isAbsolute ? raw : raw.replace(/\/{2,}/g, '/');

  let url;
  try {
    url = new URL(candidate, `${origin}/`);
  } catch {
    return '';
  }

  let siteOrigin;
  try {
    siteOrigin = new URL(origin).origin;
  } catch {
    return '';
  }
  if (url.origin !== siteOrigin) return '';

  const pathname = url.pathname.replace(/\/{2,}/g, '/') || '/';
  if (isExcludedPath(pathname)) return '';

  const keep = [];
  url.searchParams.forEach((value, key) => {
    if (/^utm_/i.test(key)) return;
    if (/^(from|share|spm|ref|referrer|source|scene|src)$/i.test(key)) return;
    keep.push([key, value]);
  });
  keep.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

  const search = keep.length
    ? `?${keep.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
    : '';
  const cleanPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';

  return `${siteOrigin}${cleanPath}${search}`;
}

/* ============================ 入队 ============================ */

/**
 * 将访问路径写入提交队列。同一条归一化 URL 累加 hits 并刷新 last_seen。
 * 在访客统计中间件中调用，失败时不抛异常、不影响请求流程。
 *
 * @param {string} rawPath 访客原始路径
 * @param {string} [siteUrl] 站点 origin，省略则取 SITE_ORIGIN
 */
function enqueuePath(rawPath, siteUrl) {
  try {
    const origin = String(siteUrl || SITE_ORIGIN || '').replace(/\/+$/, '');
    const url = normalizeUrl(rawPath, origin);
    if (!url) return;

    db.run(
      `INSERT INTO seo_url_queue (path, normalized_url, dedupe_key, hits, first_seen, last_seen, submit_status, updated_at)
       VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         hits = hits + 1,
         last_seen = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         normalized_url = excluded.normalized_url`,
      [String(rawPath).slice(0, 500), url, url],
      () => {}
    );
  } catch {
    /* 入队失败不影响请求 */
  }
}

/* ========================== 提交通道 ========================== */

const BING_BATCH_MAX = 500;       // 必应单请求上限
const BING_DAILY_MAX = 10000;     // 必应每日提交上限
const INDEXNOW_BATCH_MAX = 10000; // IndexNow 单请求上限

const BING_JSON_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

/** 按 HTTP 状态码判定失败类型，retryable 为 false 表示不应重试 */
const classifyHttp = (status) => {
  if (status === 429) return { status: 'quota', retryable: true, message: '被限速（429），等待下个周期重试' };
  if (status === 403) return { status: 'retry', retryable: true, message: '鉴权失败（403），检查 API key 与站点归属' };
  if (status === 400 || status === 422) return { status: 'retry', retryable: true, message: `请求被拒绝（${status}），URL 或站点不匹配` };
  if (status >= 500) return { status: 'retry', retryable: true, message: `必应服务端错误（${status}）` };
  return { status: 'retry', retryable: true, message: `提交失败（HTTP ${status}）` };
};

/** 从必应返回的 Fault 结构中取出错误说明 */
const faultMessage = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const fault = payload.d || payload;
  return String(
    fault.Message || fault.message || fault.ExceptionMessage || fault.ErrorMessage || ''
  ).slice(0, 300);
};

/**
 * 必应 Webmaster API：SubmitUrlBatch。
 * API key 按官方协议放在查询参数中。
 * @returns {Promise<{ok: boolean, status: string, retryable: boolean, httpStatus?: number, message: string}>}
 */
async function sendBing(urls, config, deps) {
  const plainKey = config.plainBingKey || deps.getPlainBingKey?.() || '';
  if (!plainKey) {
    return { ok: false, status: 'skipped', retryable: false, message: '未配置必应 API key' };
  }

  const api = deps.axios || axios;
  try {
    const response = await api.post(
      `${BING_JSON_BASE}/SubmitUrlbatch`,
      { siteUrl: config.siteUrl, urlList: urls },
      {
        params: { apikey: plainKey },
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        timeout: 20000,
        validateStatus: () => true
      }
    );

    const body = response.data;
    const fault = faultMessage(body);
    const httpOk = response.status >= 200 && response.status < 300;

    if (httpOk && !fault) {
      return { ok: true, status: 'success', retryable: false, httpStatus: response.status, message: '' };
    }
    if (httpOk && fault) {
      const isQuota = /quota|limit|exceed/i.test(fault);
      return {
        ok: false,
        status: isQuota ? 'quota' : 'retry',
        retryable: !isQuota,
        httpStatus: response.status,
        message: redact(fault)
      };
    }
    const verdict = classifyHttp(response.status);
    return { ...verdict, ok: false, httpStatus: response.status, message: redact(fault || verdict.message) };
  } catch (error) {
    const status = error?.response?.status;
    if (status) {
      const verdict = classifyHttp(status);
      return { ...verdict, ok: false, httpStatus: status };
    }
    return { ok: false, status: 'retry', retryable: true, message: redact(error?.code || error?.message || '网络异常') };
  }
}

/**
 * IndexNow 提交。key 文件由 index.cjs 托管在站点根目录，搜索引擎抓取后完成归属验证。
 * 站点需可公网访问，本地环境提交会返回 403。
 */
async function sendIndexNow(urls, config, deps) {
  const key = config.indexNowKey;
  if (!key) {
    return { ok: false, status: 'skipped', retryable: false, message: '未生成 IndexNow key' };
  }

  let host;
  try {
    host = new URL(config.siteUrl).host;
  } catch {
    return { ok: false, status: 'skipped', retryable: false, message: '站点 URL 不合法' };
  }

  const api = deps.axios || axios;
  try {
    const response = await api.post(
      'https://api.indexnow.org/indexnow',
      {
        host,
        key,
        keyLocation: `${config.siteUrl}/indexnow-key.txt`,
        urlList: urls
      },
      {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        timeout: 20000,
        validateStatus: () => true
      }
    );

    const status = response.status;
    if (status === 200 || status === 202) {
      return { ok: true, status: 'success', retryable: false, httpStatus: status, message: '' };
    }
    if (status === 429) {
      return { ok: false, status: 'quota', retryable: true, httpStatus: status, message: 'IndexNow 限速（429）' };
    }
    const hint =
      status === 403
        ? 'IndexNow key 文件校验失败（确认 /indexnow-key.txt 可访问）'
        : status === 422
          ? 'IndexNow 拒绝：URL host 与 key 文件不匹配'
          : `IndexNow 返回 HTTP ${status}`;
    return { ok: false, status: 'retry', retryable: status >= 500, httpStatus: status, message: hint };
  } catch (error) {
    return {
      ok: false,
      status: 'retry',
      retryable: true,
      message: redact(error?.code || error?.message || 'IndexNow 网络异常')
    };
  }
}

/**
 * 查询必应当日剩余额度。
 * @returns {Promise<{dailyQuota: number, monthlyQuota: number|null}|null>} null 表示查询不可用
 */
async function fetchBingQuota(config, deps) {
  const plainKey = config.plainBingKey || deps.getPlainBingKey?.() || '';
  if (!plainKey) return null;

  const api = deps.axios || axios;
  try {
    const response = await api.get(`${BING_JSON_BASE}/GetUrlSubmissionQuota`, {
      params: { siteUrl: config.siteUrl, apikey: plainKey },
      timeout: 15000,
      validateStatus: () => true
    });
    if (response.status < 200 || response.status >= 300) return null;
    const payload = response.data?.d ?? response.data;
    const dailyQuota = Number(payload?.DailyQuota);
    const monthlyQuota = Number(payload?.MonthlyQuota);
    if (!Number.isFinite(dailyQuota)) return null;
    return { dailyQuota, monthlyQuota: Number.isFinite(monthlyQuota) ? monthlyQuota : null };
  } catch {
    return null;
  }
}

/* ========================== 取待提交 URL ========================== */

/** 北京时间当天 00:00 对应的 UTC 时刻 */
const CN_DAY_START_SQL = "datetime('now', '+8 hours', 'start of day', '-8 hours')";

/** 取数窗口：最近 48 小时内有访问的 URL */
const SUBMIT_WINDOW_SQL = "datetime('now', '-48 hours')";

/**
 * 取出本轮待提交的 URL。
 *
 * 筛选条件：last_seen 在最近 48 小时内、hits ≥ minHits、近 4 天未成功提交过、
 * 近 4 天失败次数 < 5；结果按归一化 URL 去重。
 *
 * @returns {Promise<Array<{id: number, path: string, url: string, hits: number}>>}
 */
const selectPending = (config, limit) =>
  new Promise((resolve) => {
    const sql = `
      SELECT id, path, normalized_url, hits,
             COALESCE((
               SELECT COUNT(*) FROM seo_submissions s
                WHERE s.url = q.normalized_url
                  AND s.status != 'success'
                  AND s.created_at > datetime('now', '-4 days')
             ), 0) AS attempts,
             COALESCE((
               SELECT COUNT(*) FROM seo_submissions s
                WHERE s.url = q.normalized_url
                  AND s.status = 'success'
                  AND s.created_at > datetime('now', '-4 days')
             ), 0) AS recent_success
        FROM seo_url_queue q
       WHERE q.dedupe_key IS NOT NULL
         AND q.dedupe_key != ''
         AND q.last_seen >= ${SUBMIT_WINDOW_SQL}
         AND q.hits >= ?
       ORDER BY q.last_seen DESC
       LIMIT ?`;

    // 放宽行数，去重后仍要凑够 limit
    db.all(sql, [config.minHits, Math.max(limit * 3, 300)], (err, rows) => {
      if (err || !rows) return resolve([]);

      const seen = new Set();
      const picked = [];
      for (const row of rows) {
        const url = row.normalized_url;
        if (!url || seen.has(url)) continue;
        if (Number(row.recent_success) > 0) continue;
        if (Number(row.attempts) >= 5) continue;
        seen.add(url);
        picked.push({ id: row.id, path: row.path, url, hits: Number(row.hits) || 0 });
        if (picked.length >= limit) break;
      }
      resolve(picked);
    });
  });

/** 今日成功提交的 URL 条数（按北京时间自然日） */
const countSubmittedToday = () =>
  new Promise((resolve) => {
    db.get(
      `SELECT COUNT(DISTINCT url) AS n FROM seo_submissions
        WHERE status = 'success' AND created_at >= ${CN_DAY_START_SQL}`,
      [],
      (err, row) => resolve(Number(err ? 0 : row?.n) || 0)
    );
  });

/** 待提交条数，筛选条件与 selectPending 一致 */
const countPending = (config) =>
  new Promise((resolve) => {
    const minHits = Math.max(1, Number(config?.minHits) || 1);
    db.get(
      `SELECT COUNT(DISTINCT q.normalized_url) AS n
         FROM seo_url_queue q
        WHERE q.dedupe_key IS NOT NULL
          AND q.dedupe_key != ''
          AND q.last_seen >= ${SUBMIT_WINDOW_SQL}
          AND q.hits >= ?
          AND COALESCE((
                SELECT COUNT(*) FROM seo_submissions s
                 WHERE s.url = q.normalized_url
                   AND s.status = 'success'
                   AND s.created_at > datetime('now', '-4 days')
              ), 0) = 0
          AND COALESCE((
                SELECT COUNT(*) FROM seo_submissions s
                 WHERE s.url = q.normalized_url
                   AND s.status != 'success'
                   AND s.created_at > datetime('now', '-4 days')
              ), 0) < 5`,
      [minHits],
      (err, row) => resolve(Number(err ? 0 : row?.n) || 0)
    );
  });

/** 记录一条提交结果 */
const recordSubmission = (entry) =>
  new Promise((resolve) => {
    db.run(
      `INSERT INTO seo_submissions
         (url, queue_id, channel, status, http_status, message, batch_size, key_masked)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        entry.url,
        entry.queueId || null,
        entry.channel || '',
        entry.status || 'unknown',
        Number.isFinite(entry.httpStatus) ? entry.httpStatus : null,
        redact(entry.message || ''),
        entry.batchSize || null,
        entry.keyMasked || ''
      ],
      () => resolve()
    );
  });

/** 将队列条目标记为已提交 */
const markSubmitted = (ids) =>
  new Promise((resolve) => {
    const list = (ids || []).filter((id) => Number.isFinite(Number(id)));
    if (!list.length) return resolve();
    const placeholders = list.map(() => '?').join(',');
    db.run(
      `UPDATE seo_url_queue
          SET submit_status = 'submitted', updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})`,
      list,
      () => resolve()
    );
  });

/* ========================== 提交主流程 ========================== */

// 串行锁：定时任务与手动提交可能同时触发，重叠会造成重复提交
let running = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * 执行一轮提交。
 *
 * @param {object} [options]
 * @param {string} [options.source] 触发来源，仅用于日志
 * @param {number} [options.limit] 本轮最多提交条数，默认取配置的 dailyLimit
 * @param {object} [options.deps] 依赖注入 { axios, getPlainBingKey }，供测试使用
 * @returns {Promise<object>} 本轮汇总：queued / attempted / succeeded / failed / channels 等
 */
async function runSubmission(options = {}) {
  const deps = options.deps || {};
  const source = options.source || 'manual';

  if (running) {
    return { skipped: true, reason: '上一轮提交尚未结束' };
  }
  running = true;

  const startedAt = Date.now();
  const summary = {
    source,
    startedAt,
    queued: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    channels: [],
    batches: [],
    skipped: false,
    reason: '',
    remainingQuota: null
  };

  try {
    const config = await loadConfig();
    summary.siteUrl = config.siteUrl;

    if (!config.enabled) {
      summary.skipped = true;
      summary.reason = '功能总开关已关闭';
      return summary;
    }

    const hasBing = config.bingEnabled && !!config.plainBingKey;
    const hasIndexNow = config.indexNowEnabled && !!config.indexNowKey;
    if (!hasBing && !hasIndexNow) {
      summary.skipped = true;
      summary.reason = '两条通道均不可用';
      return summary;
    }

    // 额度取「本轮上限」与「今日剩余」中的较小值
    const limit = Math.max(1, Math.floor(Number(options.limit) || config.dailyLimit));
    const submittedToday = await countSubmittedToday();
    let budget = Math.min(limit, Math.max(0, config.dailyLimit - submittedToday));

    if (budget <= 0) {
      summary.skipped = true;
      summary.reason = `今日额度已用完（已提交 ${submittedToday} / 上限 ${config.dailyLimit}）`;
      return summary;
    }

    let bingRemaining = null;
    if (hasBing) {
      const quota = await fetchBingQuota(config, deps);
      summary.quota = quota;
      if (quota) {
        bingRemaining = Math.min(quota.dailyQuota, BING_DAILY_MAX);
        summary.remainingQuota = bingRemaining;
        if (bingRemaining <= 0 && !hasIndexNow) {
          summary.skipped = true;
          summary.reason = '必应今日额度为 0，且 IndexNow 不可用';
          return summary;
        }
      }
    }

    const pending = await selectPending(config, budget);
    summary.queued = pending.length;
    if (!pending.length) {
      summary.skipped = true;
      summary.reason = '没有待提交的路径';
      return summary;
    }

    const batchSize = Math.min(config.batchSize, BING_BATCH_MAX);

    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      const urls = batch.map((item) => item.url);
      let result = null;
      let channel = '';

      // 必应有余量则走必应，否则退到 IndexNow
      const bingUsable = hasBing && (bingRemaining === null || bingRemaining > 0);
      if (bingUsable) {
        channel = 'bing';
        result = await sendBing(urls, config, deps);
        if (result.ok && bingRemaining !== null) {
          bingRemaining = Math.max(0, bingRemaining - urls.length);
          summary.remainingQuota = bingRemaining;
        }
        // 必应不可用时改用 IndexNow，而不是让整批失败
        if (!result.ok && hasIndexNow && (result.status === 'quota' || result.status === 'skipped')) {
          summary.channels.push({ channel: 'bing', status: result.status, message: result.message, size: urls.length });
          channel = 'indexnow';
          result = await sendIndexNow(urls, config, deps);
        }
      } else if (hasIndexNow) {
        channel = 'indexnow';
        result = await sendIndexNow(urls, config, deps);
      } else {
        result = { ok: false, status: 'skipped', message: '没有可用通道' };
        channel = 'none';
      }

      summary.attempted += batch.length;
      if (result.ok) summary.succeeded += batch.length;
      else summary.failed += batch.length;

      summary.channels.push({
        channel,
        status: result.status,
        httpStatus: result.httpStatus || null,
        message: result.message || '',
        size: urls.length
      });

      const status = result.ok ? 'success' : result.status === 'skipped' ? 'skipped' : 'failed';
      for (const item of batch) {
        await recordSubmission({
          url: item.url,
          queueId: item.id,
          channel,
          status,
          httpStatus: result.httpStatus,
          message: result.message,
          batchSize: urls.length,
          keyMasked: channel === 'bing' ? config.bingKeyMasked : maskKey(config.indexNowKey)
        });
      }

      if (result.ok) await markSubmitted(batch.map((item) => item.id));

      // 不可重试的错误继续跑只会刷满失败计数，直接结束本轮
      if (!result.ok && !result.retryable) {
        summary.reason = result.message || '通道不可用，已中止本轮';
        break;
      }
      if (!result.ok && result.status === 'quota' && !hasIndexNow) {
        summary.reason = '额度耗尽，已中止本轮';
        break;
      }

      if (offset + batchSize < pending.length) await sleep(config.requestDelayMs);
    }

    summary.elapsedMs = Date.now() - startedAt;
    pushLiveLog('info', `[seo] 提交完成：成功 ${summary.succeeded} / 尝试 ${summary.attempted}`, {
      kind: 'seo',
      source,
      succeeded: summary.succeeded,
      failed: summary.failed
    });
    return summary;
  } catch (error) {
    summary.error = redact(error?.message || error);
    pushLiveLog('error', `[seo] 提交异常：${summary.error}`, { kind: 'seo', source });
    return summary;
  } finally {
    running = false;
  }
}

/* ========================== 定时任务 ========================== */

let timer = null;
/** 已执行自动提交的北京日期（YYYY-MM-DD） */
let lastRunDay = '';

/** 取北京时间的日期与小时 */
const beijingNow = () => {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
};

const readLastRunDay = () =>
  new Promise((resolve) => {
    db.get(`SELECT value FROM system_settings WHERE key = '${SETTING_PREFIX}last_run_day'`, [], (err, row) => {
      resolve(String(err ? '' : row?.value || ''));
    });
  });

const writeLastRunDay = (day) => {
  db.run(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('${SETTING_PREFIX}last_run_day', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`,
    [String(day)],
    () => {}
  );
};

/**
 * 判断此刻是否应执行当日提交：已到 submitHour 且该北京日期尚未执行。
 * 进程在 submitHour 未运行时，起来后当天会补跑。
 * @returns {Promise<{due: boolean, day: string, reason?: string}>}
 */
const isDailyRunDue = async (config) => {
  const { day, hour } = beijingNow();
  if (!lastRunDay) lastRunDay = await readLastRunDay();
  if (lastRunDay === day) return { due: false, day, reason: '今天已经执行过' };
  if (hour < config.submitHour) {
    return { due: false, day, reason: `未到 ${String(config.submitHour).padStart(2, '0')}:00` };
  }
  return { due: true, day };
};

/**
 * 定时任务的一次心跳：到点且当日未执行则提交。
 * 先记录当日已执行再提交，避免提交过程中抛错导致 60 秒后重复触发。
 *
 * @param {object} [options] deps 透传给 runSubmission
 */
async function runDailyTick({ deps } = {}) {
  const config = await loadConfig();
  if (!config.enabled || !config.autoSubmit) {
    return { skipped: true, reason: config.enabled ? '自动提交已关闭' : '功能总开关已关闭' };
  }

  const { due, day, reason } = await isDailyRunDue(config);
  if (!due) return { skipped: true, reason, day };

  lastRunDay = day;
  writeLastRunDay(day);

  const summary = await runSubmission({ source: 'scheduler', deps });
  pushLiveLog(
    'info',
    `[seo] ${day} 定时提交：成功 ${summary.succeeded} / 尝试 ${summary.attempted}${summary.reason ? `（${summary.reason}）` : ''}`,
    { kind: 'seo', source: 'scheduler', day }
  );
  return { ...summary, day };
}

/**
 * 启动定时任务：每 tickMs 检查一次是否到点，改配置无需重启进程。
 * @returns {NodeJS.Timeout}
 */
function startScheduler({ tickMs = 60000 } = {}) {
  if (timer) return timer;

  readLastRunDay().then((day) => {
    lastRunDay = day;
  });

  timer = setInterval(async () => {
    try {
      await runDailyTick();
    } catch (error) {
      pushLiveLog('error', `[seo] 定时任务异常：${redact(error?.message || error)}`, { kind: 'seo' });
    }
  }, tickMs);

  if (timer.unref) timer.unref();
  return timer;
}

/** 供后台面板展示的执行状态 */
const schedulerState = async (config) => {
  const { day, hour } = beijingNow();
  const runDay = lastRunDay || (await readLastRunDay());
  const nextDay = runDay === day && hour >= config.submitHour ? '明天' : '今天';
  return {
    lastRunDay: runDay || null,
    ranToday: runDay === day,
    currentBeijingDay: day,
    currentBeijingHour: hour,
    nextRunText: `${nextDay} ${String(config.submitHour).padStart(2, '0')}:00（北京时间）`
  };
};

module.exports = {
  BING_BATCH_MAX,
  BING_DAILY_MAX,
  INDEXNOW_BATCH_MAX,
  loadConfig,
  saveSettings,
  maskKey,
  normalizeUrl,
  enqueuePath,
  selectPending,
  countPending,
  fetchBingQuota,
  runSubmission,
  runDailyTick,
  startScheduler,
  schedulerState,
  isRunning: () => running
};
