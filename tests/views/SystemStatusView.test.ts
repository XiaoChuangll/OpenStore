import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import SystemStatusView from '../../src/views/SystemStatusView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// 自动探测打的是真实上游，页面不可见时必须停
describe('SystemStatusView 自动探测', () => {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as any);
  const probeCalls = () => fetchMock.mock.calls.length;

  const mountInKeepAlive = () => {
    const show = ref(true);
    const host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (show.value ? h(SystemStatusView) : h('div', { class: 'other-page' })),
        }),
    });
    const wrapper = mount(host, { global: { stubs: { 'el-icon': true, 'el-button': true } } });
    return { wrapper, show };
  };

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('页面被 keep-alive 挂起后停止探测，切回来恢复', async () => {
    const { show } = mountInKeepAlive();
    await flushPromises();

    // 首屏一轮：每个探针一次
    const perRound = probeCalls();
    expect(perRound).toBeGreaterThan(0);

    // 一个周期后再来一轮
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();
    expect(probeCalls()).toBe(perRound * 2);

    // 切走：再过三个周期也不该有新请求
    show.value = false;
    await nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(90_000);
    await flushPromises();
    expect(probeCalls()).toBe(perRound * 2);

    // 切回来：恢复探测
    show.value = true;
    await nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(30_000);
    await flushPromises();
    expect(probeCalls()).toBe(perRound * 3);
  });
});
