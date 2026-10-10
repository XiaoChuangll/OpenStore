import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import TopicSpotlight from '../../src/components/TopicSpotlight.vue';
import * as spotlightApi from '../../src/services/api';

// 预热 → 轮播时序：假图片 + 假定时器

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// 本周上新 + 专题两张海报；今日更新无数据，不出现
vi.mock('../../src/services/api', () => ({
  getTopics: vi.fn(async () => ({ data: [{ substance_id: 1, title: '专题' }] })),
  getTopicDetail: vi.fn(async () => ({
    substance_id: 1,
    title: '本周口碑应用',
    subtitle: '编辑精选',
    created_at: '2026-10-01T00:00:00+08:00',
    apps: [
      { icon_url: 'https://cdn.test/topic-1.png' },
      { icon_url: 'https://cdn.test/topic-2.png' },
    ],
  })),
  getNewAppsByDateRange: vi.fn(async () => ({
    data: [
      { info: { icon_url: 'https://cdn.test/week-1.png' } },
      { info: { icon_url: 'https://cdn.test/week-2.png' } },
    ],
    total: 2,
  })),
  getAppUpdates: vi.fn(async () => ({ data: [] })),
}));

/** 待放行的图片 */
type PendingImage = { src: string; fire: () => void };
let pendingImages: PendingImage[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = 'auto';
  decode = () => Promise.resolve();
  private currentSrc = '';

  set src(value: string) {
    this.currentSrc = value;
    // 组件先挂 onload 再赋 src
    pendingImages.push({ src: value, fire: () => this.onload?.() });
  }

  get src() {
    return this.currentSrc;
  }
}

const isWeekly = (src: string) => src.includes('week-');
const isTopic = (src: string) => src.includes('topic-');

/** 放行一批图片 */
const loadImages = async (match: (src: string) => boolean) => {
  const hit = pendingImages.filter((item) => match(item.src));
  pendingImages = pendingImages.filter((item) => !match(item.src));
  hit.forEach((item) => item.fire());
  await flushPromises();
};

/** 反复放行，直到没有新的预热排上 */
const drainImages = async () => {
  for (let i = 0; i < 5 && pendingImages.length; i += 1) {
    await loadImages(() => true);
  }
};

// 海报是常驻卡片，取前台那张的标题（排除骨架）
const titleOf = (wrapper: VueWrapper<any>) =>
  wrapper.find('.spotlight-card.is-active:not(.spotlight-skeleton) .spotlight-title').text();
const cardShown = (wrapper: VueWrapper<any>) =>
  wrapper.find('.spotlight-card:not(.spotlight-skeleton)').exists();
const skeletonShown = (wrapper: VueWrapper<any>) => wrapper.find('.spotlight-skeleton').exists();

const mountSpotlight = () =>
  mount(TopicSpotlight, {
    global: { stubs: { 'el-icon': true } },
  });

describe('TopicSpotlight 预热与轮播', () => {
  beforeEach(() => {
    pendingImages = [];
    vi.stubGlobal('Image', FakeImage);
    vi.useFakeTimers();
    // 统一默认数据，避免用例间 mock 泄漏
    vi.mocked(spotlightApi.getTopics).mockResolvedValue({ data: [{ substance_id: 1, title: '专题' }] } as any);
    vi.mocked(spotlightApi.getNewAppsByDateRange).mockResolvedValue({
      data: [
        { info: { icon_url: 'https://cdn.test/week-1.png' } },
        { info: { icon_url: 'https://cdn.test/week-2.png' } },
      ],
      total: 2,
    } as any);
    vi.mocked(spotlightApi.getTopicDetail).mockResolvedValue({
      substance_id: 1,
      title: '本周口碑应用',
      subtitle: '编辑精选',
      created_at: '2026-10-01T00:00:00+08:00',
      apps: [
        { icon_url: 'https://cdn.test/topic-1.png' },
        { icon_url: 'https://cdn.test/topic-2.png' },
      ],
    } as any);
    vi.mocked(spotlightApi.getAppUpdates).mockResolvedValue({ data: [] } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('图标没预热完先显示同尺寸骨架，预热完成后才换成真实海报', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();

    // 数据已到、图标还没好：先占位，避免整块内容突然出现
    expect(skeletonShown(wrapper)).toBe(true);
    expect(cardShown(wrapper)).toBe(false);

    await loadImages(isWeekly);
    expect(cardShown(wrapper)).toBe(true);
    expect(skeletonShown(wrapper)).toBe(false);
    expect(titleOf(wrapper)).toBe('本周上新');
  });

  it('海报一露面就立刻预热下一张（专题）', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await loadImages(isWeekly);

    // 还没到切换时间，专题的图标应该已经被主动预热了
    expect(pendingImages.some((item) => isTopic(item.src))).toBe(true);
    expect(titleOf(wrapper)).toBe('本周上新');
  });

  it('下一张没预热完不切换；预热完成后才切过去', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await loadImages(isWeekly);

    // 停留时间走完 → 该切专题，但专题图标还挂着
    await vi.advanceTimersByTimeAsync(12000);
    expect(titleOf(wrapper)).toBe('本周上新');

    // 专题图标加载完 → 这时才切过去，切过去就是完整内容
    await loadImages(isTopic);
    expect(titleOf(wrapper)).toBe('本周口碑应用');
  });

  it('弱网兜底：预热超过 3 秒也照常切换，不卡住轮播', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await loadImages(isWeekly);

    await vi.advanceTimersByTimeAsync(12000); // 到点，等专题预热（一直没完成）
    expect(titleOf(wrapper)).toBe('本周上新');

    await vi.advanceTimersByTimeAsync(3000); // 触发 3 秒超时兜底
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周口碑应用');
  });

  it('每张海报是常驻卡片：来回切换不重建 DOM（滚动才能接着走）', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await loadImages(isWeekly);

    const weeklyEl = wrapper.findAll('.spotlight-card')[0].element;
    const topicEl = wrapper.findAll('.spotlight-card')[1].element;
    await loadImages(isTopic);

    // 切到专题
    await vi.advanceTimersByTimeAsync(12000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周口碑应用');

    // 再切回本周上新
    await vi.advanceTimersByTimeAsync(7000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周上新');

    // 两张卡还是同一批 DOM 节点：没有被销毁重建，图标滚动状态得以延续
    expect(wrapper.findAll('.spotlight-card')).toHaveLength(2);
    expect(wrapper.findAll('.spotlight-card')[0].element).toBe(weeklyEl);
    expect(wrapper.findAll('.spotlight-card')[1].element).toBe(topicEl);
  });

  it('全场景切换：非专题↔非专题、非专题→专题、专题→非专题，卡片与滚动节点都不重建', async () => {
    // 造一张「今日更新」海报，凑齐 本周上新 / 今日更新 / 专题 三张
    vi.mocked(spotlightApi.getAppUpdates).mockResolvedValue({
      data: (() => {
        // 组件按 UTC+8 判断「今天」，这里用同样口径造数据
        const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
        const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
          d.getUTCDate()
        ).padStart(2, '0')}`;
        return [{ pkg_name: 'com.demo.daily', release_date: today, icon_url: 'https://cdn.test/daily-1.png' }];
      })(),
    } as any);

    const wrapper = mountSpotlight();
    await flushPromises();
    await drainImages(); // 三张海报的图标先全部就绪

    const cardEls = () => wrapper.findAll('.spotlight-card').map((card) => card.element);
    const trackEls = () => wrapper.findAll('.spotlight-track').map((track) => track.element);
    const originalCards = cardEls();
    const originalTracks = trackEls();

    expect(originalCards).toHaveLength(3);
    expect(titleOf(wrapper)).toBe('本周上新');

    // 本周上新 → 今日更新（非专题 ↔ 非专题）
    await vi.advanceTimersByTimeAsync(12000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('今日更新');

    // 切到今日更新后，下一张（专题）已开始预热
    await drainImages();

    // 今日更新 → 专题（非专题 → 专题）
    await vi.advanceTimersByTimeAsync(12000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周口碑应用');

    // 专题 → 本周上新（专题 → 非专题，且跨过一轮会重新取数）
    await vi.advanceTimersByTimeAsync(7000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周上新');

    // 全程没有重建：卡片与滚动轨道的 DOM 节点保持不变
    expect(cardEls()).toEqual(originalCards);
    expect(trackEls()).toEqual(originalTracks);
  });

  it('后台刷新落在展示期间时，正在显示的那张卡不会原地重载', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await drainImages();

    // 下一轮刷新会带回新的本周上新图标
    vi.mocked(spotlightApi.getNewAppsByDateRange).mockResolvedValue({
      data: [{ info: { icon_url: 'https://cdn.test/week-new-1.png' } }],
      total: 1,
    } as any);

    // 一轮走完：本周上新 → 专题 → 绕回本周上新（新一轮开始）
    await vi.advanceTimersByTimeAsync(12000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周口碑应用');
    await vi.advanceTimersByTimeAsync(7000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周上新');

    const activeIcon = () =>
      wrapper.find('.spotlight-card.is-active .spotlight-icon-img').attributes('src');
    expect(activeIcon()).toBe('https://cdn.test/week-1.png');

    // 落地 1 秒后开始后台刷新：新数据回来也不能改写正在显示的这张
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(activeIcon()).toBe('https://cdn.test/week-1.png');

    // 这张切走之后，新图标才在后台生效（用户看不到切换的过程）
    await vi.advanceTimersByTimeAsync(12000);
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周口碑应用');
    expect(
      wrapper.findAll('.spotlight-card')[0].find('.spotlight-icon-img').attributes('src')
    ).toBe('https://cdn.test/week-new-1.png');
  });

  it('绕回第一张不等后台刷新：请求一直挂着也能立刻切换', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await drainImages();

    // 下一轮的刷新请求永远不返回
    vi.mocked(spotlightApi.getTopicDetail).mockImplementation(() => new Promise(() => {}) as any);

    await vi.advanceTimersByTimeAsync(12000); // 切到专题（最后一张），后台刷新开始并挂住
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周口碑应用');

    await vi.advanceTimersByTimeAsync(7000); // 绕回第一张：不该被挂住的请求拖住
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周上新');
  });

  it('回到第一张后约 1 秒，才发起下一轮的请求', async () => {
    const wrapper = mountSpotlight();
    await flushPromises();
    await drainImages();

    const weeklyCalls = () => vi.mocked(spotlightApi.getNewAppsByDateRange).mock.calls.length;
    // 首轮加载已完成，清掉计数，只看下一轮的刷新
    vi.mocked(spotlightApi.getNewAppsByDateRange).mockClear();

    await vi.advanceTimersByTimeAsync(12000); // → 专题
    await flushPromises();
    await vi.advanceTimersByTimeAsync(7000); // → 绕回本周上新（新一轮开始）
    await flushPromises();
    expect(titleOf(wrapper)).toBe('本周上新');

    // 刚落地还没发请求，避免和切换抢资源
    expect(weeklyCalls()).toBe(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(weeklyCalls()).toBe(0);

    // 满 1 秒后才在后台刷新
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(weeklyCalls()).toBe(1);
  });

  // 挂起后不应继续轮播或后台取数
  it('页面被 keep-alive 挂起后，不再轮播、也不再后台取数', async () => {
    const show = ref(true);
    const host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () => (show.value ? h(TopicSpotlight) : h('div', { class: 'other-page' })),
        }),
    });

    const wrapper = mount(host, { global: { stubs: { 'el-icon': true } } });
    await flushPromises();
    await drainImages();

    // 清掉首轮计数，只看挂起之后是否还有请求
    vi.mocked(spotlightApi.getNewAppsByDateRange).mockClear();
    vi.mocked(spotlightApi.getTopics).mockClear();
    vi.mocked(spotlightApi.getTopicDetail).mockClear();

    expect(titleOf(wrapper)).toBe('本周上新');

    // 切到别的页面 → 挂起，不卸载
    show.value = false;
    await nextTick();
    await flushPromises();

    // 挂起后 DOM 在缓存容器里读不到，用调用次数判断：一轮跑完才会后台刷新
    await vi.advanceTimersByTimeAsync(60000);
    await flushPromises();

    expect(spotlightApi.getNewAppsByDateRange).not.toHaveBeenCalled();
    expect(spotlightApi.getTopics).not.toHaveBeenCalled();
    expect(spotlightApi.getTopicDetail).not.toHaveBeenCalled();

    // 切回来：轮播与后台刷新恢复
    show.value = true;
    await nextTick();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(12000 + 7000 + 1500);
    await flushPromises();
    expect(spotlightApi.getNewAppsByDateRange).toHaveBeenCalled();
  });
});
