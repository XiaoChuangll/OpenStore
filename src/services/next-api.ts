import axios from 'axios';

const api = axios.create({
  baseURL: '/next-api',
});

let statsAccessToken = '';
let tokenExpirationTime = 0;

export const getStatsAccessToken = async () => {
  if (statsAccessToken && Date.now() < tokenExpirationTime) {
    return statsAccessToken;
  }
  
  try {
    const { data } = await axios.get('/next-api/apps/stats-access-token');
    if (data?.success && data?.data?.token) {
      statsAccessToken = data.data.token;
      const expiresIn = data.data.expires_in || 90;
      tokenExpirationTime = Date.now() + (expiresIn - 5) * 1000;
    }
  } catch (error) {
    console.error('Failed to get stats access token', error);
  }
  
  return statsAccessToken;
};

api.interceptors.request.use(async (config) => {
  const isStatsEndpoint =
    config.url?.includes('category-overview') ||
    config.url?.includes('device-overview');
  
  if (isStatsEndpoint) {
    const token = await getStatsAccessToken();
    if (token) {
      if (config.headers) {
        config.headers['X-Stats-Access-Token'] = token;
      }
    }
  }
  return config;
});

export interface NextAppCategory {
  id: number;
  name: string;
  icon?: string;
  count?: number; // The user's design showed counts, assuming API might return it or we fetch it? 
                  // If API doesn't return count, we might default to 0.
  color?: string; // API likely won't return UI colors, we might need to map them locally.
}

export interface NextDeviceCount {
  code: string;
  name: string;
  count: number;
  icon?: string;
}

// Map internal device keys to API device IDs
export const DEVICE_MAP: Record<string, number | undefined> = {
  all: undefined,
  phone: 0,
  tablet: 4, // "平板"
  tv: 3,     // "智慧屏" - using 'tv' key internally, or 'smart_screen'
  car: 7,
  pc: 15,
};

export const getCategories = async (device?: number) => {
  const params: any = {};
  if (device !== undefined) {
    params.device = device;
  }
  const { data } = await api.get('/apps/category-overview', { params });
  return data;
};

export const getDevices = async () => {
  const { data } = await api.get('/apps/device-overview');
  return data;
};

export const getAppsByCategory = async (categoryName: string, page = 1, size = 20) => {
  const { data } = await api.get(`/apps/category/${encodeURIComponent(categoryName)}`, {
    params: { 
      page, 
      size,
      limit: size,
      pageSize: size,
      page_size: size
    }
  });
  return data;
};

export const searchApps = async (query: string, page = 1, size = 20) => {
  const { data } = await api.get('/apps/search', { 
    params: { 
      q: query, 
      page, 
      size,
      limit: size,
      pageSize: size,
      page_size: size
    } 
  });
  return data;
};

export const getAppDetail = async (id: string) => {
  const { data } = await api.get(`/apps/${id}`);
  return data;
};

export default api;
