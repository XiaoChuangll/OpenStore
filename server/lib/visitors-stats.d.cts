// visitors-stats.cjs 的类型声明（仅供 TS 引用）
export declare const VISITORS_STATS_TTL: number;
export declare const VISITORS_STATS_STALE_TTL: number;
export declare const VISITORS_INSIGHTS_TTL: number;
export declare const VISITORS_INSIGHTS_STALE_TTL: number;
/** 缓存条数上限，超出按插入顺序淘汰最老的 */
export declare const VISITORS_STATS_CACHE_MAX: number;
/** 缓存本体（内部结构，测试用） */
export declare const visitorsStatsCache: Map<string, { t: number; data: unknown; refreshing?: boolean }>;
export declare function cachedVisitorsAll(
  key: string,
  sql: string,
  params: unknown[],
  cb: (err: Error | null, rows?: unknown[]) => void,
  ttl?: number,
  staleTtl?: number
): void;
export declare function cachedVisitorsGet(
  key: string,
  sql: string,
  params: unknown[],
  cb: (err: Error | null, row?: unknown) => void
): void;
