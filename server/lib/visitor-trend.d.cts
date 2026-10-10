// visitor-trend.cjs 的类型声明（仅供 TS 引用）
export interface DayTrendQuery {
  /** WHERE 片段：两个边界都直接比较 timestamp 列，能用上索引 */
  where: string;
  /** 与 where 里占位符顺序一致的参数 */
  params: number[];
  /** 分桶表达式（按北京时间切天） */
  bucket: string;
}
export declare function buildDayTrendQuery(options?: { days?: number; offset?: number }): DayTrendQuery;
