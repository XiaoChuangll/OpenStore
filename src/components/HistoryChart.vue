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
          <!-- 图表 / 数据列表 切换，选择记在本地，默认图表 -->
          <el-tooltip :content="viewMode === 'list' ? '切换为图表' : '切换为列表'" placement="top">
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
    <!--
      这张卡的数据是"一个应用随时间的下载量"，不是排行榜，
      所以列表视图不做排名条，而是一份自上而下的时间台账：
      日期 / 当前累计 / 较上次新增（最新的在最上面，像变更记录一样从上往下读）。
    -->
    <div v-else class="tl-list">
      <div class="tl-head">
        <span>日期</span>
        <span class="tl-num">累计下载</span>
        <span class="tl-num">较上次</span>
      </div>
      <ol class="tl-body">
        <li v-for="row in timelineRows" :key="row.key" class="tl-row">
          <span class="tl-date">{{ row.date }}</span>
          <span class="tl-num tl-total">{{ formatCount(row.total) }}</span>
          <span class="tl-num tl-delta" :class="{ 'is-up': row.delta > 0 }">
            {{ row.delta > 0 ? '+' + formatCount(row.delta) : '—' }}
          </span>
        </li>
      </ol>
      <p v-if="!timelineRows.length" class="tl-empty">暂无数据</p>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { TrendCharts, List } from '@element-plus/icons-vue';
import { hmApi } from '../services/hm-api';

const VIEW_MODE_KEY = 'rank.history.view';

const router = useRouter();
const route = useRoute();
const chartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
const appName = ref('Loading...');
const topApp = ref<any>(null);
const todayIncrement = ref<number | null>(null);
const showTotal = ref(true);
const showIncrement = ref(true);
/** 拉回来的原始时间序列，图表和列表共用 */
const seriesData = ref<any[]>([]);

/* 展示方式：chart（每次进页面都从图表开始）/ list（时间台账） */
const viewMode = ref<'list' | 'chart'>(localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'chart');
const toggleView = () => {
  viewMode.value = viewMode.value === 'list' ? 'chart' : 'list';
  if (viewMode.value === 'list') { showTotal.value = true; showIncrement.value = false; }
  else { showTotal.value = true; showIncrement.value = true; }
};

/** 列表里画哪个指标：图表模式下沿用开关，列表模式下需要一个主指标 */
const primaryMetric = computed<'total' | 'increment'>(() =>
  showIncrement.value && !showTotal.value ? 'increment' : 'total'
);

const formatCount = (value: number) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return n.toLocaleString('zh-CN');
};

/**
 * 时间点 → 台账行：日期 / 当前累计 / 较上次新增。
 * 按时间倒序（最新的在最上面），和"看变更记录"的习惯一致；
 * 看曲线趋势就切回图表。
 */
const timelineRows = computed(() => {
  const rows = seriesData.value.map((item: any, index: number) => {
    const raw = item.created_at || item.timestamp || item.time || '';
    const date = toDate(raw);
    const label = date
      ? `${String(date.getFullYear()).slice(-2)}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` +
        (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim()) ? '' : ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)
      : String(raw) || `第 ${index + 1} 个采样点`;
    const total = Number(item.download_count ?? item.downloads ?? 0) || 0;
    const incRaw = item.download_increment ?? item.increment ?? item.download_increase;
    const inc = Number.isFinite(Number(incRaw))
      ? Math.max(0, Number(incRaw))
      : index > 0
        ? Math.max(0, total - (Number(seriesData.value[index - 1]?.download_count ?? 0) || 0))
        : 0;
    return { key: `${label}-${index}`, date: label, total, delta: inc };
  });
  return rows.reverse();
});

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
  if (viewMode.value === 'chart') {
    showTotal.value = !showTotal.value;
    updateVisibility();
  } else {
    // 列表模式：两个标签是单选，决定条形画哪个指标
    const next = primaryMetric.value === 'total' ? false : true;
    showTotal.value = next;
    showIncrement.value = !next;
  }
};

const toggleIncrement = () => {
  if (viewMode.value === 'chart') {
    showIncrement.value = !showIncrement.value;
    updateVisibility();
  } else {
    const next = primaryMetric.value === 'increment' ? false : true;
    showIncrement.value = next;
    showTotal.value = !next;
  }
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

const initChart = () => {
  // 切到列表时图表容器被销毁，切回来要重建实例
  if (viewMode.value !== 'chart' || !chartRef.value) return;
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  const data = seriesData.value;
  if (!data.length) {
    chartInstance.clear();
    return;
  }
  
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
    const topAppRes = await hmApi.get<any>('/apps/list/1', {
      page_size: 1,
      sort: 'download_count',
      desc: true,
      // 只要第一名应用的 app_id / 名称，简略信息足够
      detail: false
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
    
    seriesData.value = metrics;
    initChart();
  } catch (error) {
    console.error('Failed to fetch history:', error);
    appName.value = 'Error';
    todayIncrement.value = null;
  }
};

const handleResize = () => {
  if (viewMode.value === 'chart') chartInstance?.resize();
};

let resizeObserver: ResizeObserver | null = null;

/*
 * 图表容器由 v-if 控制：切到列表时容器被销毁，实例要跟着 dispose；
 * 切回图表再重建，否则 echarts 会抱着一块不存在的 canvas。
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
  height: 32px;
}
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
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

/* ---------------- 时间台账（历史榜的列表视图） ---------------- */
.tl-list {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
}

.tl-head,
.tl-row {
  display: grid;
  /* 日期 | 累计下载 | 较上次 */
  grid-template-columns: minmax(88px, 1fr) minmax(80px, 1fr) minmax(74px, 0.9fr);
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.tl-head {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-lighter);
}

.tl-body {
  max-height: 320px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tl-row {
  font-size: 13px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.tl-row:nth-child(odd) {
  background-color: var(--el-fill-color-lighter);
}

.tl-date {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-regular);
}

.tl-num {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.tl-total {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.tl-delta {
  color: var(--el-text-color-secondary);
}

.tl-delta.is-up {
  color: var(--el-color-success);
}

.tl-empty {
  margin: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

@media (max-width: 768px) {
  .tl-head,
  .tl-row {
    grid-template-columns: minmax(76px, 1fr) minmax(72px, 1fr) minmax(66px, 0.9fr);
    gap: 6px;
    padding: 8px 10px;
  }

  .tl-body {
    max-height: 300px;
  }
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
  /*
   * 窄屏：把 .header-left 拆开（display: contents），让「标题 / Top 1 / 今日新增 /
   * 总量增量切换」四个元素变成同级 flex 项，由浏览器自己按行打包。
   *
   * 这样最省行数：放得下就是
   *   第 1 行：标题 + Top 1
   *   第 2 行：今日新增 + 总量/增量/切换（按钮紧跟在胶囊后面，不再多占一行）
   * 真的很窄（≲320）时才继续往下排。
   * 用 grid 反而不好：列宽被标题撑住，窄屏时按钮会从卡片右边溢出去。
   */
  .card-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    column-gap: 8px;
    row-gap: 6px;
    height: auto;
  }

  .header-left {
    display: contents;
  }

  .controls {
    /* 自动外边距把它推到所在行的最右边：和「今日新增」同一行，但贴右侧 */
    margin-left: auto;
    gap: 8px;
    min-width: 0;
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
