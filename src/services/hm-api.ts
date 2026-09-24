import axios, { type AxiosRequestConfig } from 'axios';
import { ref } from 'vue';
import { translateAppsListCall } from './upstream-compat';

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

interface HmApiClientConfig {
  baseUrl: string;
  fallbackUrl: string;
}

/**
 * HarmonyOS 应用市场 API 客户端
 * 复刻了原项目的核心特性：
 * 1. 自动降级 (Failover): 优先使用本站代理，失败时回退到直连上游
 * 2. 智能缓存 (Caching): 根据路径自动决定缓存时间
 * 3. 请求防抖 (Request Deduping): 避免并发重复请求
 */
class HmApiClient {
  private primaryBaseUrl: string;
  private fallbackUrl: string;
  private cache: Map<string, CacheItem<any>> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();

  /**
   * 主线路（本站代理）最近一次失败的时间戳。
   * 冷却期内先走备用线路，冷却结束后重新尝试主线路 ——
   * 不再像以前那样"第一次失败就永久切到直连"，避免一次抖动之后所有请求都绑死在不稳的直连上。
   */
  private primaryFailedAt = 0;
  private static readonly PRIMARY_COOLDOWN_MS = 60 * 1000;

  public isLoading = ref(false);
  private activeRequestCount = 0;

  constructor(config: HmApiClientConfig) {
    this.primaryBaseUrl = config.baseUrl;
    this.fallbackUrl = config.fallbackUrl;
  }

  /** 按优先级返回本次请求要尝试的线路 */
  private getBaseCandidates(): string[] {
    if (this.primaryBaseUrl === this.fallbackUrl) return [this.primaryBaseUrl];

    const primaryCoolingDown = Date.now() - this.primaryFailedAt < HmApiClient.PRIMARY_COOLDOWN_MS;
    return primaryCoolingDown
      ? [this.fallbackUrl, this.primaryBaseUrl]
      : [this.primaryBaseUrl, this.fallbackUrl];
  }

  /** 记录主线路健康状态：成功即解除冷却，失败则开始冷却 */
  private recordPrimaryResult(baseUrl: string, ok: boolean) {
    if (baseUrl !== this.primaryBaseUrl) return;
    this.primaryFailedAt = ok ? 0 : Date.now();
  }

  /** 依次尝试候选线路，全部失败时抛出最后一个错误 */
  private async sendWithFailover<T>(
    label: string,
    send: (baseUrl: string) => Promise<{ data: T }>
  ): Promise<T> {
    const candidates = this.getBaseCandidates();
    let lastError: unknown;

    for (let i = 0; i < candidates.length; i++) {
      const baseUrl = candidates[i];
      try {
        const response = await send(baseUrl);
        this.recordPrimaryResult(baseUrl, true);
        return response.data;
      } catch (error) {
        lastError = error;
        this.recordPrimaryResult(baseUrl, false);

        const nextBaseUrl = candidates[i + 1];
        if (nextBaseUrl) {
          console.warn(`[HmApi] Request to ${baseUrl}${label} failed, trying fallback ${nextBaseUrl}...`);
        }
      }
    }

    console.error(`[HmApi] All endpoints failed for ${label}`, lastError);
    throw lastError;
  }

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

  // 缓存时长按路径猜（毫秒），沿用原项目规则
  private guessTtlMs(path: string): number {
    if (path.includes('market_info')) return 120000; // 2 mins
    if (path.includes('charts/')) return 300000; // 5 mins
    // 注：/rankings/top-downloads 已在上游 0.9.0 移除，不再需要缓存规则
    if (path.includes('apps/list')) return 30000; // 30 secs
    return 0; // 默认不缓存
  }

  public async get<T>(path: string, params?: any, config?: AxiosRequestConfig): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const cacheKey = this.getCacheKey(normalizedPath, params);
    const ttl = this.guessTtlMs(normalizedPath);

    if (ttl > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }
    }

    // 同一个请求正在飞：直接复用，避免并发打上游
    if (this.inFlight.has(cacheKey)) {
      return this.inFlight.get(cacheKey) as Promise<T>;
    }

    const requestPromise = (async () => {
      this.startRequest();
      // /apps/list/<n> 统一翻译成 /apps/query（POST），避开被上游风控的接口
      const translated = translateAppsListCall(normalizedPath, params);
      const requestPath = translated ? translated.path : normalizedPath;

      const send = (baseUrl: string) => {
        const url = `${baseUrl}${requestPath}`;
        return translated
          ? axios.post<T>(url, translated.body, {
              ...config,
              headers: { 'Content-Type': 'application/json', ...(config?.headers || {}) }
            })
          : axios.get<T>(url, { ...config, params });
      };

      try {
        return await this.sendWithFailover(requestPath, send);
      } finally {
        this.endRequest();
      }
    })();

    this.inFlight.set(cacheKey, requestPromise);

    try {
      const data = await requestPromise;
      if (ttl > 0) {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      }
      return data;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  public async post<T>(path: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    // axios 在 Content-Type=application/json 时会把 null 序列化成字面量 "null"，
    // 严格模式的 JSON 解析（包括本项目服务端的 express.json 默认 strict）会直接 400，
    // 所以这里统一把空 body 归一成 {}。
    const payload = data ?? {};

    const finalConfig = {
      ...config,
      headers: {
        'Content-Type': 'application/json',
        ...(config?.headers || {})
      }
    };

    this.startRequest();
    try {
      return await this.sendWithFailover(normalizedPath, (baseUrl) =>
        axios.post<T>(`${baseUrl}${normalizedPath}`, payload, finalConfig)
      );
    } finally {
      this.endRequest();
    }
  }
}

export const hmApi = new HmApiClient({
  baseUrl: '/api/v0', // 优先走本站代理
  fallbackUrl: 'https://shenjack.top:10003/api/v0' // 备用直连
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
