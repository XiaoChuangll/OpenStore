import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// 服务端模块是 CJS 且无类型声明，按 CJS 引入
const require = createRequire(import.meta.url);
const db = require('../../server/database.cjs');
const { normalizeUrl, runDailyTick, saveSettings, loadConfig } = require('../../server/lib/seo-submit.cjs');

/*
 * SEO 提交：URL 归一化与每日调度。
 * 归一化用例不落库；调度用例会在测试库中写入少量数据，结束后清理。
 */

const SITE = 'https://seo-test.local';
const SETTING_RUN_DAY = 'seo_last_run_day';

const run = (sql: string, params: unknown[] = []) =>
  new Promise<void>((resolve, reject) => {
    db.run(sql, params, (err: Error | null) => (err ? reject(err) : resolve()));
  });
const get = (sql: string, params: unknown[] = []) =>
  new Promise<any>((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: unknown) => (err ? reject(err) : resolve(row)));
  });

/** 北京时间日期与小时 */
const beijingNow = () => {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
};

/** 假 axios：配额充足且提交成功，避免真实出站 */
const fakeAxios = () => ({
  get: async () => ({ status: 200, data: { d: { DailyQuota: 1000, MonthlyQuota: 1000 } } }),
  post: async () => ({ status: 200, data: { d: null } })
});

const seedQueue = (path: string) =>
  run(
    `INSERT INTO seo_url_queue (path, normalized_url, dedupe_key, hits, first_seen, last_seen, submit_status, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending', CURRENT_TIMESTAMP)
     ON CONFLICT(dedupe_key) DO UPDATE SET last_seen = CURRENT_TIMESTAMP, submit_status = 'pending'`,
    [path, `${SITE}${path}`, `${SITE}${path}`]
  );

describe('SEO URL 归一化', () => {
  const norm = (p: string) => normalizeUrl(p, SITE);

  it('同一页面的不同写法归一到同一 URL', () => {
    expect(norm('/apps/com.demo/')).toBe(`${SITE}/apps/com.demo`);
    expect(norm('/articles/hello?utm_source=x&from=share')).toBe(`${SITE}/articles/hello`);
    expect(norm('/dashboard?b=2&a=1')).toBe(`${SITE}/dashboard?a=1&b=2`);
    expect(norm('/dashboard?app_id=9')).toBe(`${SITE}/dashboard?app_id=9`);
    expect(norm('/')).toBe(`${SITE}/`);
  });

  it('丢弃不影响渲染的参数，避免同一页面产生多条 URL', () => {
    // title 是页面标题的展示副本；时间戳与 el-id 是埋点/组件内部产物
    for (const noisy of [
      '/apps/C123?title=QQ邮箱',
      '/?ide_webview_request_time=1768362351837',
      '/?from=/topics',
      '/apps/C123?title=x&utm_source=wx&el-id-2212-5=app',
      '/apps/C123?_t=123&ts=456'
    ]) {
      expect(norm(noisy)).toBe(`${SITE}${noisy.split('?')[0]}`);
    }
  });

  it('保留影响页面内容的参数', () => {
    expect(norm('/apps?category=工具')).toBe(`${SITE}/apps?category=${encodeURIComponent('工具')}`);
    expect(norm('/apps?device=phone')).toBe(`${SITE}/apps?device=phone`);
    expect(norm('/updates?tab=new&filter=thisWeek&page=2')).toBe(
      `${SITE}/updates?filter=thisWeek&page=2&tab=new`
    );
  });

  it('拒绝站外地址与无页面语义的输入', () => {
    expect(norm('https://evil.com/x')).toBe('');
    expect(norm('//evil.com/x')).toBe('');
    expect(norm('')).toBe('');
    expect(norm('   ')).toBe('');
    expect(norm('apps')).toBe('');
    expect(norm('javascript:alert(1)')).toBe('');
  });

  it('过滤后台、接口与静态资源', () => {
    for (const bad of ['/admin/dashboard', '/api/public/apps', '/login', '/submit', '/player', '/uploads/a.png', '/favicon.ico']) {
      expect(norm(bad)).toBe('');
    }
    for (const good of ['/apps/com.foo', '/articles/hello', '/rank/category', '/topics/t1', '/about']) {
      expect(norm(good)).not.toBe('');
    }
  });
});

describe('SEO 后台路由的中间件挂载方式', () => {
  // vitest 的 cwd 即项目根
  const routeSource = () => readFileSync('server/routes/seo.cjs', 'utf8');

  it('不得使用 router.use 声明鉴权（挂根路径时会拦截全站请求）', () => {
    // 本路由经 app.use(router) 挂在根路径，router.use 的中间件会对所有请求执行。
    // 曾因此把 /api/auth/login 一并拦成 401，导致全站无法登录。
    const code = routeSource().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/router\.use\s*\(/);
  });

  it('每条后台路由都挂了鉴权中间件', () => {
    const routes = [...routeSource().matchAll(/router\.(get|put|post)\('(\/api\/admin\/seo[^']*)',\s*([A-Za-z_$][\w$]*)/g)];
    expect(routes.length).toBeGreaterThanOrEqual(9);
    const withoutAuth = routes.filter((m) => m[3] !== 'auth').map((m) => m[2]);
    expect(withoutAuth).toEqual([]);
  });
});

describe('SEO 每日调度', () => {
  let original: { enabled: number; autoSubmit: number; submitHour: number };

  beforeAll(async () => {
    const config = await loadConfig();
    original = { enabled: config.enabled, autoSubmit: config.autoSubmit, submitHour: config.submitHour };
    await run(`DELETE FROM seo_url_queue WHERE dedupe_key LIKE ?`, [`${SITE}%`]);
    await run(`DELETE FROM seo_submissions WHERE url LIKE ?`, [`${SITE}%`]);
    await run(`DELETE FROM system_settings WHERE key = ?`, [SETTING_RUN_DAY]);
    // 把「上次执行日」设成昨天，构造出新的一天
    const yesterday = new Date(Date.now() + 8 * 3600 * 1000 - 86400000).toISOString().slice(0, 10);
    await run(`INSERT INTO system_settings (key, value) VALUES (?, ?)`, [SETTING_RUN_DAY, yesterday]);
    await saveSettings({ enabled: 1, autoSubmit: 1, submitHour: 0, bing_api_key: 'SEOTEST-KEY-0001' });
  });

  afterAll(async () => {
    await run(`DELETE FROM seo_url_queue WHERE dedupe_key LIKE ?`, [`${SITE}%`]);
    await run(`DELETE FROM seo_submissions WHERE url LIKE ?`, [`${SITE}%`]);
    await run(`DELETE FROM system_settings WHERE key = ?`, [SETTING_RUN_DAY]);
    await saveSettings({ ...original, bing_api_key: '' });
  });

  it('未到配置时刻时不提交', async () => {
    const { hour } = beijingNow();
    if (hour >= 23) return; // 当天已无更晚的时刻可构造
    await saveSettings({ submitHour: hour + 1 });
    const result = await runDailyTick({ deps: { axios: fakeAxios() } });
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain('未到');
  });

  it('到点且当日未执行时提交，并记录当日已执行', async () => {
    await seedQueue('/apps/dispatch-case');
    await saveSettings({ submitHour: 0 });

    const first = await runDailyTick({ deps: { axios: fakeAxios() } });
    expect(first.skipped).toBeFalsy();
    expect(first.succeeded).toBeGreaterThanOrEqual(1);

    const row = await get(`SELECT value FROM system_settings WHERE key = ?`, [SETTING_RUN_DAY]);
    expect(row.value).toBe(beijingNow().day);
  });

  it('当日重复触发不再提交', async () => {
    await seedQueue('/apps/dispatch-case-2');
    const before = await get(`SELECT COUNT(*) AS n FROM seo_submissions WHERE url LIKE ?`, [`${SITE}%`]);

    const second = await runDailyTick({ deps: { axios: fakeAxios() } });
    expect(second.skipped).toBe(true);
    expect(second.reason).toContain('已经执行过');

    const after = await get(`SELECT COUNT(*) AS n FROM seo_submissions WHERE url LIKE ?`, [`${SITE}%`]);
    expect(after.n).toBe(before.n);
  });

  it('总开关关闭时不执行', async () => {
    await saveSettings({ enabled: 0 });
    const result = await runDailyTick({ deps: { axios: fakeAxios() } });
    expect(result.skipped).toBe(true);
    await saveSettings({ enabled: 1 });
  });
});
