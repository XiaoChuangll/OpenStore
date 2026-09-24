<template>
  <div class="topic-list-view">
    <header class="page-header">
      <div class="header-main">
        <h1>精选专题</h1>
        <p>跟随专题逛鸿蒙生态，发现值得一试的应用</p>
      </div>
      <div v-if="total > 0" class="header-side">
        <span class="count-chip">已加载 {{ topics.length }} / {{ total }}</span>
        <el-tooltip content="刷新" placement="bottom">
          <el-button :icon="Refresh" circle :loading="loading" @click="refresh" />
        </el-tooltip>
      </div>
    </header>

    <div v-if="loading && topics.length === 0" class="topics-grid">
      <div v-for="i in 6" :key="i" class="topic-card is-skeleton">
        <div class="topic-icons">
          <span v-for="n in 5" :key="n" class="app-icon-slot is-placeholder" />
        </div>
        <div class="topic-body">
          <el-skeleton :rows="2" animated />
        </div>
      </div>
    </div>

    <el-result v-else-if="error" icon="error" title="获取专题失败" :sub-title="error">
      <template #extra>
        <el-button type="primary" @click="refresh">重试</el-button>
      </template>
    </el-result>

    <template v-else>
      <div
        v-if="topics.length"
        ref="gridRef"
        class="topics-grid"
        :style="{ '--icon-size': `${iconSize}px`, '--icon-gap': '8px' }"
      >
        <article
          v-for="topic in topics"
          :key="topic.substance_id"
          class="topic-card"
          role="button"
          tabindex="0"
          @click="goToDetail(topic)"
          @keydown.enter="goToDetail(topic)"
          @keydown.space.prevent="goToDetail(topic)"
        >
          <!-- 专题没有封面图，用该专题下的应用图标横向排一行 -->
          <div class="topic-icons">
            <template v-if="iconsOf(topic.substance_id).icons.length">
              <el-image
                v-for="(icon, i) in iconsOf(topic.substance_id).icons"
                :key="i"
                :src="icon"
                class="app-icon-slot"
                fit="cover"
                loading="lazy"
              >
                <template #error>
                  <span class="app-icon-fallback">
                    <el-icon><Picture /></el-icon>
                  </span>
                </template>
              </el-image>
              <span v-if="iconsOf(topic.substance_id).more" class="app-icon-slot is-more">
                +{{ iconsOf(topic.substance_id).more }}
              </span>
            </template>

            <template v-else-if="isAppsLoading(topic.substance_id)">
              <span v-for="n in 5" :key="n" class="app-icon-slot is-placeholder" />
            </template>

            <span v-else class="icons-empty">暂无应用</span>
          </div>

          <div class="topic-body">
            <h3 class="topic-title" :title="topic.title">{{ topic.title }}</h3>
            <p class="topic-subtitle">{{ topic.subtitle || '暂无介绍' }}</p>
          </div>

          <footer class="topic-foot">
            <el-icon><Calendar /></el-icon>
            <span>{{ formatDate(topic.created_at) }}</span>
            <el-icon class="foot-arrow"><ArrowRight /></el-icon>
          </footer>
        </article>
      </div>

      <el-empty v-else description="暂无专题" />

      <div v-if="hasMore" class="load-more">
        <el-button round :loading="loading" @click="loadMore">
          加载更多
          <span class="load-more-hint">还有 {{ Math.max(total - topics.length, 0) }} 个</span>
        </el-button>
      </div>
      <p v-else-if="topics.length" class="load-end">已经到底啦 · 共 {{ total }} 个专题</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { getTopics, getTopicDetail, type ShortSubstanceInfo } from '../services/api';
import { ArrowRight, Calendar, Picture, Refresh } from '@element-plus/icons-vue';

defineOptions({
  name: 'TopicView'
});

const router = useRouter();

const topics = ref<ShortSubstanceInfo[]>([]);
const loading = ref(false);
const error = ref('');
// 上游自 0.12.0 起分页统一为 1-based（page=0 会被当成第 1 页），
// 所以这里必须从 1 开始，否则"加载更多"会把第 1 页重复拉一遍。
const currentPage = ref(1);
const pageSize = 20;
const total = ref(0);

const hasMore = computed(() => topics.value.length < total.value);

/* ---------------- 卡片上的应用图标 ---------------- */

const ICON_GAP = 8;
const MAX_ICON_SIZE = 56;
const MIN_ICON_SIZE = 40;
/** 每张卡片显示几个图标、单个图标多大：按当前列宽算，让图标行刚好铺满卡片 */
const gridRef = ref<HTMLElement | null>(null);
const iconsPerCard = ref(5);
const iconSize = ref(36);

const measureGrid = () => {
  const el = gridRef.value;
  if (!el) return;

  const columns = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean);
  const columnWidth = columns.length ? parseFloat(columns[0]) : el.clientWidth;
  const rowWidth = Math.max(columnWidth - 32, 120); // 卡片左右各 16px 内边距

  // 先按"最小可接受尺寸"算这一行能放几个，再把它们放大到刚好铺满
  let fit = Math.floor((rowWidth + ICON_GAP) / (MIN_ICON_SIZE + ICON_GAP));
  fit = Math.min(Math.max(fit, 3), 6);

  const size = Math.floor((rowWidth - (fit - 1) * ICON_GAP) / fit);
  iconsPerCard.value = fit;
  iconSize.value = Math.max(30, Math.min(MAX_ICON_SIZE, size));
};

/** 专题 id -> 该专题的应用列表。模块级缓存，翻页/来回切换都不会重复请求 */
const appsCache = new Map<string, { icon_url?: string }[]>();
const topicApps = ref<Record<string, { icon_url?: string }[]>>({});
const pendingIds = new Set<string>();
const queue: string[] = [];
let activeCount = 0;
const MAX_CONCURRENCY = 3;

const isAppsLoading = (id: string) => pendingIds.has(id) && !appsCache.has(id);

const pump = () => {
  while (activeCount < MAX_CONCURRENCY && queue.length) {
    const id = queue.shift() as string;
    activeCount += 1;
    getTopicDetail(id)
      .then((detail) => {
        appsCache.set(id, (detail?.apps || []) as { icon_url?: string }[]);
      })
      .catch(() => {
        appsCache.set(id, []);
      })
      .finally(() => {
        activeCount -= 1;
        pendingIds.delete(id);
        topicApps.value = { ...topicApps.value, [id]: appsCache.get(id) || [] };
        pump();
      });
  }
};

/** 只为还没拿过图标的专题排队，且最多同时请求 3 个 */
const ensureTopicApps = (ids: string[]) => {
  let queued = false;
  for (const id of ids) {
    if (appsCache.has(id) || pendingIds.has(id)) continue;
    pendingIds.add(id);
    queue.push(id);
    queued = true;
  }
  if (queued) pump();
};

const iconsOf = (id: string) => {
  const apps = topicApps.value[id] || appsCache.get(id) || [];
  const per = iconsPerCard.value;
  const more = Math.max(apps.length - per, 0);
  const shown = more > 0 ? apps.slice(0, per - 1) : apps.slice(0, per);
  return {
    icons: shown.map((a) => a.icon_url).filter((u): u is string => !!u),
    more: apps.length - shown.length
  };
};

/* ---------------- 列表数据 ---------------- */

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const fetchTopics = async (reset = false) => {
  if (reset) {
    currentPage.value = 1;
    topics.value = [];
  }

  loading.value = true;
  error.value = '';

  try {
    const res = await getTopics(currentPage.value, pageSize);
    topics.value = reset ? res.data : [...topics.value, ...res.data];
    total.value = res.total;
    ensureTopicApps(topics.value.map((t) => t.substance_id));

    // 网格渲染出来后再量一次列宽，并在宽度变化时重新计算图标数量/尺寸
    await nextTick();
    measureGrid();
    if (resizeObserver && gridRef.value) resizeObserver.observe(gridRef.value);
  } catch (err: any) {
    console.error(err);
    error.value = '无法加载专题列表，请稍后再试';
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  currentPage.value += 1;
  fetchTopics();
};

const refresh = () => {
  fetchTopics(true);
};

const goToDetail = (topic: ShortSubstanceInfo) => {
  router.push({
    path: `/topics/${topic.substance_id}`,
    query: { title: topic.title }
  });
};

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  fetchTopics(true);
  measureGrid();
  window.addEventListener('resize', measureGrid);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measureGrid);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measureGrid);
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.topic-list-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 20px 80px;
}

/* ---------- 页头 ---------- */

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}

.header-main h1 {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--el-text-color-primary);
}

.header-main p {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.header-side {
  display: flex;
  align-items: center;
  gap: 10px;
}

.count-chip {
  padding: 4px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

/* ---------- 网格与卡片 ---------- */

.topics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: 16px;
}

.topic-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.topic-card:hover,
.topic-card:focus-visible {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--el-color-primary) 40%, transparent);
  box-shadow: 0 12px 26px -14px rgba(15, 23, 42, 0.45);
}

.topic-card:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 2px;
}

/* ---------- 图标行 ---------- */

.topic-icons {
  display: flex;
  align-items: center;
  gap: var(--icon-gap, 8px);
  height: calc(var(--icon-size, 36px) + 22px);
  padding: 14px 16px 0;
  overflow: hidden;
}

.app-icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-size, 36px);
  height: var(--icon-size, 36px);
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-light);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
}

.app-icon-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  font-size: calc(var(--icon-size, 36px) * 0.42);
}

.app-icon-slot.is-more {
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: calc(var(--icon-size, 36px) * 0.34);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.app-icon-slot.is-placeholder {
  border-style: dashed;
  background: transparent;
  box-shadow: none;
  animation: icon-pulse 1.4s ease-in-out infinite;
}

.app-icon-slot.is-placeholder:nth-child(2) { animation-delay: 0.12s; }
.app-icon-slot.is-placeholder:nth-child(3) { animation-delay: 0.24s; }
.app-icon-slot.is-placeholder:nth-child(4) { animation-delay: 0.36s; }
.app-icon-slot.is-placeholder:nth-child(5) { animation-delay: 0.48s; }

@keyframes icon-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.85; }
}

.icons-empty {
  font-size: 12.5px;
  color: var(--el-text-color-placeholder);
}

/* ---------- 正文 ---------- */

.topic-body {
  flex: 1;
  min-height: 0;
  padding: 10px 16px 10px;
}

.topic-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--el-text-color-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topic-subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topic-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 16px;
  padding: 10px 0 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.foot-arrow {
  margin-left: auto;
  transition: transform 0.2s ease, color 0.2s ease;
}

.topic-card:hover .foot-arrow {
  transform: translateX(3px);
  color: var(--el-color-primary);
}

.is-skeleton {
  cursor: default;
}

/* ---------- 加载更多 ---------- */

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}

.load-more-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.load-end {
  margin: 26px 0 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--el-text-color-placeholder);
}

@media (max-width: 640px) {
  .topic-list-view {
    padding: 16px 14px 80px;
  }

  .topics-grid {
    gap: 12px;
  }

  .page-header {
    align-items: flex-start;
  }
}
</style>
