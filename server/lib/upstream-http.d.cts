// upstream-http.cjs 的类型声明（仅供 TS 引用）
export declare const UPSTREAM_MAX_SOCKETS: number;
export declare const UPSTREAM_MAX_FREE_SOCKETS: number;
export declare const UPSTREAM_KEEPALIVE_MS: number;
export declare const UPSTREAM_TIMEOUT_MS: number;
export declare const AXIOS_DEFAULT_TIMEOUT_MS: number;
export declare const AXIOS_DEFAULT_MAX_CONTENT_LENGTH: number;
export declare const API_STREAM_IDLE_MS: number;
export declare const API_STREAM_MAX_MS: number;
export declare const MEDIA_STREAM_IDLE_MS: number;
export declare const MEDIA_STREAM_MAX_MS: number;
export declare const SSE_IDLE_MS: number;
export declare const PROXY_MAX_CONCURRENCY: number;
export declare const PROXY_QUEUE_WAIT_MS: number;
export declare const httpAgent: import('http').Agent;
export declare const httpsAgent: import('https').Agent;
export declare function applyAxiosDefaults(axios?: unknown): unknown;
export declare function createGate(max: number): {
  acquire: (waitMs?: number) => Promise<(() => void) | null>;
  stats: () => { limit: number; active: number; waiting: number };
};
export declare const proxyGate: {
  acquire: (waitMs?: number) => Promise<(() => void) | null>;
  stats: () => { limit: number; active: number; waiting: number };
};
export declare function streamGuardStats(): { active: number };
export declare function attachStreamGuards(
  response: unknown,
  res: unknown,
  options?: {
    idleMs?: number;
    maxMs?: number;
    label?: string;
    onAbort?: (reason: string) => void;
  }
): {
  dispose: () => void;
  abort: (reason: string) => void;
  readonly aborted: boolean;
  readonly settled: boolean;
};
