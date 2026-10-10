import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { buildDayTrendQuery } from '../../server/lib/visitor-trend.cjs';

// sqlite3 是原生模块且没有类型声明，这里按 CJS 引进来用
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');

/*
 * 访客趋势（天粒度）的窗口边界。
 *
 * 这类 SQL 只有真的跑一遍才知道对不对：时间戳按 UTC 存、窗口按北京时间切，
 * 光看代码很容易差一天（以前 days 写成 "- days" 就多算了一天）。
 */

type Db = {
  run: (sql: string, params?: unknown[]) => Promise<void>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  close: () => Promise<void>;
};

const makeDb = async (): Promise<Db> => {
  const raw = await new Promise<any>((resolve, reject) => {
    const database = new sqlite3.Database(':memory:', (err: Error | null) =>
      err ? reject(err) : resolve(database)
    );
  });
  await new Promise<void>((resolve, reject) =>
    raw.run('CREATE TABLE visitors (id INTEGER PRIMARY KEY, timestamp TEXT, ip TEXT)', (err: Error | null) =>
      err ? reject(err) : resolve()
    )
  );
  return {
    run: (sql, params = []) =>
      new Promise<void>((resolve, reject) =>
        raw.run(sql, params, (err: Error | null) => (err ? reject(err) : resolve()))
      ),
    all: (sql, params = []) =>
      new Promise((resolve, reject) =>
        raw.all(sql, params, (err: Error | null, rows: Array<Record<string, any>>) =>
          err ? reject(err) : resolve(rows)
        )
      ),
    close: () =>
      new Promise<void>((resolve, reject) =>
        raw.close((err: Error | null) => (err ? reject(err) : resolve()))
      )
  };
};

/** 跑一遍趋势查询（和 server/routes/visitors.cjs 里天粒度那段的拼法一致） */
const trendRows = async (database: Db, days: number, offset = 0) => {
  const { where, params, bucket } = buildDayTrendQuery({ days, offset });
  return database.all(
    `SELECT ${bucket} as date, COUNT(*) as count, COUNT(DISTINCT ip) as unique_ip
     FROM visitors WHERE ${where} GROUP BY date ORDER BY date ASC`,
    params
  );
};

/** 北京时间的「今天」往前 n 天的日期串 */
const bjDateAgo = (n: number) => {
  const d = new Date(Date.now() + 8 * 3600_000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const bjToday = () => bjDateAgo(0);

/** 今天距本周一几天（周一 → 0） */
const daysSinceMonday = () => (new Date(Date.now() + 8 * 3600_000).getUTCDay() + 6) % 7;
const bjMonday = () => bjDateAgo(daysSinceMonday());

/** 北京时间 (n 天前) hour 点对应的 UTC 字符串 —— 库里 timestamp 就是这么存的 */
const utcForBeijing = (daysAgo: number, hour: number) => {
  const d = new Date(Date.now() + 8 * 3600_000);
  d.setUTCHours(hour, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return new Date(d.getTime() - 8 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
};

let db: Db;

beforeAll(async () => {
  db = await makeDb();
  // 北京今天 06:00（UTC 是昨天 22:00）：用来验证分桶按北京时间切天
  await db.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [utcForBeijing(0, 6), '10.0.0.1']);
  await db.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [utcForBeijing(0, 6), '10.0.0.2']);
  // 北京今天 20:00
  await db.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [utcForBeijing(0, 20), '10.0.0.1']);
  // 往前 6 / 7 / 10 天各一条
  await db.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [utcForBeijing(6, 12), '10.0.0.3']);
  await db.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [utcForBeijing(7, 12), '10.0.0.4']);
  await db.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [utcForBeijing(10, 12), '10.0.0.5']);
});

afterAll(() => db.close());

describe('访客趋势天粒度窗口', () => {
  it('days 含今天：最近7天 = 今天往前 6 天起，不含第 7 天前那条', async () => {
    const dates = (await trendRows(db, 7)).map((r) => String(r.date));

    // 天粒度只返回有数据的日期（不补空桶），所以断言窗口边界而不是桶数
    expect(dates[0]).toBe(bjDateAgo(6));
    expect(dates[dates.length - 1]).toBe(bjToday());
    expect(dates).not.toContain(bjDateAgo(7));
  });

  it('分桶按北京时间切天：北京今天 06:00 的访问算今天，不算昨天', async () => {
    const rows = await trendRows(db, 1);

    expect(rows).toHaveLength(1);
    expect(String(rows[0].date)).toBe(bjToday());
    // 今天 06:00 两条 + 20:00 一条 = 3 次，独立 IP 2 个
    expect(rows[0].count).toBe(3);
    expect(rows[0].unique_ip).toBe(2);
  });

  it('本周窗口从周一起：周日那天往前 6 天就是周一（所以周日时本周 = 最近7天）', async () => {
    // 本周天数 = 距周一的天数 + 1（含今天）
    const span = daysSinceMonday() + 1;
    const dates = (await trendRows(db, span)).map((r) => String(r.date));

    expect(span).toBeLessThanOrEqual(7);
    expect(dates[0]).toBe(bjMonday());
    expect(dates).not.toContain(bjDateAgo(span));
    // 周一那条已经进了本周窗口，说明起点就是周一（而不是滚动 7 天）
    expect(dates).toContain(bjMonday());
  });

  it('offset 把窗口整体往回推，且与当前窗口不重叠', async () => {
    const current = (await trendRows(db, 7)).map((r) => String(r.date));
    const previous = (await trendRows(db, 7, 7)).map((r) => String(r.date));

    // 天粒度只返回有数据的日期，不补空桶，所以这里按「哪些日期落在窗口里」断言
    expect(previous).toContain(bjDateAgo(7));
    expect(previous).toContain(bjDateAgo(10));
    expect(previous).not.toContain(bjDateAgo(6));
    current.forEach((date) => expect(previous).not.toContain(date));
  });

  it('days 会被规整：0 / 负数 / 小数都不会生成畸形窗口', async () => {
    for (const days of [0, -5, 2.7]) {
      const rows = await trendRows(db, days);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(String(rows[rows.length - 1].date)).toBe(bjToday());
    }
  });

  it('窗口边界落在北京 0 点：北京昨天 23:00 与今天 00:00 分属两天', async () => {
    const boundary = await makeDb();
    try {
      await boundary.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [
        utcForBeijing(1, 23),
        '10.1.0.1'
      ]);
      await boundary.run('INSERT INTO visitors (timestamp, ip) VALUES (?, ?)', [
        utcForBeijing(0, 0),
        '10.1.0.2'
      ]);

      const byDate = new Map((await trendRows(boundary, 2)).map((r) => [String(r.date), Number(r.count)]));

      expect(byDate.get(bjDateAgo(1))).toBe(1);
      expect(byDate.get(bjToday())).toBe(1);
    } finally {
      await boundary.close();
    }
  });
});
