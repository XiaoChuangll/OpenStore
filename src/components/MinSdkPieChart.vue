<template>
  <el-card class="chart-card" shadow="hover" :body-style="{ padding: 0 }">
    <template #header>
      <div class="card-header" @click="toggleCollapse">
        <span class="card-title">应用最小SDK分布</span>
        <div class="header-side">
          <span v-if="topName" class="avg-chip">最多 {{ topName }}</span>
          <el-icon class="collapse-icon" :class="{ 'is-collapsed': isCollapsed }">
            <ArrowDown />
          </el-icon>
        </div>
      </div>
    </template>

    <div class="collapsible-wrapper" :class="{ 'is-collapsed': isCollapsed }">
      <div v-if="rows.length" class="chart-body">
        <div class="donut-wrap">
          <div ref="chartRef" class="donut"></div>
          <div class="donut-center">
            <template v-if="activeRow">
              <span class="center-name">{{ activeRow.name }}</span>
              <strong>{{ activeRow.count.toLocaleString() }}</strong>
              <span class="center-sub">{{ activeRow.percentText }}</span>
            </template>
            <template v-else>
              <strong>{{ totalText }}</strong>
              <span>个应用</span>
            </template>
          </div>
        </div>

        <ul class="legend">
          <li
            v-for="row in rows"
            :key="row.name"
            class="legend-row"
            :class="{ 'is-active': activeIndex === row.index }"
            @mouseenter="setActive(row.index)"
            @mouseleave="setActive(-1)"
          >
            <span class="legend-name" :style="{ color: row.color }">{{ row.name }}</span>
            <span class="legend-bar">
              <i :style="{ width: row.barWidth, background: row.color }"></i>
            </span>
            <span class="legend-count">{{ row.count.toLocaleString() }}</span>
            <span class="legend-percent">{{ row.percentText }}</span>
          </li>
        </ul>
      </div>

      <!-- 数据加载中：骨架的尺寸和图表的 chart-body 对齐，出现时不产生位移 -->
      <el-skeleton v-else-if="loading" animated>
        <template #template>
          <div class="skeleton-chart-body">
            <el-skeleton-item variant="circle" class="skeleton-donut" />
            <div class="skeleton-legend">
              <el-skeleton-item variant="text" v-for="i in 5" :key="i" class="skeleton-legend-row" />
            </div>
          </div>
        </template>
      </el-skeleton>
      <el-empty v-else description="暂无 SDK 数据" :image-size="60" class="chart-empty" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { hmApi } from '../services/hm-api';
import { buildSdkRows, type SdkRow } from '../utils/sdk-distribution';

const chartRef = ref<HTMLElement | null>(null);
const isCollapsed = ref(false);
const rows = ref<SdkRow[]>([]);
/** 首屏数据还没回来：先渲染同高的骨架，避免图表出现时把下面的内容顶下去（CLS） */
const loading = ref(true);
const total = ref(0);
const activeIndex = ref(-1);
let chartInstance: echarts.ECharts | null = null;

const topName = computed(() => (rows.value.length && rows.value[0].name !== '其他' ? rows.value[0].name : ''));
const totalText = computed(() =>
  total.value >= 10000 ? `${(total.value / 10000).toFixed(1)}万` : total.value.toLocaleString()
);

/** 悬停/选中某个扇区时，圆心显示该扇区的信息；否则显示总数 */
const activeRow = computed(() =>
  activeIndex.value >= 0 ? rows.value[activeIndex.value] || null : null
);

const checkMobile = () => {
  if (window.innerWidth <= 768) {
    isCollapsed.value = true;
  }
};

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
  if (!isCollapsed.value) {
    setTimeout(() => chartInstance?.resize(), 350);
  }
};

const setActive = (index: number) => {
  activeIndex.value = index;
  if (!chartInstance) return;
  chartInstance.dispatchAction({ type: 'downplay', seriesIndex: 0 });
  if (index >= 0) {
    chartInstance.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: index });
  }
};

const initChart = async (data: any[]) => {
  const built = buildSdkRows(data);
  rows.value = built.rows;
  total.value = built.total;

  if (!built.total) {
    chartInstance?.dispose();
    chartInstance = null;
    return;
  }

  // 容器是 v-if 出来的，等这一帧渲染完再初始化图表
  await nextTick();
  if (!chartRef.value) return;

  chartInstance?.dispose();
  chartInstance = echarts.init(chartRef.value);
  chartInstance.setOption({
    tooltip: {
      trigger: 'item',
      // 卡片为了折叠动画设了 overflow: hidden，tooltip 挂在容器里会被裁掉，
      // 挂到 body 上才能正常浮在卡片之上
      appendTo: 'body',
      backgroundColor: 'rgba(20, 24, 33, 0.94)',
      borderColor: 'rgba(255, 255, 255, 0.14)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#e8ebf0', fontSize: 12.5 },
      extraCssText:
        'border-radius: 10px; box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px);',
      formatter: (params: any) =>
        `${params.name}<br/>${Number(params.value).toLocaleString()} 个应用 · ${params.percent}%`
    },
    series: [
      {
        name: '最小 SDK',
        type: 'pie',
        radius: ['64%', '88%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderWidth: 2,
          borderColor: 'transparent'
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 14, shadowColor: 'rgba(15, 23, 42, 0.35)' }
        },
        data: rows.value.map((row) => ({
          value: row.count,
          name: row.name,
          itemStyle: { color: row.color }
        }))
      }
    ]
  });

  chartInstance.on('mouseover', (params: any) => {
    activeIndex.value = Number(params.dataIndex);
  });
  chartInstance.on('mouseout', () => {
    activeIndex.value = -1;
  });
};

const fetchData = async () => {
  try {
    const response = await hmApi.post<any>('/charts/min_sdk', null);
    initChart(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error('Failed to fetch min SDK distribution:', error);
  } finally {
    loading.value = false;
  }
};

const handleResize = () => {
  chartInstance?.resize();
};

onMounted(() => {
  checkMobile();
  fetchData();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
});
</script>

<style scoped>
.chart-card {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

:deep(.el-card__header) {
  padding: 0;
}

:deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.card-header {
  /* 三张卡片头部等高：标题换行与否都不影响下方图表对齐 */
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
}

.card-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-side {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avg-chip {
  padding: 1px 9px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background: var(--el-fill-color-light);
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.collapse-icon {
  color: var(--el-text-color-secondary);
  transition: transform 0.3s;
}

.collapse-icon.is-collapsed {
  transform: rotate(-90deg);
}

.collapsible-wrapper {
  flex: 1;
  container-type: inline-size;
  transition: all 0.3s ease-in-out;
  max-height: 520px;
  opacity: 1;
  overflow: hidden;
}

.collapsible-wrapper.is-collapsed {
  max-height: 0;
  opacity: 0;
}

.chart-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 2px 16px 14px;
}

/* 骨架：和图表的 chart-body 同高，数据到达时不会引起位移 */
.skeleton-chart-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-height: 284px;
  padding: 2px 16px 14px;
}
.skeleton-donut {
  width: 140px !important;
  height: 140px !important;
  flex-shrink: 0;
}
.skeleton-legend {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.skeleton-legend-row {
  width: 100% !important;
  height: 14px !important;
}

.donut-wrap {
  position: relative;
  align-self: center;
  width: 100%;
  max-width: 160px;
}

.donut {
  width: 100%;
  height: 140px;
}

.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}

.donut-center strong {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.donut-center span {
  font-size: 10.5px;
  color: var(--el-text-color-placeholder);
}

.donut-center .center-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.donut-center .center-sub {
  font-size: 10.5px;
  color: var(--el-text-color-placeholder);
}

.legend {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.legend-row {
  display: grid;
  grid-template-columns: 62px 1fr auto auto;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border-radius: 8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.16s ease;
}

.legend-row.is-active {
  background: var(--el-fill-color-light);
}

.legend-name {
  font-weight: 600;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.legend-bar {
  position: relative;
  height: 5px;
  border-radius: 999px;
  background: var(--el-fill-color);
  overflow: hidden;
}

.legend-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.legend-count {
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.legend-percent {
  min-width: 38px;
  text-align: right;
  color: var(--el-text-color-placeholder);
}

.chart-empty {
  padding: 6px 0 18px;
}

@container (min-width: 430px) {
  .chart-body {
    flex-direction: row;
    align-items: center;
    gap: 18px;
  }

  .donut-wrap {
    flex: 0 0 40%;
    align-self: center;
  }
}
</style>
