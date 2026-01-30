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

    <!-- Trend Chart -->
    <el-card class="mb-4" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>近30天访客趋势</span>
        </div>
      </template>
      <div ref="chartRef" class="chart-container"></div>
    </el-card>

    <el-table 
      :data="items" 
      style="width: 100%" 
      stripe 
      v-loading="loading"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" />
      <el-table-column prop="timestamp" label="时间" width="180" :formatter="formatTime" />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column prop="location" label="地区" width="150" show-overflow-tooltip />
      <el-table-column prop="path" label="访问路径" min-width="180" show-overflow-tooltip />
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
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
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
const filterLocation = ref('');
const filterDevice = ref('');
const filterPath = ref('');
const locationOptions = ref<{name: string, count: number}[]>([]);
const deviceOptions = ref<{name: string, count: number}[]>([]);
const selectedIds = ref<number[]>([]);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
let unbindWS: (() => void) | null = null;

onMounted(() => {
  window.addEventListener('resize', checkMobile);
  fetchList();
  initChart();
  
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
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

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

const handleSelectionChange = (selection: Visitor[]) => {
  selectedIds.value = selection.map(item => item.id);
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

const initChart = async () => {
  if (!chartRef.value) return;
  
  const trend = await getVisitorTrend();
  
  // Dispose existing instance if any
  if (chartInstance) {
    chartInstance.dispose();
  }
  
  // Initialize new instance
  chartInstance = echarts.init(chartRef.value);
  
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

  // Setup ResizeObserver for responsiveness
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(chartRef.value);
  }
};

const formatTime = (_row: any, _col: any, val: string) => {
  if (!val) return '';
  // Try to parse as UTC if it doesn't have timezone info
  const date = new Date(val.endsWith('Z') ? val : val + 'Z');
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const goBack = () => {
  router.push('/');
};

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
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
