<template>
  <el-card class="chart-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span :class="{ 'title-link': route.path !== '/rank/non-huawei' }" @click="goToRank">非华为应用下载榜</span>
          <el-select v-model="pageSize" size="small" style="width: 80px; margin-left: 10px;" @change="fetchData">
            <el-option label="10条" :value="10" />
            <el-option label="20条" :value="20" />
            <el-option label="30条" :value="30" />
            <el-option label="50条" :value="50" />
          </el-select>
        </div>
        <div class="controls">
          <el-tag 
            :effect="showTotal ? 'dark' : 'plain'" 
            @click="toggleTotal" 
            class="cursor-pointer"
            round
            size="small"
            type="danger" 
          >总量</el-tag>
          <el-tag 
            :effect="showIncrement ? 'dark' : 'plain'" 
            @click="toggleIncrement" 
            class="cursor-pointer"
            round
            type="success"
            size="small"
          >增量</el-tag>
        </div>
      </div>
    </template>
    <div ref="chartRef" style="width: 100%; height: 300px;"></div>
  </el-card>
  <el-card
    v-if="route.path === '/rank/non-huawei'"
    class="chart-card"
    shadow="hover"
  >
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span>非华为应用下载榜 · 股市矩阵图</span>
        </div>
      </div>
    </template>
    <div ref="matrixChartRef" style="width: 100%; height: 260px;"></div>
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
const matrixChartRef = ref<HTMLElement | null>(null);
let matrixChartInstance: echarts.ECharts | null = null;
const showTotal = ref(true);
const showIncrement = ref(true);
const pageSize = ref(30);
const chartData = ref<any[]>([]);

const goToRank = () => {
  if (route.path !== '/rank/non-huawei') {
    router.push('/rank/non-huawei');
  }
};

const toggleTotal = () => {
  showTotal.value = !showTotal.value;
  updateVisibility();
};

const toggleIncrement = () => {
  showIncrement.value = !showIncrement.value;
  updateVisibility();
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
};

const updateVisibility = () => {
  if (!chartInstance || !chartData.value.length) return;
  
  const data = chartData.value;
  const downloads = data.map(item => item.current_download_count || item.download_count);
  const increments = data.map(item => item.download_increment || 0);

  // Determine icon data source
  // If Total is shown, icons follow Total (yAxis 0)
  // If Total is hidden but Increment is shown, icons follow Increment (yAxis 1)
  const useTotalForIcons = showTotal.value;
  const iconData = useTotalForIcons 
    ? data.map((item, index) => ({
        value: downloads[index],
        symbol: 'image://' + (item.icon_url || '')
      }))
    : data.map((item, index) => ({
        value: increments[index],
        symbol: 'image://' + (item.icon_url || '')
      }));
  
  const iconYAxisIndex = useTotalForIcons ? 0 : 1;
  const showIcons = showTotal.value || showIncrement.value;

  chartInstance.setOption({
    legend: {
      selected: {
        '总下载量': showTotal.value,
        '图标': showIcons,
        '新增下载': showIncrement.value
      }
    },
    yAxis: [
      { show: showTotal.value },
      { show: showIncrement.value }
    ],
    series: [
      {
        // Total bar
      },
      {
        name: '图标',
        yAxisIndex: iconYAxisIndex,
        data: iconData
      },
      {
        // Increment line
      }
    ]
  });
};

const initMatrixChart = (names: string[], downloads: number[], increments: number[]) => {
  if (!matrixChartRef.value) return;
  if (!chartData.value.length) return;

  if (!matrixChartInstance) {
    matrixChartInstance = echarts.init(matrixChartRef.value);
  }

  const data = names.map((name, index) => ({
    name,
    value: downloads[index] || 0,
    increment: increments[index] || 0
  }));

  const option = {
    tooltip: {
      formatter: (info: any) => {
        const item = data[info.dataIndex] || { value: 0, increment: 0 };
        return `${info.name}<br/>总下载量：${formatNumber(item.value)}<br/>新增下载：${formatNumber(item.increment)}`;
      }
    },
    series: [
      {
        name: '非华为榜矩阵',
        type: 'treemap',
        roam: false,
        nodeClick: false,
        data,
        label: {
          show: true,
          formatter: '{b}'
        }
      }
    ]
  };

  matrixChartInstance.setOption(option);
};

const initChart = (data: any[]) => {
  if (!chartRef.value) return;
  
  chartData.value = data;
  chartInstance = echarts.init(chartRef.value);
  
  const names = data.map(item => item.name);
  const downloads = data.map(item => item.current_download_count || item.download_count);
  const increments = data.map(item => item.download_increment || 0);
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      show: false,
      selected: {
        '总下载量': showTotal.value,
        '图标': true,
        '新增下载': showIncrement.value
      }
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
    yAxis: [
      {
        type: 'value',
        name: '总下载量',
        position: 'left',
        alignTicks: true,
        axisLine: {
          show: true,
          lineStyle: {
            color: '#EE6666'
          }
        },
        axisLabel: {
          formatter: function (value: number) {
             if (value > 100000000) return (value / 100000000).toFixed(0) + '亿';
             if (value > 10000) return (value / 10000).toFixed(0) + 'w';
             return value;
          }
        }
      },
      {
        type: 'value',
        name: '新增下载',
        position: 'right',
        alignTicks: true,
        axisLine: {
          show: true,
          lineStyle: {
            color: '#91CC75'
          }
        },
        axisLabel: {
          formatter: function (value: number) {
             if (value > 100000000) return (value / 100000000).toFixed(0) + '亿';
             if (value > 10000) return (value / 10000).toFixed(0) + 'w';
             return value;
          }
        }
      }
    ],
    series: [
      {
        name: '总下载量',
        type: 'bar',
        data: downloads,
        itemStyle: {
          color: '#EE6666'
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
        yAxisIndex: 0,
        data: data.map((item, index) => ({
          value: downloads[index],
          symbol: 'image://' + (item.icon_url || '')
        })),
        label: {
          show: false
        }
      },
      {
        name: '新增下载',
        type: 'line',
        yAxisIndex: 1,
        data: increments,
        itemStyle: {
          color: '#91CC75'
        }
      }
    ]
  };
  
  chartInstance.setOption(option);

  initMatrixChart(names, downloads, increments);

  chartInstance.on('click', (params) => {
    const item = chartData.value[params.dataIndex];
    if (item && item.app_id) {
      router.push({ name: 'app-dashboard', query: { app_id: item.app_id } });
    }
  });
};

const fetchData = async () => {
  try {
    // 1. Fetch Top 30 Non-Huawei apps by Total Download
    let apps = [];
    const listResponse = await hmApi.get<any>('/apps/list/0', {
      page_size: pageSize.value,
      sort: 'download_count',
      desc: true,
      exclude_huawei: true
    });
    apps = listResponse.data?.data || [];

    // 2. Fetch Growth data to map increments
    let growthMap = new Map<string, number>();
    try {
      const growthResponse = await hmApi.get<any>('/rankings/download_increase', {
        limit: 100, 
        days: 1
      });
      const growthList = growthResponse.data || [];
      growthList.forEach((item: any) => {
        if (item.pkg_name) {
          growthMap.set(item.pkg_name, item.download_increment || 0);
        }
      });
    } catch (e) {
      console.warn('Failed to fetch increment data');
    }

    // 3. Merge data
    apps = apps.map((item: any) => ({
      ...item,
      current_download_count: item.download_count,
      download_increment: growthMap.get(item.pkg_name) || 0
    }));

    // 4. Fallback for 0 increment
    const appsToFetch = apps.filter((item: any) => item.download_increment === 0 && item.pkg_name);
    
    if (appsToFetch.length > 0) {
      await Promise.all(appsToFetch.map(async (item: any) => {
          try {
              const res = await hmApi.get<any>(`/apps/metrics/${item.pkg_name}`);
              let metrics = Array.isArray(res) ? res : (res.data || []);
              
              if (Array.isArray(metrics) && metrics.length >= 2) {
                   metrics.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                   const latest = metrics[0];
                   const prev = metrics[1];
                   const inc = Math.max(0, latest.download_count - prev.download_count);
                   item.download_increment = inc;
              }
          } catch (e) {
              // ignore
          }
      }));
    }
    
    // 5. Fetch details for icons (if missing)
    const appsWithIcons = await Promise.all(apps.map(async (item: any) => {
      if (!item.icon_url && item.pkg_name) {
         try {
           const detailRes = await hmApi.get<any>('/apps/list/0', {
             search_key: 'pkg_name',
             search_value: item.pkg_name,
             search_exact: true,
             page_size: 1
           });
           const detail = detailRes.data?.data?.[0];
           if (detail && detail.icon_url) {
             return { ...item, icon_url: detail.icon_url };
           }
         } catch (e) {
           // ignore
         }
      }
      return item;
    }));

    initChart(appsWithIcons);
  } catch (error) {
    console.error('Failed to fetch non-huawei download rank:', error);
  }
};

const handleResize = () => {
  chartInstance?.resize();
  matrixChartInstance?.resize();
};

onMounted(() => {
  fetchData();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
  matrixChartInstance?.dispose();
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
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    height: auto;
  }
}
.controls {
  display: flex;
  gap: 10px;
}
.cursor-pointer {
  cursor: pointer;
}

.title-link {
  cursor: pointer;
  transition: color 0.3s;
}

.title-link:hover {
  color: var(--el-color-primary);
}
</style>
