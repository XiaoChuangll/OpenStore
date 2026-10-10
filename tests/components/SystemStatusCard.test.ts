import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import SystemStatusCard from '../../src/components/SystemStatusCard.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../src/services/hm-api', () => ({
  hmApi: { isLoading: false },
}));

/** 记录每条 SSE 连接的开关状态 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static reset() {
    FakeEventSource.instances = [];
  }

  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}

  close() {
    this.closed = true;
  }
}

const openStreams = () => FakeEventSource.instances.filter((item) => !item.closed);

// 首页被缓存：切走后这条实时流必须断开，且不再重连
describe('SystemStatusCard 实时流', () => {
  const mountInKeepAlive = () => {
    const show = ref(true);
    const host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (show.value ? h(SystemStatusCard) : h('div', { class: 'other-page' })),
        }),
    });
    const wrapper = mount(host, { global: { stubs: { 'el-icon': true } } });
    return { wrapper, show };
  };

  beforeEach(() => {
    FakeEventSource.reset();
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
    // 断开时组件会 console.warn，这里是在测「断开」本身
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('页面挂起后关闭连接，服务端报错也不再重连', async () => {
    const { show } = mountInKeepAlive();
    await flushPromises();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(openStreams()).toHaveLength(1);

    // 切走：连接关闭
    show.value = false;
    await nextTick();
    await flushPromises();
    expect(openStreams()).toHaveLength(0);

    // 断开后收到 error：不该排重连
    FakeEventSource.instances[0].onerror?.(new Error('closed'));
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(FakeEventSource.instances).toHaveLength(1);

    // 切回来：重新建连
    show.value = true;
    await nextTick();
    await flushPromises();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(openStreams()).toHaveLength(1);
  });

  it('页面可见时连接失败会按退避重连', async () => {
    mountInKeepAlive();
    await flushPromises();

    FakeEventSource.instances[0].onerror?.(new Error('boom'));
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
