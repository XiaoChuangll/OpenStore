import { describe, it, expect } from 'vitest';
import {
  cachedVisitorsGet,
  visitorsStatsCache,
  VISITORS_STATS_CACHE_MAX
} from '../../server/lib/visitors-stats.cjs';

/*
 * 缓存条数上限：key 里带筛选条件，后台多换几轮筛选就会一直往里堆。
 * 这里用 SELECT 1 灌满，确认超出上限后不会无限增长。
 */
describe('访客统计缓存', () => {
  it('不同筛选条件灌进来时缓存有条数上限', async () => {
    const total = VISITORS_STATS_CACHE_MAX + 40;
    for (let i = 0; i < total; i += 1) {
      await new Promise<void>((resolve, reject) => {
        cachedVisitorsGet(`test:cap:${i}`, 'SELECT 1 AS one', [], (err) => (err ? reject(err) : resolve()));
      });
    }
    expect(visitorsStatsCache.size).toBeLessThanOrEqual(VISITORS_STATS_CACHE_MAX);
  });
});
