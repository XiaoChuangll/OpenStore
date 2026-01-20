import axios, { type AxiosRequestConfig } from 'axios';
import { ref } from 'vue';

// 缓存项接口
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

// API 客户端配置接口
interface HmApiClientConfig {
  baseUrl: string;
  fallbackUrl: string;
}

/**
 * HarmonyOS 应用市场 API 客户端
 * 复刻了原项目的核心特性：
 * 1. 自动降级 (Failover): 优先使用代理，失败时回退到直连
 * 2. 智能缓存 (Caching): 根据路径自动决定缓存时间
 * 3. 请求防抖 (Request Deduping): 避免并发重复请求
 */
class HmApiClient {
  private activeBaseUrl: string;
  private fallbackUrl: string;
  private cache: Map<string, CacheItem<any>> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  
  // Loading status
  public isLoading = ref(false);
  private activeRequestCount = 0;

  constructor(config: HmApiClientConfig) {
    this.activeBaseUrl = config.baseUrl;
    this.fallbackUrl = config.fallbackUrl;
  }

  // 生成缓存 Key
  private getCacheKey(path: string, params?: any): string {
    const queryString = params
      ? Object.entries(params)
          .filter(([_, v]) => v !== undefined && v !== null)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${String(v)}`)
          .join('&')
      : '';
    return `${path}?${queryString}`;
  }

  private startRequest() {
    this.activeRequestCount++;
    this.isLoading.value = true;
  }

  private endRequest() {
    this.activeRequestCount--;
    if (this.activeRequestCount <= 0) {
      this.activeRequestCount = 0;
      this.isLoading.value = false;
    }
  }

  // 猜测缓存时间 (毫秒) - 复刻原项目逻辑
  private guessTtlMs(path: string): number {
    if (path.includes('market_info')) return 120000; // 2 mins
    if (path.includes('charts/')) return 300000; // 5 mins
    if (path.includes('rankings/top-downloads')) return 300000; // 5 mins
    if (path.includes('apps/list')) return 30000; // 30 secs
    return 0; // 默认不缓存
  }

  // 发起 GET 请求
  public async get<T>(path: string, params?: any, config?: AxiosRequestConfig): Promise<T> {
    // 确保 path 以 / 开头
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const cacheKey = this.getCacheKey(normalizedPath, params);
    const ttl = this.guessTtlMs(normalizedPath);

    // 1. 检查缓存
    if (ttl > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ttl) {
        // console.debug(`[HmApi] Cache hit for ${cacheKey}`);
        return cached.data;
      }
    }

    // 2. 检查是否有正在进行的相同请求 (Request Deduping)
    if (this.inFlight.has(cacheKey)) {
      // console.debug(`[HmApi] Deduping request for ${cacheKey}`);
      return this.inFlight.get(cacheKey) as Promise<T>;
    }

    // 3. 发起新请求
    const requestPromise = (async () => {
      this.startRequest();
      try {
        const url = `${this.activeBaseUrl}${normalizedPath}`;
        // console.debug(`[HmApi] Fetching ${url}`);
        const response = await axios.get<T>(url, { ...config, params });
        return response.data;
      } catch (error) {
        console.warn(`[HmApi] Request to ${this.activeBaseUrl} failed, trying fallback...`);
        
        // 尝试降级
        if (this.activeBaseUrl !== this.fallbackUrl) {
            try {
                // 切换 active url 以便后续请求直接用备用
                // 注意：这里我们临时使用 fallbackUrl 发起请求，如果成功，是否要永久切换 activeBaseUrl？
                // 原项目逻辑是：hmApiActiveBase = hmApiRemoteBase; (永久切换)
                this.activeBaseUrl = this.fallbackUrl; 
                
                const url = `${this.activeBaseUrl}${normalizedPath}`;
                console.log(`[HmApi] Fallback to ${url}`);
                const response = await axios.get<T>(url, { ...config, params });
                return response.data;
            } catch (fallbackError) {
                console.error(`[HmApi] Fallback request also failed`, fallbackError);
                throw fallbackError;
            }
        }
        throw error;
      } finally {
        this.endRequest();
      }
    })();

    // 记录 in-flight
    this.inFlight.set(cacheKey, requestPromise);

    try {
      const data = await requestPromise;
      // 写入缓存
      if (ttl > 0) {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      }
      return data;
    } finally {
      // 清理 in-flight
      this.inFlight.delete(cacheKey);
    }
  }
  
  // POST 请求
  public async post<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    
    // Ensure Content-Type is application/json for POST, as some endpoints require it
    const finalConfig = {
      ...config,
      headers: {
        'Content-Type': 'application/json',
        ...(config?.headers || {})
      }
    };

    this.startRequest();
    try {
      const url = `${this.activeBaseUrl}${normalizedPath}`;
      const response = await axios.post<T>(url, data, finalConfig);
      return response.data;
    } catch (error) {
      console.warn(`[HmApi] POST Request to ${this.activeBaseUrl} failed, trying fallback...`);

      // 尝试降级
      if (this.activeBaseUrl !== this.fallbackUrl) {
        try {
          // 临时切换到 fallbackUrl
          this.activeBaseUrl = this.fallbackUrl;
          const url = `${this.activeBaseUrl}${normalizedPath}`;
          console.log(`[HmApi] Fallback (POST) to ${url}`);
          const response = await axios.post<T>(url, data, finalConfig);
          return response.data;
        } catch (fallbackError) {
          console.error(`[HmApi] Fallback POST request also failed`, fallbackError);
          throw fallbackError;
        }
      }
      throw error;
    } finally {
      this.endRequest();
    }
  }
}

// 导出单例
export const hmApi = new HmApiClient({
  baseUrl: '/api/v0', // 优先走 Vite 代理
  fallbackUrl: 'http://shenjack.top:10003/api/v0' // 备用直连
});

export interface SubmissionComment {
  platform: string;
  user: string;
}

export interface AppSubmissionData {
  app_id?: string;
  pkg_name?: string;
  link?: string;
}

export const submitApp = async (data: AppSubmissionData) => {
  return hmApi.post('/submit', { 
    app_id: data.app_id,
    pkg_name: data.pkg_name,
    link: data.link,
    comment: {
      platform: 'BetaHub',
      user: 'Guest'
    }
  });
};

export const submitSubstance = async (substanceId: string, comment?: SubmissionComment) => {
  return hmApi.post(`/submit_substance/${substanceId}`, {
    comment: comment || { platform: 'OpenStore', user: 'Guest' }
  });
};
