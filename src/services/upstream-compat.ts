/**
 * 上游兼容层
 *
 * 上游的 `/api/v0/apps/list/<page>` 接口在长期高频请求后会被风控（返回 404），
 * 而 `/api/v0/apps/query`（POST）没有被限制，且返回结构与 list 完全一致
 * （data.data / data.total_count / total），排序字段也通用
 * （download_count / updated_at / listed_at / release_date / created_at）。
 *
 * 这里把 `/apps/list/<page>` 的 GET 请求翻译成等价的 `/apps/query` POST 请求，
 * 让前端在 list 被限制期间仍然可用。
 */
const APPS_LIST_PATH_RE = /^\/apps\/list\/(\d+)$/;

export interface TranslatedListCall {
  /** 相对 baseUrl 的请求路径（含查询串） */
  path: string;
  /** POST body：搜索表达式 */
  body: Record<string, unknown>;
}

export const translateAppsListCall = (
  normalizedPath: string,
  params?: Record<string, any>
): TranslatedListCall | null => {
  const matched = APPS_LIST_PATH_RE.exec(normalizedPath);
  if (!matched) return null;

  const searchKey = params?.search_key;
  const searchValue = params?.search_value;
  const hasSearch =
    typeof searchKey === 'string' &&
    searchKey.trim() !== '' &&
    searchValue !== undefined &&
    searchValue !== null &&
    String(searchValue).trim() !== '';

  const conditions: Array<Record<string, unknown>> = [];

  if (hasSearch) {
    conditions.push(
      params?.search_exact
        ? { key: searchKey, value: String(searchValue), op: 'eq' }
        : { key: searchKey, value: `%${String(searchValue).trim()}%`, op: 'ilike' }
    );
  } else {
    // 无条件时需要给一个"匹配全部"的条件，否则上游会报 "AND 表达式不能为空"
    conditions.push({ key: 'name', value: '%', op: 'ilike' });
  }

  if (params?.date_from) {
    conditions.push({ key: 'listed_at', value: String(params.date_from), op: 'gte' });
  }
  if (params?.date_to) {
    conditions.push({ key: 'listed_at', value: String(params.date_to), op: 'lte' });
  }

  const query = new URLSearchParams();
  query.set('page', matched[1]);
  if (params?.page_size !== undefined && params?.page_size !== null) {
    query.set('page_size', String(params.page_size));
  }
  if (params?.detail !== undefined && params?.detail !== null) {
    query.set('detail', String(params.detail));
  }
  if (params?.sort) query.set('sort', String(params.sort));
  if (params?.desc !== undefined && params?.desc !== null) {
    query.set('desc', String(params.desc));
  }

  return {
    path: `/apps/query?${query.toString()}`,
    body: { and: conditions }
  };
};
