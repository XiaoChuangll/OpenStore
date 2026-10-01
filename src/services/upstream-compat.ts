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

/**
 * 「排除华为官方应用」在 /apps/query 里没有对应开关，只能用条件等价表达。
 *
 * 实测过两种写法（上游总量 95332）：
 * - 开发者不是华为（下面这条）：95215，和上游 `exclude_huawei=true` 的 95216 只差 1 条；
 * - 包名里不带 huawei：72934，多排掉两万多条 —— 很多第三方应用的包名里也带 huawei，
 *   照这个排法会把它们一起误伤。
 * 所以按「开发者」判定，而不是包名。
 */
export const EXCLUDE_HUAWEI_CONDITION = {
  key: 'developer_name',
  value: '%华为%',
  op: 'not_i_like'
} as const;

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
  if (params?.exclude_huawei) {
    // 以前这个参数在翻译时被丢掉了，「非华为榜」实际拿到的是华为自家应用
    conditions.push({ ...EXCLUDE_HUAWEI_CONDITION });
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
