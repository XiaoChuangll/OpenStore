<template>
  <el-card class="freshness-card" shadow="hover" v-loading="loading">
    <template #header>
      <div class="freshness-header">
        <span class="freshness-title">数据新鲜度</span>
      </div>
    </template>

    <div
      ref="listRef"
      class="freshness-list"
      :class="{ 'is-compact': compact, 'is-open': bundleOpen }"
    >
      <template v-for="(item, index) in orderedPages" :key="item.key">
        <!-- 窄屏（内容区单列）时，进度条较少的页面打包成一组，避免一路往下堆 -->
        <div v-if="showBundleHead(index)" class="freshness-bundle-head">
          <span class="freshness-bundle-title">其余 {{ bundledPages.length }} 项</span>
          <button type="button" class="freshness-bundle-toggle" @click="bundleOpen = !bundleOpen">
            {{ bundleOpen ? '收起明细' : '展开明细' }}
          </button>
        </div>

        <div class="freshness-item" :class="{ 'is-bundled': isBundled(index) }" :title="metaTitle(item)">
          <div class="freshness-row">
            <span class="freshness-label">
              <span class="freshness-dot" :class="statusClass(item)"></span>
              <span class="freshness-label-text">{{ item.label }}</span>
            </span>
            <span class="freshness-age">{{ formatAge(item.ageSeconds) }}</span>
          </div>
          <div class="freshness-bar">
            <div
              class="freshness-bar-fill"
              :class="statusClass(item)"
              :style="{ width: barWidth(item) }"
            ></div>
          </div>
          <div v-if="!isBundled(index) || bundleOpen" class="freshness-meta">
            <span>{{ item.last ? formatTime(item.last) : '暂无访问' }}</span>
            <span>近 30 天 {{ item.visits.toLocaleString('zh-CN') }} 次</span>
          </div>
        </div>
      </template>
    </div>

    <p v-if="error" class="freshness-error">{{ error }}</p>
  </el-card>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import { getFreshnessOverview, type FreshnessItem, type PageVisitItem } from '../services/admin';

const REFRESH_MS = 60000;
/** 内容区窄于这个宽度时是单列布局，把进度条较少的页面打包展示 */
const COMPACT_MAX_WIDTH = 500;
/** 至少要留下几项单独展示，不然「打包」就没意义了 */
const KEEP_ROWS = 3;
/** 进度条不足最宽那条 10% 的算「较少」 */
const SMALL_BAR_RATIO = 0.1;

const items = ref<FreshnessItem[]>([]);
const pages = ref<PageVisitItem[]>([]);
const loading = ref(false);
const error = ref('');
const compact = ref(false);
const bundleOpen = ref(false);
const listRef = ref<HTMLElement | null>(null);
let timer: number | null = null;
let resizeObserver: ResizeObserver | null = null;

const load = async () => {
  loading.value = true;
  try {
    const overview = await getFreshnessOverview();
    items.value = overview.items;
    pages.value = overview.pages;
    error.value = '';
  } catch (e: any) {
    error.value = '读取新鲜度失败：' + (e?.message || '未知错误');
  } finally {
    loading.value = false;
  }
};

// 页面访问没有 TTL，用固定阈值：1 小时内有人访问=新鲜，1 天内=走弱，更久=偏红
const statusOf = (item: PageVisitItem): 'fresh' | 'aging' | 'stale' | 'neutral' => {
  if (item.ageSeconds === null) return 'neutral';
  if (item.ageSeconds <= 3600) return 'fresh';
  if (item.ageSeconds <= 86400) return 'aging';
  return 'stale';
};

const statusClass = (item: PageVisitItem) => `is-${statusOf(item)}`;

/** 进度条表示访问量占比（相对访问最多的那个页面） */
const maxVisits = computed(() => Math.max(1, ...pages.value.map((page) => page.visits)));

const barWidth = (item: PageVisitItem) => {
  return `${Math.max(4, Math.round((item.visits / maxVisits.value) * 100))}%`;
};

/** 窄屏时按访问量倒序，好把「进度条较少」的排在后面打包起来 */
const orderedPages = computed(() =>
  compact.value ? [...pages.value].sort((a, b) => b.visits - a.visits) : pages.value
);

/** 单独展示的条数：进度条够长的留着自己一行，其余打包（至少留 KEEP_ROWS 条） */
const primaryCount = computed(() => {
  const total = orderedPages.value.length;
  if (!compact.value || total <= KEEP_ROWS + 2) return total;
  const bigBars = orderedPages.value.filter((item) => item.visits / maxVisits.value >= SMALL_BAR_RATIO).length;
  return Math.min(Math.max(bigBars, KEEP_ROWS), total - 2);
});

const isBundled = (index: number) => compact.value && index >= primaryCount.value;

const bundledPages = computed(() => orderedPages.value.slice(primaryCount.value));

/** 打包区标题只在「第一条被打包的项」前面出现一次 */
const showBundleHead = (index: number) => bundledPages.value.length > 0 && index === primaryCount.value;

const metaTitle = (item: PageVisitItem) =>
  `${item.last ? formatTime(item.last) : '暂无访问'} · 近 30 天 ${item.visits.toLocaleString('zh-CN')} 次`;

const formatAge = (seconds: number | null) => {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
};

const formatTime = (value: string) => {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
};

const syncCompact = () => {
  const width = listRef.value?.clientWidth || 0;
  const next = width > 0 && width < COMPACT_MAX_WIDTH;
  if (next !== compact.value) {
    compact.value = next;
    if (!next) bundleOpen.value = false;
  }
};

const startPolling = () => {
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(load, REFRESH_MS);
};

const stopPolling = () => {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
};

// 面板被 KeepAlive 挂起时停掉轮询，切回来再恢复（数据保留上次那份）
let mountedOnce = false;

onMounted(() => {
  load();
  startPolling();
  syncCompact();
  mountedOnce = true;
  if (listRef.value) {
    resizeObserver = new ResizeObserver(syncCompact);
    resizeObserver.observe(listRef.value);
  }
});

onActivated(() => {
  if (!mountedOnce) return;
  startPolling();
  // 挂起期间容器宽度可能变过，回来重新判断一次要不要打包展示
  syncCompact();
});

onDeactivated(stopPolling);

onBeforeUnmount(() => {
  stopPolling();
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.freshness-card {
  margin-top: 20px;
}

.freshness-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.freshness-title {
  font-size: 15px;
}

.freshness-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

/* 窄屏（内容区单列）：留几条进度条长的，其余按可用宽度打包成一路小卡片 */
.freshness-list.is-compact {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.freshness-list.is-compact .freshness-item {
  grid-column: 1 / -1;
}

.freshness-list.is-compact .freshness-item.is-bundled {
  grid-column: span 1;
  gap: 3px;
  padding: 6px 8px;
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
}

.freshness-list.is-compact .freshness-item.is-bundled .freshness-row {
  font-size: 12px;
  gap: 4px;
}

.freshness-list.is-compact .freshness-item.is-bundled .freshness-label {
  gap: 5px;
}

.freshness-list.is-compact .freshness-item.is-bundled .freshness-age {
  font-size: 11px;
}

.freshness-list.is-compact .freshness-item.is-bundled .freshness-bar {
  height: 3px;
}

/* 展开明细时，打包的项回到整行，好放得下时间与 30 天次数 */
.freshness-list.is-compact.is-open .freshness-item.is-bundled {
  grid-column: 1 / -1;
}

.freshness-bundle-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.freshness-bundle-title {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.freshness-bundle-toggle {
  margin-left: auto;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--el-color-primary);
  font-size: 12px;
  cursor: pointer;
}

.freshness-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.freshness-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.freshness-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--el-text-color-regular);
}

.freshness-label-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.freshness-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.freshness-dot.is-fresh { background-color: var(--el-color-success); }
.freshness-dot.is-aging { background-color: var(--el-color-warning); }
.freshness-dot.is-stale { background-color: var(--el-color-danger); }
.freshness-dot.is-neutral { background-color: var(--el-text-color-placeholder); }

.freshness-age {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.freshness-bar {
  height: 4px;
  border-radius: 999px;
  background-color: var(--el-fill-color);
  overflow: hidden;
}

.freshness-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.freshness-bar-fill.is-fresh { background-color: var(--el-color-success); }
.freshness-bar-fill.is-aging { background-color: var(--el-color-warning); }
.freshness-bar-fill.is-stale { background-color: var(--el-color-danger); }
.freshness-bar-fill.is-neutral { background-color: var(--el-border-color); }

.freshness-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: var(--el-text-color-placeholder);
}

.freshness-error {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--el-color-danger);
}
</style>
