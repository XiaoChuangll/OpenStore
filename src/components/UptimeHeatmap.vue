<template>
  <div ref="chartRef" class="heatmap-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import * as echarts from 'echarts';
import { useThemeStore } from '../stores/theme';

const props = defineProps<{
  uptimeRanges?: string; // "100.00-99.98-..." (30 values)
}>();

const themeStore = useThemeStore();
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

// Parse the uptime ranges string into an array of numbers
const uptimeValues = computed(() => {
  if (!props.uptimeRanges) return [];
  return props.uptimeRanges.split('-').map(v => parseFloat(v));
});

// Generate date strings for the last 30 days
const getDates = () => {
  const dates: string[] = [];
  const today = new Date();
  const count = uptimeValues.value.length || 30; // Default to 30 if no data
  
  // The backend generates ranges from oldest to newest (29 days ago -> today)
  // So index 0 is 29 days ago
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (count - 1 - i));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
};

const getOption = () => {
  const values = uptimeValues.value;
  const dates = getDates();
  const isDark = themeStore.isDark;
  
  // Colors based on theme
  const textColor = isDark ? '#E5EAF3' : '#303133';
  const secondaryTextColor = isDark ? '#A3A6AD' : '#909399';
  const borderColor = isDark ? '#1d1e1f' : '#ffffff'; // Match card background
  
  // Combine dates and values: [[date, value], ...]
  const data = values.map((val, index) => [dates[index], val]);
  
  // Determine date range for calendar
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  return {
    tooltip: {
      confine: true,
      backgroundColor: isDark ? '#4C4D4F' : '#fff',
      borderColor: isDark ? '#4C4D4F' : '#ccc',
      textStyle: {
        color: isDark ? '#fff' : '#333'
      },
      formatter: (params: any) => {
        const date = params.value[0];
        const uptime = params.value[1];
        return `${date}<br/>Uptime: <b>${uptime}%</b>`;
      }
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: false,
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      top: 0,
      pieces: [
        { min: 100, label: '100%', color: '#216e39' },      // Dark Green (Perfect)
        { min: 99.0, lt: 100, label: '99%+', color: '#30a14e' }, // Medium Green
        { min: 95.0, lt: 99.0, label: '95%+', color: '#9be9a8' }, // Light Green
        { min: 90.0, lt: 95.0, label: '90%+', color: '#ffd33d' }, // Yellow
        { lt: 90.0, label: '<90%', color: '#ff4444' }      // Red
      ],
      textStyle: {
        color: secondaryTextColor
      }
    },
    calendar: {
      top: 40,
      left: 30,
      right: 30,
      cellSize: ['auto', 20],
      range: [startDate, endDate],
      itemStyle: {
        borderWidth: 2,
        borderColor: borderColor
      },
      yearLabel: { show: false },
      dayLabel: {
        firstDay: 1, // Start week on Monday
        nameMap: 'cn',
        color: textColor
      },
      monthLabel: {
        nameMap: 'cn',
        color: textColor
      },
      splitLine: {
        show: false
      }
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: data,
        itemStyle: {
          borderRadius: 3,
          borderColor: borderColor,
          borderWidth: 2
        }
      }
    ]
  };
};

const initChart = () => {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value);
  
  // Handle empty data case
  if (uptimeValues.value.length === 0) {
    chartInstance.setOption({
      title: {
        text: '暂无历史数据',
        left: 'center',
        top: 'middle',
        textStyle: { color: '#909399', fontSize: 14 }
      }
    });
    return;
  }
  
  chartInstance.setOption(getOption());
};

watch([() => props.uptimeRanges, () => themeStore.isDark], () => {
  if (chartInstance) {
    // If data becomes available or changes
    if (uptimeValues.value.length > 0) {
      chartInstance.clear(); // Clear potential "No data" text
      chartInstance.setOption(getOption());
    }
  } else {
    initChart();
  }
});

onMounted(() => {
  initChart();
  window.addEventListener('resize', () => chartInstance?.resize());
});
</script>

<style scoped>
.heatmap-container {
  width: 100%;
  height: 220px; /* Adjust height as needed */
}
</style>
