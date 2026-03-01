<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 访客日志 </span>
      </template>
    </el-page-header>

    <div class="filter-toolbar mb-4">
      <el-select
        v-model="filterLocation"
        placeholder="筛选地区"
        style="width: 200px; margin-right: 10px"
        clearable
        filterable
        @change="onSearch"
        @clear="onSearch"
      >
        <el-option
          v-for="item in locationOptions"
          :key="item.name"
          :label="item.name + ' (' + item.count + ')'"
          :value="item.name"
        />
      </el-select>
      
      <el-select
        v-model="filterDevice"
        placeholder="筛选设备"
        style="width: 200px; margin-right: 10px"
        clearable
        filterable
        @change="onSearch"
        @clear="onSearch"
      >
        <el-option
          v-for="item in deviceOptions"
          :key="item.name"
          :label="item.name + ' (' + item.count + ')'"
          :value="item.name"
        />
      </el-select>

      <el-input
        v-model="filterPath"
        placeholder="搜索路径"
        style="width: 200px; margin-right: 10px"
        clearable
        @keyup.enter="onSearch"
        @clear="onSearch"
      />

      <el-button type="primary" :icon="Search" @click="onSearch">搜索</el-button>
      
      <div style="flex: 1"></div>
      
      <el-button 
        type="danger" 
        :icon="Delete" 
        :disabled="selectedIds.length === 0" 
        @click="handleDelete"
      >
        批量删除
      </el-button>
      <el-button v-if="embedded" type="success" :icon="Download" @click="exportCsv">导出 CSV</el-button>
    </div>

    <el-card class="mb-4" shadow="hover">
      <template #header>
        <div class="card-header card-header-tabs">
          <el-tabs v-model="activeTrendTab" class="trend-tabs">
            <el-tab-pane label="概览" name="overview" />
            <el-tab-pane label="行为类别" name="activity" />
            <el-tab-pane label="比较" name="compare" />
          </el-tabs>
        </div>
      </template>
      <div v-show="activeTrendTab === 'overview'" class="trend-panel">
        <div class="trend-title-bar">
          <div class="trend-title">访客趋势 · {{ trendLabel }}</div>
          <el-select v-model="trendRange" size="small" class="trend-select" @change="refreshTrend">
            <el-option
              v-for="range in trendRanges"
              :key="range.key"
              :label="range.label"
              :value="range.key"
            />
          </el-select>
        </div>
        <div ref="chartRef" class="chart-container"></div>
      </div>
      <div v-show="activeTrendTab === 'activity'" class="trend-panel">
        <el-table :data="activityItems" stripe style="width: 100%" v-loading="loading">
          <el-table-column prop="timestamp" label="时间" width="180" :formatter="formatTime" />
          <el-table-column prop="ip" label="IP" width="140" />
          <el-table-column prop="path" label="访问路径" min-width="200" show-overflow-tooltip :formatter="formatPath" />
          <el-table-column prop="location" label="地区" width="150" show-overflow-tooltip />
          <el-table-column prop="device" label="设备" show-overflow-tooltip />
        </el-table>
        <div class="pagination">
          <div v-if="isMobile" class="mobile-pagination-container">
            <div class="mobile-pagination-controls">
              <el-button size="small" :disabled="page <= 1" @click="onPageChange(1)">首页</el-button>
              <el-pagination
                small
                layout="prev, jumper, next"
                :page-size="pageSize"
                :total="total"
                :current-page="page"
                @current-change="onPageChange"
              />
              <el-button size="small" :disabled="page >= Math.ceil(total / pageSize)" @click="onPageChange(Math.ceil(total / pageSize))">尾页</el-button>
            </div>
          </div>
          <el-pagination
            v-else
            background
            layout="total, prev, pager, next"
            :page-size="pageSize"
            :total="total"
            :current-page="page"
            @current-change="onPageChange"
          />
        </div>
      </div>
      <div v-show="activeTrendTab === 'compare'" class="trend-panel">
        <div class="compare-toolbar">
          <el-button size="small">筛选器</el-button>
          <div class="compare-toolbar-right">
            <el-select v-model="compareLeftRange" size="small" @change="loadCompare">
              <el-option
                v-for="range in trendRanges"
                :key="range.key"
                :label="range.label"
                :value="range.key"
              />
            </el-select>
            <span class="compare-vs">VS</span>
            <el-select v-model="compareRightRange" size="small" @change="loadCompare">
              <el-option
                v-for="range in trendRanges"
                :key="range.key"
                :label="range.label"
                :value="range.key"
              />
            </el-select>
          </div>
        </div>
        <div class="compare-metrics">
          <div v-for="metric in compareMetrics" :key="metric.key" class="compare-metric-card">
            <div class="compare-metric-label">{{ metric.label }}</div>
            <div class="compare-metric-value">{{ metric.valueText }}</div>
            <div class="compare-metric-change" :class="metric.changeClass">{{ metric.deltaText }}</div>
          </div>
        </div>
        <div class="compare-chart-title">趋势对比 · {{ compareLeftLabel }} vs {{ compareRightLabel }}</div>
        <div ref="compareChartRef" class="chart-container compare-chart"></div>
      </div>
    </el-card>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { getVisitorStats, getVisitorTrend, exportVisitors, batchDeleteVisitors, type Visitor } from '../../services/admin';
import { Download, Delete, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as echarts from 'echarts';

import { onWS } from '../../services/ws';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<Visitor[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const chartRef = ref<HTMLElement | null>(null);
const compareChartRef = ref<HTMLElement | null>(null);
const activeTrendTab = ref<'overview' | 'activity' | 'compare'>('overview');
const trendRanges = [
  { key: 'last_24h', label: '最近24小时', days: 1 },
  { key: 'today', label: '今天', days: 1 },
  { key: 'this_week', label: '本周', days: 7 },
  { key: 'last_7', label: '最近7天', days: 7 },
  { key: 'this_month', label: '本月', days: 30 },
  { key: 'last_30', label: '最近30天', days: 30 },
  { key: 'last_90', label: '最近90天', days: 90 },
  { key: 'last_180', label: '最近180天', days: 180 }
];
const trendRange = ref('last_30');
const compareLeftRange = ref('last_7');
const compareRightRange = ref('last_30');
const compareLeftStats = ref({ visits: 0, uniqueIps: 0 });
const compareRightStats = ref({ visits: 0, uniqueIps: 0 });
const compareLeftTrend = ref<Array<{ date: string; count: number; unique_ip: number }>>([]);
const compareRightTrend = ref<Array<{ date: string; count: number; unique_ip: number }>>([]);
const filterLocation = ref('');
const filterDevice = ref('');
const filterPath = ref('');
const locationOptions = ref<{name: string, count: number}[]>([]);
const deviceOptions = ref<{name: string, count: number}[]>([]);
const selectedIds = ref<number[]>([]);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
let unbindWS: (() => void) | null = null;
const trendLabel = computed(() => trendRanges.find(r => r.key === trendRange.value)?.label || '最近30天');
const compareLeftLabel = computed(() => trendRanges.find(r => r.key === compareLeftRange.value)?.label || '');
const compareRightLabel = computed(() => trendRanges.find(r => r.key === compareRightRange.value)?.label || '');
const activityItems = computed(() => items.value);
const trendDays = computed(() => trendRanges.find(r => r.key === trendRange.value)?.days || 30);
const compareMetrics = computed(() => {
  const left = compareLeftStats.value;
  const right = compareRightStats.value;
  const delta = (a: number, b: number) => {
    if (!b) return null;
    return ((a - b) / b) * 100;
  };
  const buildMetric = (key: string, label: string, value: number | null, changeBase: number | null) => {
    const deltaValue = value === null || changeBase === null ? null : delta(value, changeBase);
    const deltaText = deltaValue === null ? '—' : `${deltaValue >= 0 ? '+' : ''}${Math.round(deltaValue)}%`;
    return {
      key,
      label,
      valueText: value === null ? '—' : value.toLocaleString(),
      deltaText,
      changeClass: deltaValue === null ? 'is-muted' : deltaValue >= 0 ? 'is-up' : 'is-down'
    };
  };
  return [
    buildMetric('visitors', '访客', left.uniqueIps, right.uniqueIps),
    buildMetric('visits', '访问次数', left.visits, right.visits),
    buildMetric('pageviews', '浏览量', left.visits, right.visits),
    buildMetric('bounce', '跳出率', null, null),
    buildMetric('duration', '平均访问时长', null, null)
  ];
});

onMounted(() => {
  window.addEventListener('resize', checkMobile);
  fetchList();
  refreshTrend();
  
  // Real-time updates via WebSocket
  unbindWS = onWS((type: string, payload: any) => {
    if (type === 'visitors:new') {
      // If we are on the first page and no filters are active, prepend the new visitor
      const hasFilters = filterLocation.value || filterDevice.value || filterPath.value;
      if (page.value === 1 && !hasFilters) {
        items.value.unshift(payload);
        total.value++;
        if (items.value.length > pageSize.value) {
          items.value.pop();
        }
      } else if (!hasFilters) {
        // Just increment total if on other pages
        total.value++;
      }
    }
  });
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
  if (unbindWS) unbindWS();
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  if (compareChartInstance) {
    compareChartInstance.dispose();
    compareChartInstance = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (compareResizeObserver) {
    compareResizeObserver.disconnect();
    compareResizeObserver = null;
  }
});

let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let compareChartInstance: echarts.ECharts | null = null;
let compareResizeObserver: ResizeObserver | null = null;

const fetchList = async () => {
  loading.value = true;
  try {
    const data = await getVisitorStats(page.value, pageSize.value, {
      location: filterLocation.value,
      device: filterDevice.value,
      path: filterPath.value
    });
    items.value = data.visitors;
    total.value = data.total;
    
    // Update options only if we don't have them or if we want to refresh counts (optional)
    // Here we always update them to reflect latest stats
    if (data.locationStats) locationOptions.value = data.locationStats;
    if (data.deviceStats) deviceOptions.value = data.deviceStats;
  } finally {
    loading.value = false;
  }
};

const onSearch = () => {
  page.value = 1;
  fetchList();
};

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};

const handleDelete = async () => {
  if (selectedIds.value.length === 0) return;
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedIds.value.length} 条记录吗？`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    
    await batchDeleteVisitors(selectedIds.value);
    ElMessage.success('删除成功');
    fetchList();
    selectedIds.value = [];
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
};

const refreshTrend = async () => {
  await updateChart(trendDays.value);
};

const updateChart = async (days: number) => {
  if (!chartRef.value) return;
  
  const trend = await getVisitorTrend(days);
  
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }
  
  const dates = trend.map(t => t.date);
  const counts = trend.map(t => t.count);
  const uniqueIps = trend.map(t => t.unique_ip);

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['访问量', '独立IP']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { rotate: 45 }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: '访问量',
        type: 'line',
        smooth: true,
        data: counts,
        itemStyle: { color: '#409EFF' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(64,158,255,0.5)' },
            { offset: 1, color: 'rgba(64,158,255,0.1)' }
          ])
        }
      },
      {
        name: '独立IP',
        type: 'line',
        smooth: true,
        data: uniqueIps,
        itemStyle: { color: '#67C23A' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(103,194,58,0.5)' },
            { offset: 1, color: 'rgba(103,194,58,0.1)' }
          ])
        }
      }
    ]
  };
  
  chartInstance.setOption(option);

  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(chartRef.value);
  }
};

const sumTrend = (trend: Array<{ count: number; unique_ip: number }>) => {
  return trend.reduce(
    (acc, item) => {
      acc.visits += item.count || 0;
      acc.uniqueIps += item.unique_ip || 0;
      return acc;
    },
    { visits: 0, uniqueIps: 0 }
  );
};

const updateCompareChart = (leftTrend: Array<{ date: string; count: number }>, rightTrend: Array<{ date: string; count: number }>) => {
  if (!compareChartRef.value) return;
  if (!compareChartInstance) {
    compareChartInstance = echarts.init(compareChartRef.value);
  }
  const labels = leftTrend.map(item => item.date);
  const leftCounts = leftTrend.map(item => item.count);
  const rightCounts = labels.map((_, idx) => rightTrend[idx]?.count ?? null);
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: [compareLeftLabel.value, compareRightLabel.value]
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { rotate: 45 }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: compareLeftLabel.value,
        type: 'bar',
        data: leftCounts,
        itemStyle: { color: '#4C9BFF' }
      },
      {
        name: compareRightLabel.value,
        type: 'line',
        smooth: true,
        data: rightCounts,
        itemStyle: { color: '#B86BFF' }
      }
    ]
  };
  compareChartInstance.setOption(option);
  if (!compareResizeObserver) {
    compareResizeObserver = new ResizeObserver(() => {
      compareChartInstance?.resize();
    });
    compareResizeObserver.observe(compareChartRef.value);
  }
};

const loadCompare = async () => {
  const leftDays = trendRanges.find(r => r.key === compareLeftRange.value)?.days || 7;
  const rightDays = trendRanges.find(r => r.key === compareRightRange.value)?.days || 30;
  const [leftTrend, rightTrend] = await Promise.all([
    getVisitorTrend(leftDays),
    getVisitorTrend(rightDays)
  ]);
  compareLeftTrend.value = leftTrend;
  compareRightTrend.value = rightTrend;
  compareLeftStats.value = sumTrend(leftTrend);
  compareRightStats.value = sumTrend(rightTrend);
  updateCompareChart(leftTrend, rightTrend);
};

watch(activeTrendTab, async (val) => {
  if (val === 'overview') {
    await refreshTrend();
    nextTick(() => chartInstance?.resize());
  }
  if (val === 'compare') {
    await loadCompare();
    nextTick(() => compareChartInstance?.resize());
  }
});

const formatTime = (_row: any, _col: any, val: string) => {
  if (!val) return '';
  // Try to parse as UTC if it doesn't have timezone info
  const date = new Date(val.endsWith('Z') ? val : val + 'Z');
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const formatPath = (_row: any, _col: any, val: string) => {
  if (!val) return '';
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
};

const goBack = () => {
  router.push('/');
};

const exportCsv = async () => {
  try {
    await exportVisitors();
  } catch (error) {
    ElMessage.error('导出失败');
  }
};

// onMounted moved to top
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.pagination { margin-top: 20px; display: flex; justify-content: flex-end; }
.chart-container { width: 100%; height: 300px; }
.filter-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.card-header-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.trend-tabs {
  flex: 1;
}
.trend-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.trend-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.trend-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.trend-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.compare-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.compare-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.compare-vs {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.compare-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.compare-metric-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compare-metric-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.compare-metric-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.compare-metric-change {
  font-size: 12px;
  font-weight: 600;
}
.compare-metric-change.is-up {
  color: var(--el-color-success);
}
.compare-metric-change.is-down {
  color: var(--el-color-danger);
}
.compare-metric-change.is-muted {
  color: var(--el-text-color-secondary);
}
.compare-chart-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.compare-chart {
  height: 320px;
}

.mobile-pagination-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex-wrap: wrap;
}
.mobile-pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (max-width: 768px) {
  .pagination {
    justify-content: center;
    padding: 10px 0;
  }
}
</style>
