<template>
  <el-card class="chart-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span
            class="card-title"
            :class="{ 'title-link': route.path !== '/rank/category' }"
            @click="goToRank"
          >分类增长排行</span>
          <el-select v-model="days" size="small" :style="{ width: selectWidthOf(DAY_LABELS) }" @change="fetchData">
            <el-option label="最近 7 天" :value="7" />
            <el-option label="最近 14 天" :value="14" />
            <el-option label="最近 30 天" :value="30" />
          </el-select>
          <el-select v-model="limit" size="small" :style="{ width: selectWidthOf(LIMIT_LABELS) }" @change="renderChart">
            <el-option label="Top 10" :value="10" />
            <el-option label="Top 20" :value="20" />
            <el-option label="Top 30" :value="30" />
          </el-select>
        </div>
        <div class="controls">
          <!-- 图表 / 排名条 切换 -->
          <el-tooltip :content="viewMode === 'list' ? '切换为图表' : '切换为排名条'" placement="top">
            <el-button
              size="small"
              class="view-toggle"
              :icon="viewMode === 'list' ? TrendCharts : List"
              @click="toggleView"
            />
          </el-tooltip>
        </div>
      </div>
    </template>

    <div v-if="viewMode === 'chart'" ref="chartRef" class="chart-box"></div>
    <RankBarList v-else :rows="listRows" :loading="loading" tone="success" @select="openCategory" />
  </el-card>
</template>

<script setup lang="ts">
/**
 * 分类增长排行：上游按「大分类」聚合窗口内的下载增量。
 *
 * 榜单里的名额有限，看不到「哪个赛道在涨」；这张卡补的就是这个视角。
 * 数值用增量排行，副信息给这个分类里有多少应用在涨（增长面）——
 * 一个只有几条应用的分类型增量和「工具」这种大盘子放一起比大小没意义，
 * 增长面能直接看出是真的在普涨还是被个别应用拉起来的。
 */
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { TrendCharts, List, Connection } from '@element-plus/icons-vue';
import RankBarList from './RankBarList.vue';
import { getCategoryGrowthRanking, mergeCategoryGrowth, type CategoryGrowthItem } from '../services/next-api';
import { selectWidthOf } from '../utils/select-width';
import { CATEGORY_ICON_MAP } from '../utils/category-icons';

const DAY_LABELS = ['最近 7 天', '最近 14 天', '最近 30 天'];
const LIMIT_LABELS = ['Top 10', 'Top 20', 'Top 30'];
/** 少于这么多应用的分类不进榜：上游有一堆只有一两个应用的脏分类 */
const MIN_APPS = 50;

const router = useRouter();
const route = useRoute();

const days = ref(7);
const limit = ref(20);
const loading = ref(false);
const rows = ref<CategoryGrowthItem[]>([]);

/* 展示方式：chart（柱状图）/ list（横向排名条） */
const viewMode = ref<'list' | 'chart'>('chart');
const toggleView = () => {
  viewMode.value = viewMode.value === 'list' ? 'chart' : 'list';
};

const chartRef = ref<HTMLElement | null>(null);
let chart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedEl: HTMLElement | null = null;

const formatCompact = (value: number) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString();
};

const visibleRows = computed(() => rows.value.slice(0, limit.value));

const listRows = computed(() =>
  visibleRows.value.map((item) => ({
    key: item.kind_name,
    name: item.kind_name,
    // 图标沿用 /apps 分类页那套；没收录的分类退回通用图标，和分类页的兜底一致
    iconComponent: CATEGORY_ICON_MAP[item.kind_name] || Connection,
    value: Number(item.downloads_increase) || 0,
    sub: `${formatCompact(Number(item.app_count) || 0)} 个应用 · ${Math.round(Number(item.growing_app_pct) || 0)}% 在涨`
  }))
);

const openCategory = (row: { name?: string }) => {
  if (!row?.name) return;
  router.push({ path: '/apps', query: { category: row.name } });
};

const goToRank = () => {
  if (route.path !== '/rank/category') router.push('/rank/category');
};

const renderChart = () => {
  nextTick(() => {
    const el = chartRef.value;
    // 容器还没量出尺寸就先别建实例（懒加载页签挂载那一瞬间宽度是 0）
    if (viewMode.value !== 'chart' || !el || !el.clientWidth || !el.clientHeight) return;
    if (!chart) chart = echarts.init(el);

    const data = visibleRows.value;
    const names = data.map((item) => item.kind_name);
    const values = data.map((item) => Number(item.downloads_increase) || 0);

    chart.setOption(
      {
        /*
         * 分类「横着并排」摆在横轴上（竖柱状图），和站内其它榜单图表同一套：
         * 固定高度 + 旋转 45° 的分类名 + 底部数据缩放条。
         * 之前是每个分类占一行竖着堆下去，20 条就把卡片撑到 576px 高。
         */
        grid: { left: '3%', right: '4%', top: '12%', bottom: '15%', containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          confine: true,
          textStyle: { fontSize: 12 },
          formatter: (params: any) => {
            const list = Array.isArray(params) ? params : [params];
            const name = list[0]?.name ?? '';
            const item = data.find((row) => row.kind_name === name);
            if (!item) return name;
            const pct = Math.round(Number(item.growing_app_pct) || 0);
            return [
              `<strong>${name}</strong>`,
              `增量：${formatCompact(Number(item.downloads_increase) || 0)}`,
              `应用数：${formatCompact(Number(item.app_count) || 0)}`,
              `在涨：${formatCompact(Number(item.growing_apps) || 0)} 个（${pct}%）`,
              `人均增量：${formatCompact(Number(item.avg_increase_per_app) || 0)}`
            ].join('<br/>');
          }
        },
        dataZoom: [
          {
            type: 'slider',
            show: true,
            xAxisIndex: [0],
            startValue: 0,
            endValue: 9,
            bottom: '2%'
          },
          {
            type: 'inside',
            xAxisIndex: [0],
            startValue: 0,
            endValue: 9
          }
        ],
        xAxis: {
          type: 'category',
          data: names,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { interval: 0, rotate: 45, fontSize: 11, color: '#94a3b8' }
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { opacity: 0.15 } },
          axisLabel: { fontSize: 10, color: '#94a3b8', formatter: (v: number) => formatCompact(v) }
        },
        series: [
          {
            type: 'bar',
            data: values,
            barWidth: '40%',
            itemStyle: { color: '#61DDAA', borderRadius: [4, 4, 0, 0] }
          }
        ]
      },
      true
    );
  });
};

const ensureResizeObserver = () => {
  const el = chartRef.value;
  if (!el || el === observedEl) return;
  resizeObserver?.disconnect();
  if (!resizeObserver) resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(el);
  observedEl = el;
};

const handleResize = () => {
  const el = chartRef.value;
  if (viewMode.value !== 'chart' || !el || !el.clientWidth || !el.clientHeight) return;
  // 建实例时容器还没尺寸的，这里补建
  if (!chart) {
    renderChart();
    return;
  }
  chart.resize();
};

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await getCategoryGrowthRanking({
      days: days.value,
      limit: 300,
      minApps: MIN_APPS
    });
    // 上游同一分类名可能对应多个 kind_id，合并成一条再排
    rows.value = mergeCategoryGrowth(res?.data || []);
    renderChart();
  } catch (error) {
    console.error('Failed to build category growth rank:', error);
    rows.value = [];
    renderChart();
  } finally {
    loading.value = false;
  }
};

watch(viewMode, async (mode) => {
  if (mode === 'chart') {
    await nextTick();
    renderChart();
    ensureResizeObserver();
  } else {
    chart?.dispose();
    chart = null;
  }
});

onMounted(() => {
  fetchData();
  ensureResizeObserver();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  observedEl = null;
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  height: 32px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.title-link {
  cursor: pointer;
  transition: color 0.2s ease;
}

.title-link:hover {
  color: var(--el-color-primary);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.view-toggle {
  width: 24px;
  height: 24px;
  padding: 0;
}

.chart-box {
  width: 100%;
  min-height: 300px;
}

@media (max-width: 768px) {
  /*
   * 窄屏两行：标题 + 切换按钮一行，两个下拉整行落到第二行。
   * 和「非华为应用下载榜」卡片同一套排法。
   */
  .card-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 8px;
    row-gap: 6px;
    height: auto;
  }
  .header-left {
    display: contents;
  }
  .card-title {
    grid-area: 1 / 1 / 2 / 2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .controls {
    grid-area: 1 / 2 / 2 / 3;
    justify-self: end;
  }
  .header-left :deep(.el-select) {
    grid-row: 2;
  }
}
</style>
