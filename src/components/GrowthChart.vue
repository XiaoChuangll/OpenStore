<template>
  <el-card class="chart-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span class="card-title" :class="{ 'title-link': route.path !== '/rank/growth' }" @click="goToRank">应用下载增长对比</span>
          <el-select v-model="pageSize" size="small" :style="{ width: selectWidthOf(PAGE_SIZE_LABELS) }" @change="fetchData">
            <el-option label="10条" :value="10" />
            <el-option label="20条" :value="20" />
            <el-option label="30条" :value="30" />
            <el-option label="50条" :value="50" />
          </el-select>
        </div>
        <div class="controls">
          <el-select v-model="timeRange" size="small" class="time-select" :style="{ width: selectWidthOf(TIME_LABELS) }" @change="fetchData">
            <el-option label="最近1天" :value="1" />
            <el-option label="最近7天" :value="7" />
            <el-option label="最近30天" :value="30" />
          </el-select>
          <el-select v-model="metricType" size="small" class="metric-select" :style="{ width: selectWidthOf(METRIC_LABELS) }" @change="updateChart">
            <el-option label="下载增长量" value="increase" />
            <el-option label="增长前下载量" value="prior" />
            <el-option label="增长后下载量" value="current" />
          </el-select>
          <!-- 图表 / 排名条 切换，选择记在本地，默认图表 -->
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
    <RankBarList v-else :rows="listRows" :tone="listTone" @select="openApp" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { TrendCharts, List } from '@element-plus/icons-vue';
import RankBarList from './RankBarList.vue';
import { hmApi } from '../services/hm-api';
import { selectWidthOf } from '../utils/select-width';

/** 下拉框宽度按「最长的那条选项」算，避免选中长文案时被截断 / 短文案时留白过多 */
const PAGE_SIZE_LABELS = ['10条', '20条', '30条', '50条'];
const TIME_LABELS = ['最近1天', '最近7天', '最近30天'];
const METRIC_LABELS = ['下载增长量', '增长前下载量', '增长后下载量'];

const router = useRouter();
const route = useRoute();
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const timeRange = ref(30);
const pageSize = ref(30);
const metricType = ref('increase');
const chartData = ref<any[]>([]);
const excludedPkgs = new Set<string>(['com.leisu.yuan']);

/* 展示方式：chart（每次进页面都从图表开始）/ list（横向排名条） */
const viewMode = ref<'list' | 'chart'>('chart');
const toggleView = () => {
  viewMode.value = viewMode.value === 'list' ? 'chart' : 'list';
  if (viewMode.value === 'chart') initChart();
};

/** 排名条用的当前指标（跟图表上方那个下拉同一份数据） */
const listMetric = computed(() => {
  if (metricType.value === 'prior') return { key: 'prior' as const, color: '#fac858', tone: 'warning' as const };
  if (metricType.value === 'current') return { key: 'current' as const, color: '#5470c6', tone: 'primary' as const };
  return { key: 'increase' as const, color: '#91CC75', tone: 'success' as const };
});

const metricValueOf = (item: any) => {
  if (listMetric.value.key === 'prior') return item.prior_download_count || 0;
  if (listMetric.value.key === 'current') return item.current_download_count || item.download_count || 0;
  return item.download_increment || item.increase || 0;
};

const formatCount = (value: number) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
};

const listTone = computed(() => listMetric.value.tone);

const listRows = computed(() =>
  chartData.value
    .map((item: any) => ({
      key: item.pkg_name || item.name || item.app?.name,
      name: item.name || item.app?.name || '未知应用',
      icon: item.icon_url,
      value: metricValueOf(item) as number,
      // 小字用"增长量"做参照：看图时最关心的就是这批应用涨了多少
      sub:
        listMetric.value.key === 'increase'
          ? `共 ${formatCount(item.current_download_count || item.download_count || 0)}`
          : `+${formatCount(item.download_increment || item.increase || 0)}`,
      app_id: item.app_id
    }))
    .sort((a, b) => b.value - a.value)
);

const openApp = (row: { app_id?: string }) => {
  if (row?.app_id) router.push({ name: 'app-dashboard', query: { app_id: row.app_id } });
};

const goToRank = () => {
  if (route.path !== '/rank/growth') {
    router.push('/rank/growth');
  }
};

const initChart = () => {
  // 切到排名条时图表容器被销毁，切回来要重建实例
  if (viewMode.value !== 'chart' || !chartRef.value) return;
  
  // Initialize chart if not exists
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  // If no data, show empty chart or loading
  if (!chartData.value.length) {
    chartInstance.clear();
    return;
  }
  
  const data = chartData.value;
  const names = data.map(item => item.name || item.app?.name || 'Unknown');
  
  let values: number[] = [];
  let seriesName = '';
  let color = '';

  if (metricType.value === 'increase') {
    values = data.map(item => item.download_increment || item.increase || 0);
    seriesName = '增长量';
    color = '#91CC75';
  } else if (metricType.value === 'prior') {
    values = data.map(item => item.prior_download_count || 0);
    seriesName = '增长前下载量';
    color = '#fac858';
  } else {
    values = data.map(item => item.current_download_count || 0);
    seriesName = '增长后下载量';
    color = '#5470c6';
  }

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '15%',
      containLabel: true
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
      axisLabel: {
        interval: 0,
        rotate: 45
      }
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: seriesName,
        type: 'bar',
        data: values,
        itemStyle: {
          color: color
        },
        barWidth: '40%'
      },
      {
        name: '图标',
        type: 'pictorialBar',
        symbolPosition: 'end',
        symbolSize: [30, 30],
        symbolOffset: [0, -20],
        z: 10,
        tooltip: { show: false },
        data: data.map((item, index) => ({
          value: values[index],
          symbol: item.icon_url ? 'image://' + item.icon_url : 'circle' 
        })),
        label: {
          show: false,
          position: 'top',
          distance: 5,
          formatter: function(params: any) {
             const val = params.value;
             if (val === undefined || val === null) return '';
             if (val > 100000000) return (val / 100000000).toFixed(1) + '亿';
             if (val > 10000) return (val / 10000).toFixed(0) + 'w';
             return val;
          },
          fontWeight: 'bold'
        }
      }
    ]
  };

  chartInstance.setOption(option, true); // Use true to not merge with previous options

  chartInstance.on('click', (params) => {
    const item = chartData.value[params.dataIndex];
    if (item && item.app_id) {
      router.push({ name: 'app-dashboard', query: { app_id: item.app_id } });
    }
  });
};

const updateChart = () => {
  initChart();
};

const fetchData = async () => {
  try {
    let apps = [];
    try {
      const response = await hmApi.get<any>('/rankings/download_increase', {
        limit: pageSize.value,
        days: timeRange.value
      });
      apps = (response.data || []).filter((item: any) => {
        const pkg = item?.pkg_name || item?.app?.pkg_name || '';
        return !excludedPkgs.has(String(pkg));
      });
    } catch (e) {
      console.warn('Failed to fetch growth data, falling back to apps/list');
    }

    // Fallback if no data
    if (apps.length === 0) {
      const listResponse = await hmApi.get<any>('/apps/list/1', {
        page_size: 30,
        sort: 'download_count',
        desc: true,
        // 兜底列表要按下载量排序/展示，必须完整信息
        detail: true
      });
      // Adapt list data to growth data structure
      apps = (listResponse.data?.data || [])
        .filter((item: any) => {
          const pkg = item?.pkg_name || '';
          return !excludedPkgs.has(String(pkg));
        })
        .map((item: any) => ({
        ...item,
        current_download_count: item.download_count,
        prior_download_count: item.download_count,
        download_increment: 0,
        increase: 0
      }));
    }
    
    const topApps = apps.slice(0, 30);

    // Fetch details for icons
    const appsWithIcons = await Promise.all(topApps.map(async (item: any) => {
      try {
        if (item.pkg_name) {
           const detailRes = await hmApi.get<any>('/apps/list/1', {
             search_key: 'pkg_name',
             search_value: item.pkg_name,
             search_exact: true,
             page_size: 1,
             // 这里只是为了拿图标/ app_id，用简略信息就够了（完整信息一条要 4.5KB，这里最多 30 条）
             detail: false
           });
           const detail = detailRes.data?.data?.[0];
           if (detail) {
             return { 
               ...item, 
               icon_url: detail.icon_url || item.icon_url,
               app_id: detail.app_id || item.app_id
             };
           }
        }
      } catch (e) {
        console.warn('Failed to fetch detail for', item.name);
      }
      return item;
    }));

    chartData.value = appsWithIcons;
    initChart();
  } catch (error) {
    console.error('Failed to fetch growth data:', error);
  }
};

const handleResize = () => {
  if (viewMode.value === 'chart') chartInstance?.resize();
};

let resizeObserver: ResizeObserver | null = null;

/*
 * 图表容器由 v-if 控制：切到排名条时容器被销毁，实例必须跟着 dispose，
 * 否则 echarts 会抱着一块不存在的 canvas；切回来再重建。
 */
watch(viewMode, async (mode) => {
  if (mode === 'chart') {
    await nextTick();
    initChart();
  } else {
    chartInstance?.dispose();
    chartInstance = null;
  }
});

onMounted(() => {
  fetchData();
  window.addEventListener('resize', handleResize);

  // Add ResizeObserver to handle chart rendering when container size changes
  // Useful when chart is rendered in a hidden tab or container
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(chartRef.value);
  }
  
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  chartInstance?.dispose();
});
</script>

<style scoped>
.chart-card {
  margin-bottom: 20px;
}
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
  white-space: nowrap;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.metric-select {
  margin-left: 10px;
}
.view-toggle {
  width: 24px;
  height: 24px;
  padding: 0;
}
.chart-box {
  width: 100%;
  height: 300px;
}

@media (max-width: 768px) {
  /*
    这张卡有 3 个筛选框（条数 / 时间 / 指标），手机上塞不进标题那一行，
    所以整组换到第二行 —— 关键是"整组"，不能拆散成"跟着标题一个、剩下两个掉下去"。
    只有 1 个筛选框的卡片（总下载榜 / 非华为榜）就是标题 + 下拉同行。
  */
  .card-header {
    height: auto;
    row-gap: 8px;
  }

  .header-left {
    flex: 1 1 auto;
    gap: 8px;
  }

  .controls {
    flex: 1 1 100%;
    margin-left: 0;
    gap: 8px;
    flex-wrap: wrap;
  }

  .time-select,
  .metric-select {
    margin-left: 0;
  }
}

.title-link {
  cursor: pointer;
  transition: color 0.3s;
}

.title-link:hover {
  color: var(--el-color-primary);
}
</style>
