<template>
  <div class="metrics-charts">
    <el-collapse v-model="activeNames">
      <el-collapse-item name="download">
        <template #title>
          <div class="custom-collapse-title">
            <span>下载量趋势与增量</span>
          </div>
        </template>
        <div class="chart-container">
          <div ref="downloadChartRef" class="chart"></div>
        </div>
      </el-collapse-item>
      
      <el-collapse-item name="rating">
        <template #title>
          <div class="custom-collapse-title">
            <span>评分历史趋势</span>
          </div>
        </template>
        <div class="chart-container">
          <div ref="ratingChartRef" class="chart"></div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue';
import * as echarts from 'echarts';
import { useThemeStore } from '../stores/theme';

const props = defineProps<{
  metrics: any[];
  rateHistory?: any[];
}>();

const themeStore = useThemeStore();
const activeNames = ref<string[]>([]); // Default collapsed
const downloadChartRef = ref<HTMLElement | null>(null);
const ratingChartRef = ref<HTMLElement | null>(null);
let downloadChart: echarts.ECharts | null = null;
let ratingChart: echarts.ECharts | null = null;

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

// Simple linear regression for forecast
const predictNext = (data: number[], count: number) => {
  if (data.length < 2) return [];
  
  const n = Math.min(data.length, 30); // Use last 30 points for prediction
  const subset = data.slice(-n);
  
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += subset[i];
    sumXY += i * subset[i];
    sumXX += i * i;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  const predictions = [];
  const lastVal = subset[subset.length - 1];
  
  for (let i = 1; i <= count; i++) {
    // predictions.push(Math.max(lastVal, intercept + slope * (n - 1 + i))); // Ensure it doesn't drop below last known if monotonic
    // Allow drop if trend is negative, but downloads usually monotonic
    let val = intercept + slope * (n - 1 + i);
    if (val < lastVal) val = lastVal; // Assuming downloads don't decrease
    predictions.push(Math.floor(val));
  }
  return predictions;
};

const toNumberOrNull = (value: any) => {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const processDownloadData = () => {
  if (!props.metrics || props.metrics.length === 0) {
    return {
      dates: [],
      rawDownloads: [],
      dailyIncrements: [],
      rawDataIncrements: [],
      forecastDates: [],
      predictedDownloads: []
    };
  }

  const sorted = [...props.metrics].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const dates = sorted.map(m => formatDate(m.created_at));
  const rawDownloads = sorted.map(m => m.download_count || 0);

  const dailyIncrements: number[] = [];
  const rawDataIncrements: number[] = [];
  for (let i = 0; i < rawDownloads.length; i++) {
    if (i === 0) {
      dailyIncrements.push(0);
      rawDataIncrements.push(0);
    } else {
      const diff = rawDownloads[i] - rawDownloads[i - 1];
      // Only keep negative growth for this series (raw data increments now represents drops)
      rawDataIncrements.push(Math.abs(Math.min(0, diff)));
      // Filter out negative growth for the bar chart
      dailyIncrements.push(Math.max(0, diff));
    }
  }

  const forecastDays = 7;
  const predictedDownloads = predictNext(rawDownloads, forecastDays);
  const forecastDates: string[] = [];
  const lastDate = new Date(sorted[sorted.length - 1].created_at);
  for (let i = 1; i <= forecastDays; i++) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + i);
    forecastDates.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }

  return {
    dates,
    rawDownloads,
    dailyIncrements,
    rawDataIncrements,
    forecastDates,
    predictedDownloads
  };
};

const processRatingHistoryData = () => {
  const list = props.rateHistory ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    return {
      dates: [],
      rawRatings: [],
      highPrecRatings: [],
      dailyNewAvgRatings: []
    };
  }

  const sorted = [...list].sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());

  const dates = sorted.map(m => formatDate(m.report_date));
  const dailyNewAvgRatings = sorted.map(m => {
    const val = toNumberOrNull(m.daily_new_average);
    if (val === null) return null;
    return Math.max(0, Math.min(5, val));
  });
  const rawRatings = sorted.map(m => {
    const val = toNumberOrNull(m.cumulative_avg_rating_origin);
    if (val === null) return null;
    return Math.max(0, Math.min(5, val));
  });
  const highPrecRatings = sorted.map(m => {
    const val = toNumberOrNull(m.cumulative_avg_rating_high_prec);
    if (val === null) return null;
    return Math.max(0, Math.min(5, val));
  });

  return {
    dates,
    rawRatings,
    highPrecRatings,
    dailyNewAvgRatings,
  };
};

const initDownloadChart = (data: any) => {
  if (!downloadChartRef.value) return;
  if (!downloadChart) {
    downloadChart = echarts.init(downloadChartRef.value, themeStore.isDark ? 'dark' : undefined);
  }
  
  const { dates, rawDownloads, dailyIncrements, rawDataIncrements, forecastDates, predictedDownloads } = data;
  
  // Combine dates for x-axis
  const allDates = [...dates, ...forecastDates];
  // Pad actual data with nulls for forecast part
  const paddedRawDownloads = [...rawDownloads, ...new Array(forecastDates.length).fill(null)];
  // Pad forecast data with nulls for history part (connect last point)
  const paddedForecast = rawDownloads.length > 0 
    ? [...new Array(dates.length - 1).fill(null), rawDownloads[rawDownloads.length - 1], ...predictedDownloads]
    : [];

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      type: 'scroll',
      top: 0,
      data: ['下载量(原始数据)', '下载量(过滤后)', '下载量预测(未来7天)', '每日增量', '原始数据增量']
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 60, // Ensure space for legend
      bottom: '15%', // Make room for slider
      containLabel: true
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        bottom: 5
      }
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: allDates
    },
    yAxis: [
      {
        type: 'value',
        name: '下载量',
        position: 'left'
      },
      {
        type: 'value',
        name: '增量',
        position: 'right'
      }
    ],
    series: [
      {
        name: '下载量(原始数据)',
        type: 'line',
        data: paddedRawDownloads,
        smooth: false,
        itemStyle: { color: '#5470C6' }
      },
      {
        name: '下载量(过滤后)',
        type: 'line',
        data: paddedRawDownloads, // Using raw for now as "filtered" isn't clearly defined
        smooth: true,
        lineStyle: { type: 'solid', width: 1 },
        itemStyle: { opacity: 0 } // Hide dots
      },
      {
        name: '下载量预测(未来7天)',
        type: 'line',
        data: paddedForecast,
        lineStyle: { type: 'dashed' },
        itemStyle: { color: '#FF9F7F' }
      },
      {
        name: '每日增量',
        type: 'bar',
        yAxisIndex: 1,
        stack: 'increment',
        data: [...dailyIncrements, ...new Array(forecastDates.length).fill(null)],
        itemStyle: { color: 'rgba(145, 204, 117, 0.5)' }
      },
      {
        name: '原始数据增量',
        type: 'bar',
        yAxisIndex: 1,
        stack: 'increment',
        data: [...rawDataIncrements, ...new Array(forecastDates.length).fill(null)],
        itemStyle: { color: '#EE6666' },
        tooltip: {
          valueFormatter: (value: any) => value ? `-${value}` : value
        }
      }
    ]
  };
  
  downloadChart.setOption(option);
};

const initRatingChart = (data: any) => {
  if (!ratingChartRef.value) return;
  if (!ratingChart) {
    ratingChart = echarts.init(ratingChartRef.value, themeStore.isDark ? 'dark' : undefined);
  }
  
  const { dates, rawRatings, highPrecRatings, dailyNewAvgRatings } = data;

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      type: 'scroll',
      top: 0,
      data: ['每日新增平均评分', '累计平均评分(原始)', '累计平均评分(高精度)']
    },
    grid: {
      left: '3%',
      right: '4%',
      top: 60, // Ensure space for legend
      bottom: '15%', // Make room for slider
      containLabel: true
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        type: 'slider',
        start: 0,
        end: 100,
        bottom: 5
      }
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates
    },
    yAxis: [
      {
        type: 'value',
        name: '评分',
        min: 0,
        max: 5
      }
    ],
    series: [
      {
        name: '每日新增平均评分',
        type: 'bar', // or scatter
        data: dailyNewAvgRatings,
        itemStyle: { color: '#fac858' }
      },
      {
        name: '累计平均评分(原始)',
        type: 'line',
        data: rawRatings,
        step: 'end', // Ratings are discrete steps often
        itemStyle: { color: '#91cc75' }
      },
      {
        name: '累计平均评分(高精度)',
        type: 'line',
        data: highPrecRatings,
        smooth: true,
        itemStyle: { color: '#5470c6' }
      }
    ]
  };
  
  ratingChart.setOption(option);
};

const renderCharts = () => {
  if (activeNames.value.includes('download')) {
    const downloadData = processDownloadData();
    if (downloadData) initDownloadChart(downloadData);
  }
  if (activeNames.value.includes('rating')) {
    const ratingData = processRatingHistoryData();
    if (ratingData) initRatingChart(ratingData);
  }
};

watch(() => themeStore.isDark, () => {
  if (downloadChart) {
    downloadChart.dispose();
    downloadChart = null;
  }
  if (ratingChart) {
    ratingChart.dispose();
    ratingChart = null;
  }
  nextTick(() => {
    renderCharts();
  });
});

watch(() => activeNames.value, (val) => {
  nextTick(() => {
    if (val.includes('download')) {
      const downloadData = processDownloadData();
      if (!downloadData) return;
      if (!downloadChart) initDownloadChart(downloadData);
      else downloadChart.resize();
    }
    
    if (val.includes('rating')) {
      const ratingData = processRatingHistoryData();
      if (!ratingData) return;
      if (!ratingChart) initRatingChart(ratingData);
      else ratingChart.resize();
    }

    if (val.length > 0) {
      window.addEventListener('resize', handleResize);
    } else {
      window.removeEventListener('resize', handleResize);
    }
  });
});

watch(() => props.metrics, () => {
  renderCharts();
}, { deep: true });

watch(() => props.rateHistory, () => {
  renderCharts();
}, { deep: true });

const handleResize = () => {
  downloadChart?.resize();
  ratingChart?.resize();
};

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  downloadChart?.dispose();
  ratingChart?.dispose();
});
</script>

<style scoped>
.metrics-charts {
  overflow: hidden;
}

.chart-container {
  padding: 16px 0 16px;
  margin-bottom: 24px;
}

.custom-collapse-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  flex: 1;
  line-height: 1.4;
}

:deep(.el-collapse-item__header) {
  flex-direction: row;
  justify-content: space-between;
  padding: 0;
}

:deep(.el-collapse-item__title) {
  flex: 1;
  padding-left: 0;
  margin-left: 0;
}

:deep(.el-collapse-item__arrow) {
  margin: 0 0 0 8px;
}

.chart {
  width: 100%;
  height: 350px;
}
</style>
