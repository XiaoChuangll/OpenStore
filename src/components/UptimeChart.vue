<template>
  <div ref="chartRef" class="chart-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
  data: Array<{ datetime: number; value: number }>;
}>();

const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const getOption = () => {
  const hasData = props.data && props.data.length > 0;
  
  return {
    title: { text: 'Response Time (ms)', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: hasData ? props.data.map(d => new Date(d.datetime * 1000).toLocaleTimeString()) : [],
    },
    yAxis: { type: 'value' },
    series: [
      {
        data: hasData ? props.data.map(d => d.value) : [],
        type: 'line',
        smooth: true,
        areaStyle: {},
        color: '#409EFF'
      },
    ],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    graphic: hasData ? [] : [
      {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: {
          text: '当前监控响应时间趋势为空或不可用',
          fill: '#909399',
          fontSize: 14
        }
      }
    ]
  };
};

const initChart = () => {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value);
  chartInstance.setOption(getOption());
};

watch(() => props.data, () => {
  if (chartInstance) {
    chartInstance.setOption(getOption(), { replaceMerge: ['graphic'] });
  }
});

onMounted(() => {
  initChart();
  window.addEventListener('resize', () => chartInstance?.resize());
});
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 300px;
}
</style>
