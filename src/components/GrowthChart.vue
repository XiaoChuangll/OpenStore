<template>
  <el-card class="chart-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span :class="{ 'title-link': route.path !== '/rank/growth' }" @click="goToRank">应用下载增长对比</span>
          <el-select v-model="pageSize" size="small" style="width: 80px; margin-left: 10px;" @change="fetchData">
            <el-option label="10条" :value="10" />
            <el-option label="20条" :value="20" />
            <el-option label="30条" :value="30" />
            <el-option label="50条" :value="50" />
          </el-select>
        </div>
        <div class="controls">
          <el-select v-model="timeRange" size="small" class="time-select" @change="fetchData">
            <el-option label="最近1天" :value="1" />
            <el-option label="最近7天" :value="7" />
            <el-option label="最近30天" :value="30" />
          </el-select>
          <el-select v-model="metricType" size="small" class="metric-select" @change="updateChart">
            <el-option label="下载增长量" value="increase" />
            <el-option label="增长前下载量" value="prior" />
            <el-option label="增长后下载量" value="current" />
          </el-select>
        </div>
      </div>
    </template>
    <div ref="chartRef" style="width: 100%; height: 300px;"></div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { hmApi } from '../services/hm-api';

const router = useRouter();
const route = useRoute();
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const timeRange = ref(30);
const pageSize = ref(30);
const metricType = ref('increase');
const chartData = ref<any[]>([]);
const excludedPkgs = new Set<string>(['com.leisu.yuan']);

const goToRank = () => {
  if (route.path !== '/rank/growth') {
    router.push('/rank/growth');
  }
};

const initChart = () => {
  if (!chartRef.value) return;
  
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
      const listResponse = await hmApi.get<any>('/apps/list/0', {
        page_size: 30,
        sort: 'download_count',
        desc: true
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
           const detailRes = await hmApi.get<any>('/apps/list/0', {
             search_key: 'pkg_name',
             search_value: item.pkg_name,
             search_exact: true,
             page_size: 1
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
  chartInstance?.resize();
};

onMounted(() => {
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
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
}
.header-left {
  display: flex;
  align-items: center;
}
.controls {
  display: flex;
  align-items: center;
}
.time-select {
  width: 120px;
}
.metric-select {
  width: 120px;
  margin-left: 10px;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    height: auto;
  }
  
  .header-left {
    flex-wrap: wrap;
  }
  
  .controls {
    width: 100%;
    flex-wrap: wrap;
    gap: 10px;
  }
  
  .time-select,
  .metric-select {
    margin-left: 0;
    width: 100%;
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
