<template>
  <el-card class="chart-card" shadow="hover" :body-style="{ padding: 0 }">
    <template #header>
      <div class="card-header" @click="toggleCollapse">
        <span>总应用评分分布</span>
        <el-icon class="collapse-icon" :class="{ 'is-collapsed': isCollapsed }">
          <ArrowDown />
        </el-icon>
      </div>
    </template>
    <div class="collapsible-wrapper" :class="{ 'is-collapsed': isCollapsed }">
      <div class="chart-content">
        <div ref="chartRef" style="width: 100%; height: 300px;"></div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { hmApi } from '../services/hm-api';

const chartRef = ref<HTMLElement | null>(null);
const isCollapsed = ref(false);
let chartInstance: echarts.ECharts | null = null;

const checkMobile = () => {
  if (window.innerWidth <= 768) {
    isCollapsed.value = true;
  }
};

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
  // If expanding, we might need to resize/re-render chart if it was hidden
  if (!isCollapsed.value) {
    setTimeout(() => {
      chartInstance?.resize();
    }, 350);
  }
};

const initChart = (data: any) => {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value);
  
  // Data: { star_1: 10, star_2: 20, ... }
  const formattedData = [
    { value: data.star_1 || 0, name: '1 Star' },
    { value: data.star_2 || 0, name: '2 Stars' },
    { value: data.star_3 || 0, name: '3 Stars' },
    { value: data.star_4 || 0, name: '4 Stars' },
    { value: data.star_5 || 0, name: '5 Stars' },
  ];

  const option = {
    tooltip: {
      trigger: 'item'
    },
    legend: {
      show: false
    },
    series: [
      {
        name: '评分分布',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: formattedData
      }
    ]
  };

  chartInstance.setOption(option);
};

const fetchData = async () => {
  try {
    const response = await hmApi.post<any>('/charts/rating', null);
    // response is { success: true, data: { ... } }
    initChart(response.data || {});
  } catch (error) {
    console.error('Failed to fetch rating distribution:', error);
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
  margin-bottom: 20px;
}
:deep(.el-card__header) {
  padding: 0;
}
.card-header {
  padding: 18px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}
.collapse-icon {
  transition: transform 0.3s;
}
.collapse-icon.is-collapsed {
  transform: rotate(-90deg);
}
.collapsible-wrapper {
  transition: all 0.3s ease-in-out;
  max-height: 400px;
  opacity: 1;
  overflow: hidden;
}
.collapsible-wrapper.is-collapsed {
  max-height: 0;
  opacity: 0;
}
.chart-content {
  padding: 20px;
}
</style>
