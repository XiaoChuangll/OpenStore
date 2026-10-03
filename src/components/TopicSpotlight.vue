<template>
  <section
    v-if="showSection"
    class="topic-spotlight"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <div class="spotlight-head">
      <h3 class="spotlight-heading">
        精选专题
        <!-- 多张海报时轮播：小圆点可以手动切 -->
        <span v-if="cards.length > 1" class="spotlight-dots">
          <button
            v-for="(card, index) in cards"
            :key="card.slide.key"
            type="button"
            class="spotlight-dot"
            :class="{ 'is-active': index === activeIndex }"
            :aria-label="`第 ${index + 1} 张海报`"
            :aria-current="index === activeIndex"
            @click="goSlide(index)"
          />
        </span>
      </h3>
    </div>

    <!-- 每张海报一张常驻卡片，轮播只切换 .is-active（不改动 DOM，图标滚动得以延续） -->
    <div class="spotlight-stage">
      <!-- 骨架：与真实卡片同高，先把位置占住，避免整块内容突然出现把下面的板块顶下去 -->
      <div v-if="showSkeleton" class="spotlight-card is-active spotlight-skeleton" aria-hidden="true">
        <div class="spotlight-slide">
          <div class="spotlight-banner spotlight-skeleton-banner"></div>
          <div class="spotlight-body">
            <span class="skeleton-bar is-title"></span>
            <span class="skeleton-bar is-subtitle"></span>
            <span class="skeleton-bar is-meta"></span>
          </div>
        </div>
      </div>

      <template v-else>
        <div
          v-for="(card, index) in cards"
          :key="card.slide.key"
          class="spotlight-card"
          :class="{ 'is-active': index === activeIndex }"
          :aria-hidden="index === activeIndex ? undefined : 'true'"
          role="link"
          tabindex="0"
          :aria-label="`${card.slide.cta}：${card.slide.title}`"
          @click="card.slide.go()"
          @keydown.enter.prevent="card.slide.go()"
          @keydown.space.prevent="card.slide.go()"
        >
        <div class="spotlight-slide">
          <div class="spotlight-banner">
            <span v-if="card.slide.badge" class="spotlight-badge">{{ card.slide.badge }}</span>

            <div v-if="card.blurIcons.length" class="spotlight-blur" aria-hidden="true">
              <img v-for="(icon, i) in card.blurIcons" :key="`b${i}`" :src="icon" alt="" />
            </div>
            <div class="spotlight-veil" aria-hidden="true"></div>

            <!-- 图标过多时上下两行反向滚动，悬停暂停，悬停单个图标放大 -->
            <div
              v-if="card.slide.icons.length"
              class="spotlight-marquee"
              :class="{ 'is-scroll': card.marquee }"
            >
              <div
                v-for="(row, rowIndex) in card.rows"
                :key="rowIndex"
                class="spotlight-row"
                :class="{ 'is-reverse': rowIndex % 2 === 1 }"
              >
                <div
                  class="spotlight-track"
                  :style="{ '--marquee-copies': card.copies, '--marquee-duration': `${rowDuration(row)}s` }"
                >
                  <template v-for="copy in card.copies" :key="copy">
                    <!-- 用原生 img：el-image 在 load 前会渲染占位，图标墙会先空白再填充 -->
                    <span
                      v-for="(icon, i) in row"
                      :key="`${copy}-${i}`"
                      class="spotlight-icon"
                      :aria-hidden="copy > 1 ? 'true' : undefined"
                    >
                      <img
                        v-if="!failedIcons.has(icon)"
                        :src="icon"
                        class="spotlight-icon-img"
                        alt=""
                        @error="failedIcons.add(icon)"
                      />
                      <el-icon v-else class="spotlight-icon-fallback"><Picture /></el-icon>
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div class="spotlight-body">
            <h4 class="spotlight-title">{{ card.slide.title }}</h4>
            <!-- 始终占一行：有些专题没有副标题，用不换行空格占位，避免卡片高度跳动 -->
            <p class="spotlight-subtitle">{{ card.slide.subtitle || '\u00A0' }}</p>
            <div class="spotlight-meta">
              <span>{{ card.slide.metaText }}</span>
              <span class="dot">·</span>
              <span>{{ card.slide.count }} 个应用</span>
              <span class="spotlight-cta">
                {{ card.slide.cta }}
                <el-icon><ArrowRight /></el-icon>
              </span>
            </div>
          </div>
        </div>
      </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Picture } from '@element-plus/icons-vue';
import { getTopics, getTopicDetail, getNewAppsByDateRange, getAppUpdates, type FullSubstanceInfo } from '../services/api';

// active：所在页签是否可见；隐藏时不排期，避免在后台切海报、发请求
const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });

/**
 * 首页的「精选专题」：随机挑一个专题，用专题详情页那套头图展示。
 * 专题列表接口不带应用数量，所以随机抽几个候选、并发取详情，再挑应用最多的那个 ——
 * 既保证每次刷新不一样，又偏向内容更丰富的专题。
 */
const SAMPLE_SIZE = 4;
const BLUR_LIMIT = 8;
/*
 * 海报里最多用多少个不同图标。
 * 太少会来回重复同几个（比如本周 236 个上新只画 28 个），太多也没必要 ——
 * 60 个足够两行滚动看不出重复。
 */
const MAX_ICONS = 60;
// 本周上新按海报用量取（要凑够 MAX_ICONS 个不同图标，所以至少取这么多条）
const WEEKLY_FETCH_SIZE = 60;
// 今日更新同样按海报用量取（更新榜按 release_date 倒序，当天的都在最前面）
const DAILY_FETCH_SIZE = 40;
// 超过 6 个图标就上下来回滚动（本周上新这种只有 7 个应用的专题也能滚起来）
const STATIC_LIMIT = 6;
const MARQUEE_COPIES = 3;

const router = useRouter();
const loading = ref(false);
const topic = ref<FullSubstanceInfo | null>(null);
/** 加载失败的图标地址：换成兜底图标，避免一直挂破图 */
const failedIcons = ref(new Set<string>());

interface SpotlightSlide {
  key: 'weekly' | 'daily' | 'topic';
  badge?: string;
  title: string;
  subtitle: string;
  icons: string[];
  count: number;
  metaText: string;
  cta: string;
  go: () => void;
}

/**
 * 本周上新海报的数据来自「更新页」同一条链路：
 * apps/query 按 listed_at 倒序 + date_from（本周一，UTC+8），取回来的就是本周上新的应用。
 */
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const weeklyIcons = ref<string[]>([]);
const weeklyCount = ref(0);
const weeklyRange = ref('');

/* 今日更新海报：数据来自更新页同一条链路（release_date 倒序），拿回来再按 UTC+8 的"今天"筛 */
const dailyIcons = ref<string[]>([]);
const dailyCount = ref(0);
const dailyLabel = ref('');

const getWeekStartUtc8 = () => {
  const nowLocal = new Date(Date.now() + UTC8_OFFSET_MS);
  const start = new Date(nowLocal);
  start.setUTCHours(0, 0, 0, 0);
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (day === 0 ? -6 : 1 - day)); // 本周一
  return start;
};

const toDateParam = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const formatShortDate = (date: Date) => `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;

/** 时间戳 → 北京时间（UTC+8）的 YYYY-MM-DD，用来判断"是不是今天更新的" */
const toUtc8DateKey = (rawTs: unknown) => {
  if (!rawTs && rawTs !== 0) return '';
  let ms: number;
  if (typeof rawTs === 'number') ms = rawTs;
  else if (typeof rawTs === 'string' && /^\d+$/.test(rawTs)) ms = parseInt(rawTs, 10);
  else ms = new Date(rawTs as string).getTime();
  if (!ms || Number.isNaN(ms)) return '';
  if (ms < 10000000000) ms *= 1000;
  const d = new Date(ms + UTC8_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const dedupeIcons = (items: any[]) =>
  items
    .map((app) => app?.icon_url)
    .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0)
    .filter((url: string, index: number, list: string[]) => list.indexOf(url) === index)
    .slice(0, MAX_ICONS);

const slides = computed<SpotlightSlide[]>(() => {
  const list: SpotlightSlide[] = [];

  if (weeklyIcons.value.length) {
    list.push({
      key: 'weekly',
      badge: '本周上新',
      title: '本周上新',
      subtitle: `本周新上架的鸿蒙应用（${weeklyRange.value}）`,
      icons: weeklyIcons.value,
      count: weeklyCount.value,
      metaText: weeklyRange.value,
      cta: '查看上新',
      go: () => router.push('/updates')
    });
  }

  if (dailyIcons.value.length) {
    list.push({
      key: 'daily',
      badge: '今日更新',
      title: '今日更新',
      subtitle: `今天发布新版本的鸿蒙应用（${dailyLabel.value}）`,
      icons: dailyIcons.value,
      count: dailyCount.value,
      metaText: dailyLabel.value,
      cta: '查看更新',
      go: () => router.push({ path: '/updates', query: { tab: 'update', filter: 'today' } })
    });
  }

  if (topic.value) {
    const current = topic.value;
    const icons = (current.apps || [])
      .map((app) => app?.icon_url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0)
      .filter((url, index, list) => list.indexOf(url) === index)
      .slice(0, MAX_ICONS);

    list.push({
      key: 'topic',
      title: current.title,
      subtitle: current.subtitle?.trim() || '',
      icons,
      count: current.apps?.length || 0,
      metaText: formatDate(current.created_at),
      cta: '查看专题',
      go: () =>
        router.push({
          path: `/topics/${current.substance_id}`,
          query: { title: current.title }
        })
    });
  }

  return list;
});

const activeIndex = ref(0);
const paused = ref(false);

/**
 * 渲染快照。数据刷新时冻结「正在前台」的那张，等它切走后再换内容，
 * 避免用户看到当前海报原地重新加载。
 */
const renderedSlides = ref<SpotlightSlide[]>([]);
let frozenIndex: number | null = null;

const syncRenderedSlides = () => {
  const list = slides.value;
  const next = list.slice();
  const frozenIdx = frozenIndex;
  const frozen = frozenIdx === null ? null : renderedSlides.value[frozenIdx];
  // 同一张海报（key 不变）且仍在前台：沿用旧内容
  if (frozen && frozenIdx !== null && list[frozenIdx] && frozen.key === list[frozenIdx].key) {
    next[frozenIdx] = frozen;
  }
  renderedSlides.value = next;
};

// 数据变了：冻结前台那张，其余直接换新
watch(
  slides,
  () => {
    frozenIndex = slides.value[activeIndex.value] ? activeIndex.value : null;
    syncRenderedSlides();
  },
  { immediate: true }
);

// 切换后解冻：那张已不在前台，可以安全换新内容
watch(activeIndex, () => {
  frozenIndex = null;
  syncRenderedSlides();
});

const current = computed<SpotlightSlide | null>(() => {
  // 用渲染快照：前台那张是冻结的，保证显隐判断与显示内容一致
  const list = renderedSlides.value;
  if (!list.length) return null;
  return list[Math.min(Math.max(activeIndex.value, 0), list.length - 1)];
});

/**
 * 卡片渲染数据。每张海报是一张常驻卡片，轮播只切换前后台（见 .spotlight-card 样式），
 * 因此图标滚动不会因重建而重置。
 */
interface SpotlightCard {
  slide: SpotlightSlide;
  blurIcons: string[];
  rows: string[][];
  marquee: boolean;
  copies: number;
}

const cards = computed<SpotlightCard[]>(() =>
  renderedSlides.value.map((slide) => {
    const icons = slide.icons.slice(0, MAX_ICONS);
    const isMarquee = icons.length > STATIC_LIMIT;
    const half = Math.ceil(icons.length / 2);
    return {
      slide,
      blurIcons: icons.slice(0, BLUR_LIMIT),
      rows: isMarquee ? [icons, [...icons.slice(half), ...icons.slice(0, half)]] : [icons],
      marquee: isMarquee,
      copies: isMarquee ? MARQUEE_COPIES : 1,
    };
  })
);

/**
 * 滚动速度按「每个图标多少秒」算，而不是固定总时长 ——
 * 这样图标多的海报和图标少的海报滚起来速度一致（图标 46px + 间距 10px）。
 *
 * 上限要按「图标池有多大」留够：池子加大到 60 之后，一行就是 60 个图标，
 * 42 秒的循环只有 0.7 秒/个、150 秒也只有 2.5 秒/个，都偏快
 * （用户反馈"图标滚动有点快"）。
 * 现在按 4.2 秒/个算、上限 260 秒：60 个图标 ≈ 4.2 秒/个，
 * 和最初 28 个图标时的手感一致，慢悠悠地飘。
 */
const MARQUEE_SECONDS_PER_ICON = 4.2;
const MARQUEE_MAX_DURATION = 260;
const rowDuration = (row: string[]) =>
  Math.min(MARQUEE_MAX_DURATION, Math.max(10, Math.round(row.length * MARQUEE_SECONDS_PER_ICON)));

const formatDate = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
};

const loadSpotlight = async () => {
  loading.value = true;
  try {
    const { data: list } = await getTopics(1, 60);
    if (!list.length) {
      topic.value = null;
      return;
    }

    const candidates = [...list]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(SAMPLE_SIZE, list.length));

    const details = await Promise.all(
      candidates.map((item) => getTopicDetail(item.substance_id).catch(() => null))
    );
    const valid = details.filter((item): item is FullSubstanceInfo => !!item);
    if (!valid.length) {
      topic.value = null;
      return;
    }

    // 应用多的优先（并列时保留随机顺序）
    valid.sort((a, b) => (b.apps?.length || 0) - (a.apps?.length || 0));
    topic.value = valid[0];
  } catch (error) {
    console.error('Failed to load spotlight topic', error);
    topic.value = null;
  } finally {
    loading.value = false;
  }
};

/** 本周上新海报：复用更新页的「上新」数据（listed_at 倒序 + 本周一起） */
const loadWeekly = async () => {
  try {
    const weekStart = getWeekStartUtc8();
    const today = new Date(Date.now() + UTC8_OFFSET_MS);

    const { data, total } = await getNewAppsByDateRange(toDateParam(weekStart), undefined, 1, WEEKLY_FETCH_SIZE);
    const items = (data || []).map((item: any) => item?.info || item);
    const icons = items
      .map((app: any) => app?.icon_url)
      .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0)
      .filter((url: string, index: number, list: string[]) => list.indexOf(url) === index) // 去掉重复图标
      .slice(0, MAX_ICONS);

    if (!icons.length) return;

    weeklyIcons.value = icons;
    weeklyCount.value = Number(total) || items.length;
    weeklyRange.value = `${formatShortDate(weekStart)} – ${formatShortDate(today)}`;
  } catch (error) {
    console.error('Failed to load weekly new apps', error);
  }
};

/**
 * 今日更新海报：复用更新页「今日更新」那条链路（release_date 倒序）。
 * 上游没有按 release_date 过滤的日期参数（date_from/date_to 过滤的是 listed_at），
 * 所以这里取回第一页再按 UTC+8 的"今天"自己筛；当天的更新基本都在最前面。
 */
const loadDaily = async () => {
  try {
    const { data } = await getAppUpdates(1, DAILY_FETCH_SIZE);
    const todayKey = toUtc8DateKey(Date.now());
    const todayApps = (data || []).filter(
      (app: any) => toUtc8DateKey(app?.release_date || app?.update_time || app?.created_at) === todayKey
    );

    const icons = dedupeIcons(todayApps);
    if (!icons.length) return;

    const today = new Date(Date.now() + UTC8_OFFSET_MS);
    dailyIcons.value = icons;
    dailyCount.value = todayApps.length;
    dailyLabel.value = `${formatShortDate(today)}`;
  } catch (error) {
    console.error('Failed to load today updates', error);
  }
};

/** 手动点圆点：同样先确保目标海报已预热，避免跳过去看到加载过程 */
const goSlide = async (index: number) => {
  if (index === activeIndex.value) return;
  await awaitWarm(slides.value[index]);
  activeIndex.value = index;
  warmUpNext(index);
  scheduleRoundRefresh();
  scheduleNext();
};

/** 重新取一轮数据：换一个专题 + 刷新本周上新 / 今日更新（后台执行，不阻塞切换） */
const refreshAll = async () => {
  try {
    await Promise.all([loadSpotlight(), loadWeekly(), loadDaily()]);
  } catch (error) {
    console.error('Failed to refresh spotlight data', error);
  }
};

// 海报轮播：每张海报停留时间不同（本周上新看久一点），鼠标悬停时暂停
const DWELL_WEEKLY = 12000;
const DWELL_TOPIC = 7000;
let carouselTimer: number | null = null;

/* 本周上新 / 今日更新都是数据型海报，看久一点；专题短一些 */
const dwellOf = (slide: SpotlightSlide | null) =>
  slide?.key === 'weekly' || slide?.key === 'daily' ? DWELL_WEEKLY : DWELL_TOPIC;

/* ------------------------------- 图标预热 ------------------------------- */

/** 切换前等待预热的上限（弱网兜底） */
const WARMUP_TIMEOUT_MS = 3000;

/** 预热标识：带上图标清单，刷新换了图标但 key 不变时也要重新预热 */
const warmKeyOf = (slide: SpotlightSlide) => `${slide.key}::${slide.icons.join('|')}`;

/** 已预热完成（含确认加载失败） */
const warmedSlides = ref(new Set<string>());
/** 等待超时后放行的，不重复等 */
const skippedSlides = ref(new Set<string>());
/** 进行中的预热，用于去重 */
const warmingPromises = new Map<string, Promise<void>>();

/** 下载并 decode 一组图片；成功失败都算完成，避免个别坏图卡住整批 */
const warmUpImages = (urls: string[]) => {
  const unique = [...new Set(urls.filter(Boolean))];
  return Promise.all(
    unique.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          const done = () => resolve();
          img.onload = () => {
            // onload 只代表下载完，再 decode 一次，首帧绘制就不用现解码
            if (typeof img.decode === 'function') img.decode().then(done, done);
            else done();
          };
          img.onerror = done;
          img.src = url;
        })
    )
  );
};

/** 开始预热（只发一次，不设上限，后台下完为止；超时兜底在 awaitWarm） */
const ensureSlideWarm = (slide?: SpotlightSlide | null): Promise<void> => {
  if (!slide || !slide.icons.length) return Promise.resolve();
  const key = warmKeyOf(slide);
  if (warmedSlides.value.has(key)) return Promise.resolve();
  const inflight = warmingPromises.get(key);
  if (inflight) return inflight;

  const task = warmUpImages(slide.icons.slice(0, MAX_ICONS)).then(() => {
    warmedSlides.value.add(key);
    warmingPromises.delete(key);
  });

  warmingPromises.set(key, task);
  return task;
};

/** 等预热完成，最多 WARMUP_TIMEOUT_MS；超时记入 skippedSlides 放行 */
const awaitWarm = async (slide?: SpotlightSlide | null) => {
  if (!slide || !slide.icons.length) return;
  const key = warmKeyOf(slide);
  if (warmedSlides.value.has(key) || skippedSlides.value.has(key)) return;

  await Promise.race([
    ensureSlideWarm(slide),
    new Promise<void>((resolve) => window.setTimeout(resolve, WARMUP_TIMEOUT_MS)),
  ]);
  if (!warmedSlides.value.has(key)) skippedSlides.value.add(key);
};

/** 预热下一张（当前这张一显示就调用，给切换留提前量） */
const warmUpNext = (from = activeIndex.value) => {
  const list = slides.value;
  if (list.length < 2) return;
  void ensureSlideWarm(list[(from + 1) % list.length]);
};

/** 本轮是否已刷新过 */
let refreshedThisRound = false;
/** 后台刷新的延时器 */
let roundRefreshTimer: number | null = null;
const ROUND_REFRESH_DELAY_MS = 1000;

/**
 * 新一轮开头（回到第一张）落地约 1 秒后，在后台刷新下一轮数据：
 * 延迟 1 秒让切换先渲染完，整轮停留时间用来加载，切换时无需等数据。
 */
const scheduleRoundRefresh = () => {
  if (roundRefreshTimer) window.clearTimeout(roundRefreshTimer);
  roundRefreshTimer = null;
  // 只在回到第一张时排一次
  if (activeIndex.value !== 0) return;
  refreshedThisRound = false;
  roundRefreshTimer = window.setTimeout(() => {
    roundRefreshTimer = null;
    if (!props.active || refreshedThisRound) return;
    refreshedThisRound = true;
    void refreshAll().then(() => {
      // 刷新后预热下一张的图标
      warmUpNext();
    });
  }, ROUND_REFRESH_DELAY_MS);
};

/** 当前这张是否已就绪（或已超时放行）；没就绪不渲染，避免露出加载过程 */
const currentReady = computed(() => {
  const slide = current.value;
  if (!slide || !slide.icons.length) return true;
  const key = warmKeyOf(slide);
  return warmedSlides.value.has(key) || skippedSlides.value.has(key);
});

/** 是否渲染这一块：加载中或已有数据就占位，避免整块内容突然出现 */
const showSection = computed(() => loading.value || slides.value.length > 0);
/** 是否显示骨架：数据或图标还没就绪 */
const showSkeleton = computed(() => !(cards.value.length > 0 && currentReady.value));

/* ------------------------------- 轮播排期 ------------------------------- */

/** 按当前海报的停留时间排下一次切换（手动切换后会重新计时） */
const scheduleNext = () => {
  if (carouselTimer) window.clearTimeout(carouselTimer);
  carouselTimer = null;
  // 页签隐藏时不排期
  if (!props.active) return;

  carouselTimer = window.setTimeout(async () => {
    if (!paused.value && slides.value.length > 1) {
      const nextIndex = (activeIndex.value + 1) % slides.value.length;
      const list = slides.value;
      const target = Math.min(nextIndex, Math.max(list.length - 1, 0));
      // 等下一张预热完成再切（最多 3 秒）
      await awaitWarm(list[target]);

      activeIndex.value = target;
      // 落地即预热再下一张
      warmUpNext(target);
      // 新一轮开头：落地 1 秒后后台刷新
      scheduleRoundRefresh();
    }
    scheduleNext();
  }, dwellOf(current.value));
};

watch(
  () => props.active,
  (on) => {
    if (on) {
      scheduleNext();
    } else if (carouselTimer) {
      window.clearTimeout(carouselTimer);
      carouselTimer = null;
      // 页签隐藏就不再排后台刷新
      if (roundRefreshTimer) {
        window.clearTimeout(roundRefreshTimer);
        roundRefreshTimer = null;
      }
    }
  }
);

onMounted(async () => {
  await Promise.all([loadWeekly(), loadDaily(), loadSpotlight()]);
  // 首屏先预热第一张再显示（最多 3 秒）
  await awaitWarm(slides.value[0]);
  activeIndex.value = 0;
  // 一露面就预热下一张
  warmUpNext(0);
  scheduleNext();
});

onUnmounted(() => {
  if (carouselTimer) window.clearTimeout(carouselTimer);
  if (roundRefreshTimer) window.clearTimeout(roundRefreshTimer);
});
</script>

<style scoped>
.topic-spotlight {
  margin-top: 20px;
}

.spotlight-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.spotlight-heading {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 轮播圆点 */
.spotlight-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  vertical-align: middle;
}

.spotlight-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: var(--el-border-color);
  cursor: pointer;
  transition: background-color 0.2s, transform 0.2s;
}

.spotlight-dot:hover {
  background-color: var(--el-color-primary-light-5);
}

.spotlight-dot.is-active {
  background-color: var(--el-color-primary);
  transform: scale(1.2);
}

/* 海报舞台：所有卡片叠在这里，只有当前这张占布局位置 */
.spotlight-stage {
  position: relative;
}

/*
 * 常驻卡片：轮播只切换前后台。后台卡片用 visibility 隐藏（不是 display:none），
 * 否则动画会被重置。
 */
.spotlight-card {
  position: absolute;
  inset: 0;
  opacity: 0;
  visibility: hidden;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
  cursor: pointer;
  /* 隐藏延到淡出之后，让退场动画播完 */
  transition: opacity 0.34s ease, visibility 0s linear 0.34s, border-color 0.2s, box-shadow 0.2s;
}

.spotlight-card.is-active {
  /* 当前这张回到正常流，撑起舞台高度 */
  position: relative;
  inset: auto;
  opacity: 1;
  visibility: visible;
  transition: opacity 0.34s ease, visibility 0s linear 0s, border-color 0.2s, box-shadow 0.2s;
}

/* 骨架：与真实卡片同高，先把位置占住 */
.spotlight-skeleton {
  cursor: default;
}

.spotlight-skeleton:hover {
  border-color: var(--el-border-color);
  box-shadow: var(--el-box-shadow-light);
}

.spotlight-skeleton-banner {
  background: var(--el-fill-color-light);
}

.spotlight-skeleton .skeleton-bar {
  display: block;
  border-radius: 6px;
  background-color: var(--el-fill-color);
  animation: spotlight-skeleton-pulse 1.4s ease-in-out infinite;
}

.spotlight-skeleton .is-title {
  width: 160px;
  height: 24px;
  margin-bottom: 6px;
}

.spotlight-skeleton .is-subtitle {
  width: 260px;
  height: 18px;
  margin-bottom: 12px;
}

.spotlight-skeleton .is-meta {
  width: 180px;
  height: 16px;
}

@keyframes spotlight-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

/* 非当前卡：图标滚动原地暂停，切回来从暂停位置继续 */
.spotlight-card:not(.is-active) .spotlight-track {
  animation-play-state: paused;
}

.spotlight-slide {
  width: 100%;
}

/* 本周上新角标 */
.spotlight-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  padding: 3px 10px;
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--el-color-primary) 88%, transparent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.spotlight-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 12px 28px -18px rgba(15, 23, 42, 0.55);
}

.spotlight-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.spotlight-banner {
  position: relative;
  height: 160px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}

.spotlight-blur {
  position: absolute;
  inset: -30%;
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  gap: 22px;
  filter: blur(26px) saturate(1.25);
  transform: scale(1.15);
  opacity: 0.85;
}

.spotlight-blur img {
  flex: 1 1 140px;
  min-width: 120px;
  height: 118px;
  border-radius: 26px;
  object-fit: cover;
}

.spotlight-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.08) 58%, var(--el-bg-color) 100%);
}

html.dark .spotlight-veil {
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.24) 58%, var(--el-bg-color) 100%);
}

.spotlight-marquee {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  padding: 14px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%);
}

.spotlight-row {
  display: flex;
  align-items: center;
  min-height: 76px;
  overflow: hidden;
}

.spotlight-marquee.is-scroll .spotlight-row {
  min-height: 0;
  overflow: visible;
}

.spotlight-marquee:not(.is-scroll) .spotlight-row {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.spotlight-marquee:not(.is-scroll) .spotlight-row::-webkit-scrollbar {
  display: none;
}

.spotlight-track {
  display: flex;
  align-items: center;
  gap: 10px;
  width: max-content;
  --marquee-copies: 3;
  padding-right: 10px;
}

.spotlight-marquee:not(.is-scroll) .spotlight-track {
  margin: 0 auto;
  padding-right: 0;
}

.spotlight-marquee.is-scroll .spotlight-track {
  /* 时长由图标数量算出（见 rowDuration），保证每张海报的滚动速度一致 */
  animation: spotlight-marquee var(--marquee-duration, 26s) linear infinite;
  will-change: transform;
}

.spotlight-row.is-reverse .spotlight-track {
  animation-direction: reverse;
}

.spotlight-marquee:hover .spotlight-track,
.spotlight-marquee:focus-within .spotlight-track {
  animation-play-state: paused;
}

@keyframes spotlight-marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(calc(-100% / var(--marquee-copies, 3)));
  }
}

.spotlight-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18);
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease;
  position: relative;
}

/* 图标本体：填满外壳 */
.spotlight-icon-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

html.dark .spotlight-icon {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.42);
}

.spotlight-icon:hover {
  transform: scale(1.18);
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.26);
  z-index: 3;
}

html.dark .spotlight-icon:hover {
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.52);
}

.spotlight-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  font-size: 18px;
}

.spotlight-body {
  padding: 18px 22px 20px;
}

.spotlight-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.spotlight-subtitle {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  /* 固定一行高度：长了省略、空了也占位，卡片高度只跟内容量无关地保持一致 */
  min-height: 1.4em;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.spotlight-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.spotlight-meta .dot {
  opacity: 0.6;
}

.spotlight-cta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: var(--el-color-primary);
  font-weight: 500;
}

@media (max-width: 640px) {
  .spotlight-banner {
    height: 136px;
  }

  .spotlight-marquee {
    bottom: 10px;
    padding: 12px 0;
    gap: 8px;
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
  }

  .spotlight-row {
    min-height: 68px;
  }

  .spotlight-icon {
    width: 40px;
    height: 40px;
    border-radius: 11px;
  }

  .spotlight-track {
    gap: 8px;
    padding-right: 8px;
  }

  .spotlight-body {
    padding: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spotlight-marquee.is-scroll .spotlight-track {
    animation: none;
  }

  .spotlight-icon:hover {
    transform: none;
  }

  .spotlight-skeleton .skeleton-bar {
    animation: none;
  }
}
</style>
