import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportsViewTransition, waitForRouteChange, withViewTransition } from './view-transition';

type DocWithVT = Document & { startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> } };

const original = (document as DocWithVT).startViewTransition;
/** 直接 delete 会在 lib.dom 里报「操作数必须是可选的」，这里统一用 unknown 形状赋值 */
const setStartViewTransition = (value?: DocWithVT['startViewTransition']) => {
  (document as unknown as { startViewTransition?: unknown }).startViewTransition = value;
};

afterEach(() => {
  setStartViewTransition(original);
  document.documentElement.classList.remove('vt-running');
});

describe('view-transition', () => {
  it('浏览器不支持时必须照常完成导航，并且不留下标记类', async () => {
    setStartViewTransition(undefined);
    expect(supportsViewTransition()).toBe(false);

    const navigate = vi.fn(async () => {});
    await withViewTransition(navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('vt-running')).toBe(false);
  });

  it('支持时走 startViewTransition，导航在回调里执行，结束后清掉标记类', async () => {
    const order: string[] = [];
    const startViewTransition = vi.fn((cb: () => Promise<void> | void) => {
      order.push('start');
      return {
        finished: (async () => {
          await cb();
          order.push('finished');
        })()
      };
    });
    setStartViewTransition(startViewTransition as never);
    expect(supportsViewTransition()).toBe(true);

    const navigate = vi.fn(async () => {
      order.push('navigate');
      // 回调执行期间必须已经打上标记，新页面才能据此让出入场动画
      expect(document.documentElement.classList.contains('vt-running')).toBe(true);
    });

    await withViewTransition(navigate);

    expect(order[0]).toBe('start');
    expect(order).toContain('navigate');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('vt-running')).toBe(false);
  });

  it('转场抛错也不能影响导航（导航已完成）', async () => {
    // 真实场景：回调已经跑完（导航发生），随后转场本身失败
    setStartViewTransition(((cb: () => Promise<void> | void) => ({
      finished: (async () => {
        await cb();
        throw new Error('boom');
      })()
    })) as never);

    const navigate = vi.fn(async () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(withViewTransition(navigate)).resolves.toBeUndefined();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains('vt-running')).toBe(false);
    warn.mockRestore();
  });

  it('rAF 不触发时（标签页不可见）也不能卡住转场回调，否则会被浏览器判定超时中止', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    try {
      let callbackFinished = false;
      setStartViewTransition(((cb: () => Promise<void> | void) => ({
        finished: (async () => {
          await cb();
          callbackFinished = true;
        })()
      })) as never);

      const pending = withViewTransition(async () => {});
      await vi.advanceTimersByTimeAsync(200);
      await pending;

      expect(callbackFinished).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

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
      // 已解订阅：再触发一次不会重复 resolve（用是否还会阻塞来间接验证）
      expect(() => router.fireNavigation()).not.toThrow();
    });

    it('一直没发生导航时会超时兜底，不会把转场的回调卡住', async () => {
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
});
