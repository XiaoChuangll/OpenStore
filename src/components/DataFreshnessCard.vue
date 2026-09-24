<template>
  <el-card class="freshness-card" shadow="hover" v-loading="loading">
    <template #header>
      <div class="freshness-header">
        <span class="freshness-title">数据新鲜度</span>
        <span class="freshness-hint">按前台页面统计最近访问 · 越久没人访问越红</span>
      </div>
    </template>

    <div class="freshness-list">
      <div v-for="item in pages" :key="item.key" class="freshness-item">
        <div class="freshness-row">
          <span class="freshness-label">
            <span class="freshness-dot" :class="statusClass(item)"></span>
            {{ item.label }}
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
        <div class="freshness-meta">
          <span>{{ item.last ? formatTime(item.last) : '暂无访问' }}</span>
          <span>近 30 天 {{ item.visits.toLocaleString('zh-CN') }} 次</span>
        </div>
      </div>
    </div>

    <p v-if="error" class="freshness-error">{{ error }}</p>
  </el-card>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { getFreshnessOverview, type FreshnessItem, type PageVisitItem } from '../services/admin';

const REFRESH_MS = 60000;

const items = ref<FreshnessItem[]>([]);
const pages = ref<PageVisitItem[]>([]);
const loading = ref(false);
const error = ref('');
let timer: number | null = null;

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
const barWidth = (item: PageVisitItem) => {
  const max = Math.max(1, ...pages.value.map((page) => page.visits));
  return `${Math.max(4, Math.round((item.visits / max) * 100))}%`;
};

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

onMounted(() => {
  load();
  timer = window.setInterval(load, REFRESH_MS);
});
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
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

.freshness-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.freshness-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
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
  color: var(--el-text-color-regular);
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
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
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
