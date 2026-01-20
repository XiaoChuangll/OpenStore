<template>
  <el-card class="chart-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <span class="title-text" :class="{ 'title-link': route.path !== '/rank/history' }" @click="goToRank">鸿蒙应用下载量历史</span>
          <el-tag 
            size="small" 
            effect="plain" 
            class="cursor-pointer top-app-tag" 
            @click="goToAppDetail"
          >Top 1: {{ appName }}</el-tag>
          <el-tooltip v-if="todayIncrement !== null" placement="top" effect="dark">
            <template #content>
              <div>{{ todayIncrement === 0 ? '今日新增：未统计' : `今日新增：${todayIncrement.toLocaleString()}` }}</div>
              <div v-if="todayIncrement === 0">说明：接口未提供今日新增数据或今日数据尚未入库。</div>
              <div v-else>说明：优先使用接口增量字段；若无增量字段则用最近两天总量差值估算。</div>
            </template>
            <el-tag
              size="small"
              effect="plain"
              type="success"
            >今日新增: {{ todayIncrement === 0 ? '未统计' : todayIncrement.toLocaleString() }}</el-tag>
          </el-tooltip>
        </div>
        <div class="controls">
          <el-tag 
            :effect="showTotal ? 'dark' : 'plain'" 
            @click="toggleTotal" 
            class="cursor-pointer"
            round
            size="small"
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
const appName = ref('Loading...');
const topApp = ref<any>(null);
const todayIncrement = ref<number | null>(null);
const showTotal = ref(true);
const showIncrement = ref(true);

const goToRank = () => {
  if (route.path !== '/rank/history') {
    router.push('/rank/history');
  }
};

const goToAppDetail = () => {
  if (topApp.value && topApp.value.app_id) {
     router.push({ 
       name: 'app-dashboard', 
       query: { 
         app_id: topApp.value.app_id,
         title: topApp.value.name
       } 
     });
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

const updateVisibility = () => {
  if (!chartInstance) return;
  
  chartInstance.setOption({
    legend: {
      selected: {
        '总下载量': showTotal.value,
        '新增下载': showIncrement.value
      }
    },
    yAxis: [
      { show: showTotal.value },
      { show: showIncrement.value }
    ]
  });
};

const toDate = (raw: any) => {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') {
    return new Date(raw < 1e12 ? raw * 1000 : raw);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return new Date(n < 1e12 ? n * 1000 : n);
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const initChart = (data: any[]) => {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value);
  
  // Data: { created_at: string, download_count: number, ... }
  
  const dates = data.map(item => {
    const timeStr = item.created_at || item.timestamp || item.time;
    if (!timeStr) return '';
    const date = toDate(timeStr);
    if (!date) return '';
    
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    if (typeof timeStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timeStr.trim())) {
      return `${year}-${month}-${day}`;
    }
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  });
  
  const downloads = data.map(item => {
    const val = item.download_count !== undefined ? item.download_count : item.downloads;
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? n : 0;
  });
  
  // Calculate increments
  const increments = downloads.map((val, index) => {
    const rawInc = data[index]?.download_increment ?? data[index]?.increment ?? data[index]?.download_increase;
    const n = typeof rawInc === 'number' ? rawInc : Number(rawInc);
    if (Number.isFinite(n)) return Math.max(0, n);
    if (index === 0) return 0;
    return Math.max(0, val - downloads[index - 1]);
  });

  const formatNumber = (value: number) => {
    if (!Number.isFinite(value)) return '0';
    return value.toLocaleString();
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const index = list[0]?.dataIndex ?? 0;
        const raw = data[index] || {};
        const appDisplay = raw.name || raw.app_name || raw.title || raw.pkg_name || raw.app_id || '未知';
        const dateLabel = dates[index] || '';
        const total = downloads[index] ?? 0;
        const inc = increments[index] ?? 0;
        const lines = [
          dateLabel,
          `应用：${appDisplay}`,
          `总下载量：${formatNumber(total)}`,
          `新增下载：${formatNumber(inc)}`
        ];
        return lines.join('<br/>');
      }
    },
    legend: {
      show: false,
      selected: {
        '总下载量': showTotal.value,
        '新增下载': showIncrement.value
      }
    },
    grid: {
      right: '4%',
      left: '3%',
      bottom: '15%',
      containLabel: true
    },
    dataZoom: [
      {
        type: 'slider',
        show: true,
        xAxisIndex: [0],
        bottom: '2%',
        start: 0,
        end: 100
      },
      {
        type: 'inside',
        xAxisIndex: [0],
        start: 0,
        end: 100
      }
    ],
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '总下载量',
        position: 'left',
        show: showTotal.value,
        axisLabel: {
             formatter: function (value: number) {
                if (value > 100000000) return (value / 100000000).toFixed(1) + '亿';
                if (value > 10000) return (value / 10000).toFixed(0) + 'w';
                return value;
             }
        }
      },
      {
        type: 'value',
        name: '新增下载',
        position: 'right',
        show: showIncrement.value,
        splitLine: { show: false },
        axisLabel: {
             formatter: function (value: number) {
                if (value > 100000000) return (value / 100000000).toFixed(1) + '亿';
                if (value > 10000) return (value / 10000).toFixed(0) + 'w';
                return value;
             }
        }
      }
    ],
    series: [
      {
        name: '总下载量',
        type: 'line',
        data: downloads,
        smooth: true,
        areaStyle: { opacity: 0.1 },
        yAxisIndex: 0,
        itemStyle: { color: '#5470C6' }
      },
      {
        name: '新增下载',
        type: 'bar',
        data: increments,
        yAxisIndex: 1,
        itemStyle: { color: '#91CC75' }
      }
    ]
  };

  chartInstance.setOption(option);
};

const fetchData = async () => {
  try {
    const topAppRes = await hmApi.get<any>('/apps/list/0', {
      page_size: 1,
      sort: 'download_count',
      desc: true
    });
    const topAppData = topAppRes?.data?.data?.[0] || topAppRes?.data?.[0];
    if (topAppData && topAppData.app_id) {
      appName.value = topAppData.name || topAppData.app_name || topAppData.pkg_name || 'Top 1';
      topApp.value = topAppData;
    } else {
      appName.value = 'No Data';
      topApp.value = null;
    }

    const res = await hmApi.get<any>('/rankings/max_download');
    const rawList = res?.data?.data ?? res?.data ?? res;
    const list = Array.isArray(rawList) ? rawList : [];
    const metrics = list.map((item: any) => {
      const rawTime = item?.report_date ?? item?.date ?? item?.created_at ?? item?.timestamp ?? item?.time ?? item?.updated_at;
      const rawDownload = item?.download_count ?? item?.current_download_count ?? item?.downloads ?? item?.max_download_count ?? item?.max_downloads;
      const download = typeof rawDownload === 'number' ? rawDownload : Number(rawDownload);
      return {
        ...item,
        created_at: rawTime,
        download_count: Number.isFinite(download) ? download : 0
      };
    });
    
    // Sort by time
    metrics.sort((a: any, b: any) => {
      const timeA = toDate(a.created_at || a.timestamp || a.time || 0)?.getTime() ?? 0;
      const timeB = toDate(b.created_at || b.timestamp || b.time || 0)?.getTime() ?? 0;
      return timeA - timeB;
    });

    const last = metrics[metrics.length - 1];
    const prev = metrics[metrics.length - 2];
    const rawInc = last?.download_increment ?? last?.increment ?? last?.download_increase;
    const incNum = typeof rawInc === 'number' ? rawInc : Number(rawInc);
    if (Number.isFinite(incNum)) {
      todayIncrement.value = Math.max(0, incNum);
    } else if (last && prev) {
      const lastCount = typeof last.download_count === 'number' ? last.download_count : Number(last.download_count);
      const prevCount = typeof prev.download_count === 'number' ? prev.download_count : Number(prev.download_count);
      if (Number.isFinite(lastCount) && Number.isFinite(prevCount)) {
        todayIncrement.value = Math.max(0, lastCount - prevCount);
      } else {
        todayIncrement.value = null;
      }
    } else {
      todayIncrement.value = null;
    }
    
    initChart(metrics);
  } catch (error) {
    console.error('Failed to fetch history:', error);
    appName.value = 'Error';
    todayIncrement.value = null;
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
.controls {
  display: flex;
  gap: 10px;
}
.title-text {
  display: flex;
  align-items: center;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ml-2 {
  margin-left: 8px;
}
.cursor-pointer {
  cursor: pointer;
}
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    height: auto;
  }
}

.title-link {
  cursor: pointer;
  transition: color 0.3s;
}

.title-link:hover {
  color: var(--el-color-primary);
}

.top-app-tag {
  transition: all 0.3s;
}

.top-app-tag:hover {
  opacity: 0.8;
  transform: translateY(-1px);
}
</style>
