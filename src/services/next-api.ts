import axios from 'axios';
import { hmApi } from './hm-api';

export interface NextAppCategory {
  id?: number;
  name: string;
  icon?: string;
  count?: number;
  color?: string;
}

export interface NextDeviceCount {
  code: string;
  name: string;
  count: number;
  icon?: string;
}

interface CacheItem<T> {
  timestamp: number;
  data: T;
}

const CATEGORY_CACHE_TTL = 5 * 60 * 1000;
const categoriesCache = new Map<string, CacheItem<NextAppCategory[]>>();
let devicesCache: CacheItem<NextDeviceCount[]> | null = null;
const overviewInFlight = new Map<string, Promise<any>>();

// Keep the original device mapping so existing UI code can stay unchanged.
export const DEVICE_MAP: Record<string, number | undefined> = {
  all: undefined,
  phone: 0,
  tablet: 4,
  tv: 3,
  car: 7,
  pc: 15
};

const normalizeListResponse = (response: any) => {
  let list: any[] = [];

  if (Array.isArray(response)) {
    list = response;
  } else if (Array.isArray(response?.data)) {
    list = response.data;
  } else if (Array.isArray(response?.items)) {
    list = response.items;
  } else if (Array.isArray(response?.data?.data)) {
    list = response.data.data;
  } else if (Array.isArray(response?.apps)) {
    list = response.apps;
  }

  return list.map((item: any) => item?.info || item);
};

const extractTotal = (response: any) => {
  return Number(
    response?.total ??
    response?.total_count ??
    response?.data?.total ??
    response?.data?.total_count ??
    0
  );
};

const normalizeAppDetailResponse = (response: any) => {
  const payload = response?.data ?? response;

  if (!payload) {
    return null;
  }

  const info = payload?.info || payload?.full_info || payload?.data || payload;

  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    return null;
  }

  return {
    ...info,
    icon_url: info.icon_url ?? info.icon ?? null,
    average_rating:
      info.average_rating ??
      info.full_average_rating ??
      info.info_score ??
      payload?.rating?.average_rating ??
      null,
    total_star_rating_count:
      info.total_star_rating_count ??
      info.info_rate_count ??
      payload?.rating?.total_star_rating_count ??
      null,
    size: info.size ?? info.size_bytes ?? null,
    download_count_str:
      info.download_count_str ??
      info.down_count_desc ??
      (info.download_count != null ? String(info.download_count) : null)
  };
};

const getOverviewCacheKey = (device?: number) => (
  device === undefined || device === null ? 'all' : `device:${device}`
);

const fetchAppsOverview = async (device?: number) => {
  const cacheKey = getOverviewCacheKey(device);
  const cachedCategories = categoriesCache.get(cacheKey);
  const hasCachedCategories = cachedCategories && Date.now() - cachedCategories.timestamp < CATEGORY_CACHE_TTL;
  const hasCachedDevices = devicesCache && Date.now() - devicesCache.timestamp < CATEGORY_CACHE_TTL;

  if (hasCachedCategories && hasCachedDevices) {
    return {
      categories: cachedCategories?.data || [],
      devices: devicesCache?.data || []
    };
  }

  if (!overviewInFlight.has(cacheKey)) {
    overviewInFlight.set(cacheKey, axios.get('/api/public/apps/overview', {
      params: device === undefined || device === null ? undefined : { device }
    })
      .then((response) => response?.data?.data || {})
      .finally(() => {
        overviewInFlight.delete(cacheKey);
      }));
  }

  const data = await overviewInFlight.get(cacheKey);
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const devices = Array.isArray(data?.devices) ? data.devices : [];

  categoriesCache.set(cacheKey, {
    timestamp: Date.now(),
    data: categories
  });
  devicesCache = {
    timestamp: Date.now(),
    data: devices
  };

  return { categories, devices };
};

export const getStatsAccessToken = async () => '';

export const getCategories = async (device?: number) => {
  const cacheKey = getOverviewCacheKey(device);
  const cachedCategories = categoriesCache.get(cacheKey);

  if (cachedCategories && Date.now() - cachedCategories.timestamp < CATEGORY_CACHE_TTL) {
    return {
      data: cachedCategories.data,
      items: cachedCategories.data
    };
  }

  const overview = await fetchAppsOverview(device);
  const data = overview.categories;

  const sorted = data
    .filter((item: any) => item.count > 0)
    .sort((a: NextAppCategory, b: NextAppCategory) => (b.count || 0) - (a.count || 0));

  categoriesCache.set(cacheKey, {
    timestamp: Date.now(),
    data: sorted
  });

  return {
    data: sorted,
    items: sorted
  };
};

export const getDevices = async () => {
  if (devicesCache && Date.now() - devicesCache.timestamp < CATEGORY_CACHE_TTL) {
    return {
      data: devicesCache.data,
      items: devicesCache.data
    };
  }

  const overview = await fetchAppsOverview();
  const devices = overview.devices;

  return {
    data: devices,
    items: devices
  };
};

export const getAppsByCategory = async (
  categoryName: string,
  page = 1,
  size = 20,
  device?: number
) => {
  let response: any;
  const apiPage = Math.max(page, 1);

  if (device === undefined || device === null) {
    response = await hmApi.get<any>(`/apps/list/${apiPage}`, {
      search_key: 'kind_name',
      search_value: categoryName,
      search_exact: true,
      page_size: size,
      detail: true
    });
  } else {
    response = await hmApi.post<any>(`/apps/query?page=${apiPage}&page_size=${size}&detail=true`, {
      and: [
        { key: 'kind_name', value: categoryName, op: 'eq' },
        { key: 'main_device_codes', value: String(device), op: 'array_contains' }
      ]
    });
  }

  return {
    data: normalizeListResponse(response),
    total: extractTotal(response)
  };
};

export const searchApps = async (query: string, page = 1, size = 20) => {
  const normalizedQuery = query.trim();
  const apiPage = Math.max(page, 1);
  const params: Record<string, any> = {
    page_size: size,
    detail: true
  };

  if (!normalizedQuery) {
    params.sort = 'downloads';
    params.desc = true;
  } else {
    params.search_key = 'name';
    params.search_value = normalizedQuery;
  }

  const response = await hmApi.get<any>(`/apps/list/${apiPage}`, params);
  const list = normalizeListResponse(response);

  return {
    data: list,
    items: list,
    total: extractTotal(response)
  };
};

export const getAppDetail = async (id: string) => {
  const candidates: Array<() => Promise<any>> = [
    () => hmApi.get<any>(`/apps/app_id/${encodeURIComponent(id)}`)
  ];

  if (id.includes('.')) {
    candidates.push(() => hmApi.get<any>(`/apps/pkg_name/${encodeURIComponent(id)}`));
  }

  for (const request of candidates) {
    try {
      const response = await request();
      const detail = normalizeAppDetailResponse(response);
      if (detail) {
        return detail;
      }
    } catch (error) {
      console.warn(`[next-api] Failed to fetch app detail for ${id}`, error);
    }
  }

  return null;
};

export default hmApi;
