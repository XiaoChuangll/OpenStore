<template>
  <section
    v-if="loading || current"
    class="topic-spotlight"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <div class="spotlight-head">
      <h3 class="spotlight-heading">
        精选专题
        <!-- 多张海报时轮播：小圆点可以手动切 -->
        <span v-if="slides.length > 1" class="spotlight-dots">
          <button
            v-for="(slide, index) in slides"
            :key="slide.key"
            type="button"
            class="spotlight-dot"
            :class="{ 'is-active': index === activeIndex }"
            :aria-label="`第 ${index + 1} 张海报`"
            :aria-current="index === activeIndex"
            @click="goSlide(index)"
          />
        </span>
      </h3>
      <el-button
        text
        size="small"
        class="spotlight-refresh"
        :loading="loading"
        @click="handleRefresh"
      >
        换一个
      </el-button>
    </div>

    <div
      class="spotlight-card"
      :class="{ 'is-loading': loading }"
      role="link"
      tabindex="0"
      :aria-label="current ? `${current.cta}：${current.title}` : '精选专题'"
      @click="openTopic"
      @keydown.enter.prevent="openTopic"
      @keydown.space.prevent="openTopic"
    >
      <transition name="spotlight-swap" mode="out-in">
        <div :key="current?.key || 'empty'" class="spotlight-slide">
          <div class="spotlight-banner">
            <span v-if="current?.badge" class="spotlight-badge">{{ current.badge }}</span>

            <div class="spotlight-blur" aria-hidden="true">
              <img v-for="(icon, i) in blurIcons" :key="`b${i}`" :src="icon" alt="" />
            </div>
            <div class="spotlight-veil" aria-hidden="true"></div>

            <!-- 图标过多时上下两行反向滚动，悬停暂停，悬停单个图标放大 -->
            <div
              v-if="icons.length"
              class="spotlight-marquee"
              :class="{ 'is-scroll': marquee }"
            >
              <div
                v-for="(row, rowIndex) in rows"
                :key="rowIndex"
                class="spotlight-row"
                :class="{ 'is-reverse': rowIndex % 2 === 1 }"
              >
                <div
                  class="spotlight-track"
                  :style="{ '--marquee-copies': copies, '--marquee-duration': `${rowDuration(row)}s` }"
                >
                  <template v-for="copy in copies" :key="copy">
                    <el-image
                      v-for="(icon, i) in row"
                      :key="`${copy}-${i}`"
                      :src="icon"
                      class="spotlight-icon"
                      fit="cover"
                      :aria-hidden="copy > 1 ? 'true' : null"
                    >
                      <template #error>
                        <span class="spotlight-icon-fallback">
                          <el-icon><Picture /></el-icon>
                        </span>
                      </template>
                    </el-image>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <div class="spotlight-body">
            <h4 class="spotlight-title">{{ current?.title || '正在挑一个专题…' }}</h4>
            <!-- 始终占一行：有些专题没有副标题，用不换行空格占位，避免切换海报时卡片高度跳动 -->
            <p class="spotlight-subtitle">{{ current?.subtitle || '\u00A0' }}</p>
            <div v-if="current" class="spotlight-meta">
              <span>{{ current.metaText }}</span>
              <span class="dot">·</span>
              <span>{{ appCount }} 个应用</span>
              <span class="spotlight-cta">
                {{ current.cta }}
                <el-icon><ArrowRight /></el-icon>
              </span>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, Picture } from '@element-plus/icons-vue';
import { getTopics, getTopicDetail, getNewAppsByDateRange, type FullSubstanceInfo } from '../services/api';

/**
 * 首页的「精选专题」：随机挑一个专题，用专题详情页那套头图展示。
 * 专题列表接口不带应用数量，所以随机抽几个候选、并发取详情，再挑应用最多的那个 ——
 * 既保证每次刷新不一样，又偏向内容更丰富的专题。
 */
const SAMPLE_SIZE = 4;
const BLUR_LIMIT = 8;
// 海报里最多用多少个不同图标（太少会来回重复同几个，太多没必要）
const MAX_ICONS = 28;
// 本周上新只按海报需要的数量取，不用拉一整页
const WEEKLY_FETCH_SIZE = 30;
// 超过 6 个图标就上下来回滚动（本周上新这种只有 7 个应用的专题也能滚起来）
const STATIC_LIMIT = 6;
const MARQUEE_COPIES = 3;

const router = useRouter();
const loading = ref(false);
const topic = ref<FullSubstanceInfo | null>(null);

interface SpotlightSlide {
  key: 'weekly' | 'topic';
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
const current = computed<SpotlightSlide | null>(() => {
  const list = slides.value;
  if (!list.length) return null;
  return list[Math.min(Math.max(activeIndex.value, 0), list.length - 1)];
});

const appCount = computed(() => current.value?.count || 0);
const iconUrls = computed(() => (current.value?.icons || []).slice(0, MAX_ICONS));
const blurIcons = computed(() => iconUrls.value.slice(0, BLUR_LIMIT));
const icons = computed(() => iconUrls.value);
const marquee = computed(() => icons.value.length > STATIC_LIMIT);
const rows = computed(() => {
  const list = icons.value;
  if (!marquee.value) return [list];
  const half = Math.ceil(list.length / 2);
  return [list, [...list.slice(half), ...list.slice(0, half)]];
});
const copies = computed(() => (marquee.value ? MARQUEE_COPIES : 1));

/**
 * 滚动速度按「每个图标多少秒」算，而不是固定总时长 ——
 * 这样图标多的海报和图标少的海报滚起来速度一致（图标 46px + 间距 10px）。
 */
const MARQUEE_SECONDS_PER_ICON = 4.6;
const rowDuration = (row: string[]) => Math.max(10, Math.round(row.length * MARQUEE_SECONDS_PER_ICON));

const formatDate = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
};

const openTopic = () => {
  current.value?.go();
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

const goSlide = (index: number) => {
  activeIndex.value = index;
  scheduleNext();
};

/** 「换一个」：换掉精选专题那张海报，并切到它 */
const handleRefresh = async () => {
  await loadSpotlight();
  const index = slides.value.findIndex((slide) => slide.key === 'topic');
  if (index >= 0) activeIndex.value = index;
  scheduleNext();
};

// 海报轮播：每张海报停留时间不同（本周上新看久一点），鼠标悬停时暂停
const DWELL_WEEKLY = 12000;
const DWELL_TOPIC = 7000;
let carouselTimer: number | null = null;

const dwellOf = (slide: SpotlightSlide | null) => (slide?.key === 'weekly' ? DWELL_WEEKLY : DWELL_TOPIC);

/** 按当前海报的停留时间排下一次切换（手动切换后会重新计时） */
const scheduleNext = () => {
  if (carouselTimer) window.clearTimeout(carouselTimer);
  carouselTimer = window.setTimeout(() => {
    if (!paused.value && slides.value.length > 1) {
      activeIndex.value = (activeIndex.value + 1) % slides.value.length;
    }
    scheduleNext();
  }, dwellOf(current.value));
};

onMounted(async () => {
  await Promise.all([loadWeekly(), loadSpotlight()]);
  activeIndex.value = 0;
  scheduleNext();
});

onUnmounted(() => {
  if (carouselTimer) window.clearTimeout(carouselTimer);
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

.spotlight-refresh {
  color: var(--el-text-color-secondary);
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

.spotlight-card {
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-light);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.spotlight-slide {
  width: 100%;
}

/* 海报切换动画 */
.spotlight-swap-enter-active,
.spotlight-swap-leave-active {
  transition: opacity 0.32s ease-out, transform 0.32s ease-out;
}

.spotlight-swap-enter-from {
  opacity: 0;
  transform: translateX(18px);
}

.spotlight-swap-leave-to {
  opacity: 0;
  transform: translateX(-18px);
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

.spotlight-card.is-loading {
  opacity: 0.6;
  pointer-events: none;
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
}
</style>
