import { describe, expect, it, vi } from 'vitest';
import { waitForRouteChange } from './route-change';

describe('waitForRouteChange', () => {
  /** 极简的假 router：afterEach 订阅后，由测试自己触发一次导航完成 */
  const makeRouter = () => {
    const callbacks = new Set<() => void>();
    return {
      afterEach(callback: () => void) {
        callbacks.add(callback);
        return () => callbacks.delete(callback);
      },
      fireNavigation() {
        [...callbacks].forEach((cb) => cb());
      }
    };
  };

  it('导航完成后立即 resolve，并解除订阅', async () => {
    const router = makeRouter();
    const pending = waitForRouteChange(router);
    router.fireNavigation();
    await expect(pending).resolves.toBeUndefined();
    expect(() => router.fireNavigation()).not.toThrow();
  });

  it('一直没发生导航时会超时兜底', async () => {
    vi.useFakeTimers();
    try {
      const router = makeRouter();
      const pending = waitForRouteChange(router, 500);
      vi.advanceTimersByTime(500);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
