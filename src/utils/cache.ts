export interface CacheConfig {
  version: string;
  ttl: number; // Time to live in milliseconds
}

interface CacheItem<T> {
  data: T;
  timestamp: number;
  version: string;
  signature: string;
}

class CacheManager {
  private storage: Storage;
  private prefix: string;
  private config: CacheConfig;

  constructor(prefix: string = 'player_config_', config: CacheConfig = { version: '1.0.0', ttl: 24 * 60 * 60 * 1000 }) {
    this.storage = localStorage;
    this.prefix = prefix;
    this.config = config;
  }

  private generateSignature(data: any): string {
    // Simple signature based on JSON string length and first/last chars
    // In a real app, use a proper hash function like MD5 or SHA256
    const str = JSON.stringify(data);
    return `${str.length}-${str.charCodeAt(0)}-${str.charCodeAt(str.length - 1)}`;
  }

  set<T>(key: string, data: T): void {
    try {
      const item: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        version: this.config.version,
        signature: this.generateSignature(data)
      };
      this.storage.setItem(this.prefix + key, JSON.stringify(item));
    } catch (e) {
      console.warn('Cache write failed (quota exceeded?):', e);
    }
  }

  get<T>(key: string): T | null {
    try {
      const raw = this.storage.getItem(this.prefix + key);
      if (!raw) return null;

      const item: CacheItem<T> = JSON.parse(raw);

      // Check version
      if (item.version !== this.config.version) {
        console.log(`Cache version mismatch for ${key}: ${item.version} vs ${this.config.version}`);
        this.remove(key);
        return null;
      }

      // Check TTL
      if (Date.now() - item.timestamp > this.config.ttl) {
        console.log(`Cache expired for ${key}`);
        this.remove(key);
        return null;
      }

      // Check integrity (optional, but requested)
      const currentSig = this.generateSignature(item.data);
      if (currentSig !== item.signature) {
        console.warn(`Cache signature mismatch for ${key}`);
        this.remove(key);
        return null;
      }

      return item.data;
    } catch (e) {
      console.error('Cache read failed:', e);
      return null;
    }
  }

  remove(key: string): void {
    this.storage.removeItem(this.prefix + key);
  }

  clear(): void {
    // Only clear keys starting with prefix
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    keys.forEach(k => this.storage.removeItem(k));
  }
  
  // Developer helper
  getAllKeys(): string[] {
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key && key.startsWith(this.prefix)) {
            keys.push(key);
        }
    }
    return keys;
  }
}

export const musicCache = new CacheManager();
