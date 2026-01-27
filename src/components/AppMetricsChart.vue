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

      <el-collapse-item name="stock-matrix">
        <template #title>
          <div class="custom-collapse-title">
            <span>股市矩阵图 (Demo)</span>
          </div>
        </template>
        <div class="chart-container">
          <div ref="stockMatrixChartRef" class="chart stock-chart"></div>
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
const stockMatrixChartRef = ref<HTMLElement | null>(null);
let downloadChart: echarts.ECharts | null = null;
let ratingChart: echarts.ECharts | null = null;
let stockMatrixChart: echarts.ECharts | null = null;

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

// Financial Chart Helpers
const calculateMA = (dayCount: number, data: number[]) => {
  const result = [];
  for (let i = 0, len = data.length; i < len; i++) {
    if (i < dayCount) {
      result.push('-');
      continue;
    }
    let sum = 0;
    for (let j = 0; j < dayCount; j++) {
      sum += data[i - j];
    }
    result.push(sum / dayCount);
  }
  return result;
};

const calculateMACD = (data: number[]) => {
  const ema12: number[] = [];
  const ema26: number[] = [];
  const dif: number[] = [];
  const dea: number[] = [];
  const macd: number[] = [];

  let k12 = 2 / 13;
  let k26 = 2 / 27;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      ema12.push(data[i]);
      ema26.push(data[i]);
      dif.push(0);
      dea.push(0);
      macd.push(0);
    } else {
      ema12.push(data[i] * k12 + ema12[i - 1] * (1 - k12));
      ema26.push(data[i] * k26 + ema26[i - 1] * (1 - k26));
      dif.push(ema12[i] - ema26[i]);
      dea.push(dif[i] * 0.2 + dea[i - 1] * 0.8); // EMA9 of DIF
      macd.push((dif[i] - dea[i]) * 2);
    }
  }
  return { dif, dea, macd };
};

const initFinancialChart = () => {
  if (!stockMatrixChartRef.value) return;
  if (!stockMatrixChart) {
    stockMatrixChart = echarts.init(stockMatrixChartRef.value, themeStore.isDark ? 'dark' : undefined);
  }

  // 1. Collect all unique dates and sort them (YYYY-MM-DD for sorting)
  const dateSet = new Set<string>();
  const metricsMap = new Map<string, any>();
  const ratingMap = new Map<string, any>();

  props.metrics.forEach(m => {
    const d = new Date(m.created_at);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateSet.add(dateStr);
    metricsMap.set(dateStr, m);
  });

  (props.rateHistory || []).forEach(r => {
    const d = new Date(r.report_date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateSet.add(dateStr);
    ratingMap.set(dateStr, r);
  });

  const sortedDates = Array.from(dateSet).sort();

  // 2. Build aligned arrays
  const alignedDates: string[] = [];
  const alignedPrices: number[] = []; // Daily Increments (Download)
  const alignedVolumes: number[] = []; // Cumulative Downloads
  const alignedRatings: number[] = []; // Cumulative Rating
  const alignedDailyRatings: number[] = []; // Daily New Rating

  let lastDownload = 0;
  // Initialize lastDownload with the first available metric if possible to avoid huge jump?
  // But strictly following time, if data starts from 0, it is 0.
  // Actually, we should find the first non-zero download to start? 
  // For simplicity, assume 0 start or use the value if present.
  
  let lastRating = 0;

  sortedDates.forEach((dateStr) => {
    // Format for display (MM/DD)
    const [, m, d] = dateStr.split('-');
    alignedDates.push(`${parseInt(m)}/${parseInt(d)}`);

    // Handle Downloads
    const metric = metricsMap.get(dateStr);
    let currentDownload = lastDownload;
    let dailyInc = 0;
    
    if (metric) {
        currentDownload = metric.download_count || 0;
        // If it's the very first data point we encounter, dailyInc is 0.
        // If we have a previous lastDownload, we calculate diff.
        if (lastDownload > 0) {
           dailyInc = Math.max(0, currentDownload - lastDownload);
        }
        lastDownload = currentDownload;
    } else {
        // No record, assume no change in cumulative, so 0 increment
        dailyInc = 0;
    }
    
    alignedVolumes.push(lastDownload); 
    alignedPrices.push(dailyInc);      

    // Handle Ratings
    const rating = ratingMap.get(dateStr);
    let currentRating = lastRating;
    let dailyNewAvg = 0;

    if (rating) {
        const val = toNumberOrNull(rating.cumulative_avg_rating_origin);
        if (val !== null) currentRating = Math.max(0, Math.min(5, val));
        
        const dailyVal = toNumberOrNull(rating.daily_new_average);
        if (dailyVal !== null) dailyNewAvg = Math.max(0, Math.min(5, dailyVal));
        
        lastRating = currentRating;
    } else {
        dailyNewAvg = 0;
    }
    
    alignedRatings.push(currentRating);
    alignedDailyRatings.push(dailyNewAvg);
  });
  
  const dataCount = alignedDates.length;
  const ma10 = calculateMA(10, alignedPrices);
  const { dif, dea, macd } = calculateMACD(alignedPrices);
  
  // Mock Order Book Data (Recent 5 days)
  const orderBookData = [];
  for (let i = 0; i < 5; i++) {
    if (dataCount - 1 - i >= 0) {
      orderBookData.push({
        date: alignedDates[dataCount - 1 - i],
        value: alignedPrices[dataCount - 1 - i],
        type: i % 2 === 0 ? 'ask' : 'bid' // Mock
      });
    }
  }

  const option = {
    animation: false,
    color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      position: function (pos: any, _params: any, _el: any, _rect: any, size: any) {
        const obj: any = { top: 10 };
        obj[['left', 'right'][+(pos[0] < size.viewSize[0] / 2)]] = 30;
        return obj;
      },
      extraCssText: 'width: 170px'
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      label: { backgroundColor: '#777' }
    },
    toolbox: {
      feature: {
        dataZoom: { yAxisIndex: false },
        brush: { type: ['lineX', 'clear'] }
      }
    },
    grid: [
      {
        left: '10%',
        right: '35%', // Reserve space for Order Book
        height: '40%'
      },
      {
        left: '10%',
        right: '35%',
        top: '53%',
        height: '15%'
      },
      {
        left: '10%',
        right: '35%',
        top: '73%', // Volume chart
        height: '15%'
      },
      { // Order Book Grid (Top Right)
        left: '68%',
        right: '5%',
        top: '10%',
        height: '40%' 
      },
       { // Rating Trend (Bottom Right)
        left: '68%',
        right: '5%',
        top: '60%',
        height: '28%' 
      }
    ],
    xAxis: [
      {
        type: 'category',
        data: alignedDates,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false },
        splitLine: { show: false },
        splitNumber: 20,
        min: 'dataMin',
        max: 'dataMax',
        axisPointer: { z: 100 }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: alignedDates,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        splitNumber: 20,
        min: 'dataMin',
        max: 'dataMax'
      },
      {
        type: 'category',
        gridIndex: 2,
        data: alignedDates,
        scale: true,
        boundaryGap: false,
        axisLine: { onZero: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        splitNumber: 20,
        min: 'dataMin',
        max: 'dataMax'
      },
      { // Order Book X (Value)
        type: 'value',
        gridIndex: 3,
        show: false
      },
       { // Rating Trend X
        type: 'category',
        gridIndex: 4,
        data: alignedDates,
        show: false
      }
    ],
    yAxis: [
      {
        scale: true,
        splitArea: { show: true },
        name: '日下载量'
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        name: 'MACD'
      },
      {
        scale: true,
        gridIndex: 2,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        name: '活跃度'
      },
      { // Order Book Y (Category)
        type: 'category',
        gridIndex: 3,
        data: orderBookData.map(d => d.date),
        axisLabel: { show: true, interval: 0, fontSize: 10 },
        axisLine: { show: false },
        axisTick: { show: false },
        position: 'right'
      },
      { // Rating Trend Y
        type: 'value',
        gridIndex: 4,
        splitLine: { show: false },
        name: '平均评分',
        position: 'right',
        min: 0,
        max: 5
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1, 2, 4], // Control main, macd, vol, rating
        start: 50,
        end: 100
      },
      {
        show: true,
        xAxisIndex: [0, 1, 2, 4],
        type: 'slider',
        top: '90%',
        start: 50,
        end: 100
      }
    ],
    series: [
      {
        name: '下载量',
        type: 'line',
        data: alignedPrices, // Using Daily Increments as "Price"
        smooth: true,
        lineStyle: { opacity: 0.5, width: 1 }
      },
      {
        name: '10日均线',
        type: 'line',
        data: ma10,
        smooth: true,
        lineStyle: { opacity: 0.5, width: 1 }
      },
      {
        name: 'MACD',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: macd,
        itemStyle: {
          color: function (params: any) {
            return params.value > 0 ? '#ef232a' : '#14b143';
          }
        }
      },
      {
        name: 'DIF',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: dif,
        symbol: 'none'
      },
      {
        name: 'DEA',
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: dea,
        symbol: 'none'
      },
      {
        name: '日评分活跃度',
        type: 'bar',
        xAxisIndex: 2,
        yAxisIndex: 2,
        data: alignedDailyRatings, // Use rating as volume
        itemStyle: { color: '#73c0de' }
      },
      {
        name: '近期下载',
        type: 'bar',
        xAxisIndex: 3,
        yAxisIndex: 3,
        data: orderBookData.map(d => d.value),
        itemStyle: {
          color: function (params: any) {
            return params.dataIndex % 2 === 0 ? '#ef232a' : '#14b143'; // Mock red/green
          }
        },
        label: {
            show: true,
            position: 'insideLeft',
            formatter: '{c}'
        }
      },
      {
        name: '评分趋势',
        type: 'line',
        xAxisIndex: 4,
        yAxisIndex: 4,
        data: alignedRatings,
        showSymbol: false,
        lineStyle: { width: 2, color: '#fac858' },
        areaStyle: { opacity: 0.1, color: '#fac858' }
      }
    ]
  };

  stockMatrixChart.setOption(option);
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
  if (activeNames.value.includes('stock-matrix')) {
    initFinancialChart();
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
  if (stockMatrixChart) {
    stockMatrixChart.dispose();
    stockMatrixChart = null;
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

    if (val.includes('stock-matrix')) {
      if (!stockMatrixChart) initFinancialChart();
      else stockMatrixChart.resize();
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
  stockMatrixChart?.resize();
};

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  downloadChart?.dispose();
  ratingChart?.dispose();
  stockMatrixChart?.dispose();
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

.stock-chart {
  height: 600px;
}
</style>
