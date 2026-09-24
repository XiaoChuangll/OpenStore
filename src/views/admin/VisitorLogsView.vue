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
        class="filter-select"
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
        class="filter-select"
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
        class="filter-input"
        clearable
        @keyup.enter="onSearch"
        @clear="onSearch"
      />

      <el-button type="primary" :icon="Search" @click="onSearch">搜索</el-button>

      <div class="filter-actions">
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
    </div>

    <el-card class="mb-4" shadow="hover">
      <template #header>
        <div class="card-header card-header-tabs">
          <el-tabs v-model="activeTrendTab" class="trend-tabs">
            <el-tab-pane label="概览" name="overview" />
            <el-tab-pane label="行为类别" name="activity" />
            <el-tab-pane label="比较" name="compare" />
          </el-tabs>
        </div>
      </template>
      <div v-show="activeTrendTab === 'overview'" class="trend-panel">
        <div class="trend-title-bar">
          <div class="trend-title">访客趋势 · {{ trendLabel }}</div>
          <el-select v-model="trendRange" size="small" class="trend-select" @change="refreshTrend">
            <el-option
              v-for="range in trendRanges"
              :key="range.key"
              :label="range.label"
              :value="range.key"
            />
          </el-select>
        </div>
        <div ref="chartRef" class="chart-container"></div>
      </div>
      <div v-show="activeTrendTab === 'activity'" class="trend-panel">
        <!-- 窄屏用卡片列表，避免列被挤压/截断 -->
        <div v-if="isMobile" class="activity-cards" v-loading="loading">
          <div
            v-for="item in activityItems"
            :key="item.id"
            class="activity-card is-clickable"
            @click="openIpHistory(item)"
          >
            <div class="activity-card-top">
              <span class="activity-time">{{ formatTime(null, null, item.timestamp || '') }}</span>
              <span class="activity-device">{{ item.device || '未知设备' }}</span>
            </div>
            <div class="activity-path" :title="formatPath(null, null, item.path || '')">
              {{ formatPath(null, null, item.path || '') }}
            </div>
            <div class="activity-meta">
              <span>{{ item.ip || '—' }}</span>
              <span>{{ item.location || '未知地区' }}</span>
            </div>
          </div>
          <p v-if="activityItems.length === 0" class="activity-empty">暂无访问记录</p>
        </div>

        <!-- 宽屏保留表格；中等宽度允许横向滚动，不再截断内容 -->
        <div v-else class="activity-table-wrap">
            <el-table
              :data="activityItems"
              stripe
              style="width: 100%"
              v-loading="loading"
              class="activity-table"
              @row-click="openIpHistory"
            >
            <el-table-column prop="timestamp" label="时间" width="180" show-overflow-tooltip :formatter="formatTime" />
            <el-table-column prop="ip" label="IP" width="140" show-overflow-tooltip />
            <el-table-column prop="path" label="访问路径" min-width="220" show-overflow-tooltip :formatter="formatPath" />
            <el-table-column prop="location" label="地区" width="150" show-overflow-tooltip />
            <el-table-column prop="device" label="设备" min-width="160" show-overflow-tooltip />
          </el-table>
        </div>
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
      <div v-show="activeTrendTab === 'compare'" class="trend-panel">
        <div class="compare-toolbar">
          <div class="compare-toolbar-left">
            <span class="compare-toolbar-label">对比区间</span>
            <span v-if="compareBasisNote" class="compare-basis-note">{{ compareBasisNote }}</span>
            <template v-if="compareRangesOverlap">
              <span class="compare-overlap-note">
                两个区间都到今天为止，长区间包含短区间，重叠那几天是同一份数据
              </span>
              <el-button
                link
                type="primary"
                size="small"
                class="compare-overlap-action"
                @click="usePreviousPeriod"
              >
                改为对比上一个周期
              </el-button>
            </template>
          </div>
          <div class="compare-toolbar-right">
            <el-select v-model="compareLeftRange" size="small" @change="loadCompare">
              <el-option
                v-for="range in compareRanges"
                :key="range.key"
                :label="range.label"
                :value="range.key"
              />
            </el-select>
            <span class="compare-vs">VS</span>
            <el-select v-model="compareRightRange" size="small" @change="loadCompare">
              <el-option
                v-for="range in compareRanges"
                :key="range.key"
                :label="range.label"
                :value="range.key"
              />
            </el-select>
          </div>
        </div>
        <div class="compare-windows">
          <span class="compare-window">
            {{ compareLeftLabel }}
            <template v-if="compareLeftStats.start">
              （{{ compareLeftStats.start }} ~ {{ compareLeftStats.end }}，{{ compareLeftStats.days }} 天<template
                v-if="compareLeftStats.dataDays && compareLeftStats.dataDays < compareLeftStats.days"
              >，其中有访问 {{ compareLeftStats.dataDays }} 天</template>）
            </template>
          </span>
          <span class="compare-vs">VS</span>
          <span class="compare-window">
            {{ compareRightLabel }}
            <template v-if="compareRightStats.start">
              （{{ compareRightStats.start }} ~ {{ compareRightStats.end }}，{{ compareRightStats.days }} 天<template
                v-if="compareRightStats.dataDays && compareRightStats.dataDays < compareRightStats.days"
              >，其中有访问 {{ compareRightStats.dataDays }} 天</template>）
            </template>
          </span>
        </div>
        <div class="compare-metrics">
          <div v-for="metric in compareMetrics" :key="metric.key" class="compare-metric-card">
            <div class="compare-metric-label">{{ metric.label }}</div>
            <div class="compare-metric-value">{{ metric.valueText }}</div>
            <div class="compare-metric-meta">
              <span v-if="metric.avgText" class="compare-metric-avg">{{ metric.avgText }}</span>
              <span class="compare-metric-change" :class="metric.changeClass">
                {{ metric.deltaText }}<template v-if="metric.deltaHint"> · {{ metric.deltaHint }}</template>
              </span>
            </div>
          </div>
        </div>
        <div class="compare-chart-title">趋势对比 · {{ compareLeftLabel }} vs {{ compareRightLabel }}</div>
        <div ref="compareChartRef" class="chart-container compare-chart"></div>
      </div>
    </el-card>

    <el-dialog
      v-model="ipHistoryVisible"
      :title="ipHistoryTitle"
      :width="isMobile ? '92vw' : '620px'"
      append-to-body
      class="ip-history-dialog"
    >
      <div class="ip-history-summary">
        <span class="ip-history-location">{{ ipHistory.location || '未知地区' }}</span>
        <span class="ip-history-stat">共 {{ ipHistory.total }} 次访问</span>
        <span v-if="ipHistory.startText" class="ip-history-stat">
          {{ ipHistory.startText }}
        </span>
      </div>
      <div class="ip-history-list" v-loading="ipHistoryLoading">
        <div v-for="row in ipHistory.rows" :key="row.id" class="ip-history-row">
          <span class="ip-history-time">{{ formatTime(null, null, row.timestamp || '') }}</span>
          <span class="ip-history-path" :title="formatPath(null, null, row.path || '')">
            {{ formatPath(null, null, row.path || '') }}
          </span>
          <span class="ip-history-device">{{ row.device || '未知设备' }}</span>
        </div>
        <p v-if="!ipHistoryLoading && ipHistory.rows.length === 0" class="activity-empty">
          暂无访问记录
        </p>
      </div>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  getVisitorStats,
  getVisitorTrend,
  exportVisitors,
  batchDeleteVisitors,
  getVisitorIpHistory,
  type Visitor
} from '../../services/admin';
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
const compareChartRef = ref<HTMLElement | null>(null);
const activeTrendTab = ref<'overview' | 'activity' | 'compare'>('overview');
interface TrendRange {
  key: string;
  label: string;
  days: number;
  /** hour：按小时分桶（短窗口用） */
  granularity?: 'day' | 'hour';
  /** 小时粒度时的回看小时数 */
  hours?: number;
  /** today：只取当天（北京时间 0 点起） */
  scope?: 'today';
  /** 窗口整体往回推的天数（对比「上一个周期」用） */
  offset?: number;
}

const trendRanges: TrendRange[] = [
  // 短窗口按小时分桶，长窗口按天：否则「最近24小时」只有两个点、看不出趋势
  { key: 'last_24h', label: '最近24小时', days: 1, granularity: 'hour', hours: 24 },
  { key: 'today', label: '今天', days: 1, granularity: 'hour', scope: 'today' },
  { key: 'this_week', label: '本周', days: 7 },
  { key: 'last_7', label: '最近7天', days: 7 },
  { key: 'this_month', label: '本月', days: 30 },
  { key: 'last_30', label: '最近30天', days: 30 },
  { key: 'last_90', label: '最近90天', days: 90 },
  { key: 'last_180', label: '最近180天', days: 180 }
];
const trendRange = ref('last_30');
const compareLeftRange = ref('last_7');
const compareRightRange = ref('last_30');

// 对比区额外提供「上一个周期」：同一头对齐的「最近X」长区间一定包含短区间，
// 尾巴上本来就是同一份数据；想真正对比两段不同的数据，得把窗口往回推。
const compareRanges: TrendRange[] = [
  ...trendRanges,
  { key: 'prev_7', label: '上一个7天', days: 7, offset: 7 },
  { key: 'prev_30', label: '上一个30天', days: 30, offset: 30 },
  { key: 'prev_90', label: '上一个90天', days: 90, offset: 90 }
];
const emptySummary = () => ({
  days: 0,
  dataDays: 0,
  visits: 0,
  uniqueIps: 0,
  visitsPerDay: 0,
  uniqueIpsPerDay: 0,
  start: '',
  end: ''
});
const compareLeftStats = ref(emptySummary());
const compareRightStats = ref(emptySummary());
const compareLeftTrend = ref<Array<{ date: string; count: number; unique_ip: number }>>([]);
const compareRightTrend = ref<Array<{ date: string; count: number; unique_ip: number }>>([]);
const filterLocation = ref('');
const filterDevice = ref('');
const filterPath = ref('');

/* 单个 IP 的最近访问记录：点卡片 / 表格行展开 */
const ipHistoryVisible = ref(false);
const ipHistoryLoading = ref(false);
const ipHistory = ref<{
  ip: string;
  location: string;
  total: number;
  startText: string;
  rows: Visitor[];
}>({ ip: '', location: '', total: 0, startText: '', rows: [] });
const ipHistoryTitle = computed(() =>
  ipHistory.value.ip ? `${ipHistory.value.ip} 的访问记录` : '访问记录'
);

const openIpHistory = async (row: Partial<Visitor>) => {
  const ip = String(row?.ip || '').trim();
  if (!ip || ip === '—') return;

  ipHistory.value = {
    ip,
    location: String(row?.location || ''),
    total: 0,
    startText: '',
    rows: []
  };
  ipHistoryVisible.value = true;
  ipHistoryLoading.value = true;

  try {
    const data = await getVisitorIpHistory(ip);
    ipHistory.value = {
      ip,
      location: data.location || String(row?.location || ''),
      total: data.total || 0,
      startText: data.first_seen ? `首次 ${formatTime(null, null, data.first_seen)}` : '',
      rows: data.visitors || []
    };
  } catch {
    ElMessage.error('读取该 IP 的访问记录失败');
  } finally {
    ipHistoryLoading.value = false;
  }
};
const locationOptions = ref<{name: string, count: number}[]>([]);
const deviceOptions = ref<{name: string, count: number}[]>([]);
const selectedIds = ref<number[]>([]);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
let unbindWS: (() => void) | null = null;
const trendLabel = computed(() => trendRanges.find(r => r.key === trendRange.value)?.label || '最近30天');
const compareLeftLabel = computed(() => compareRanges.find(r => r.key === compareLeftRange.value)?.label || '');
const compareRightLabel = computed(() => compareRanges.find(r => r.key === compareRightRange.value)?.label || '');
const activityItems = computed(() => items.value);
const compareSameLength = computed(() => {
  const l = compareLeftStats.value.days;
  const r = compareRightStats.value.days;
  return Boolean(l && r && l === r);
});

/** 两边都是「到今天为止」的窗口 → 必然一头对齐、长区间包含短区间，重叠段数值天然相同 */
const compareRangesOverlap = computed(() => {
  const left = compareRanges.find(r => r.key === compareLeftRange.value);
  const right = compareRanges.find(r => r.key === compareRightRange.value);
  return Boolean(left && right && !left.offset && !right.offset);
});

/** 一键把右区间换成与左区间等长的「上一个周期」，这样两段数据才不重叠 */
const usePreviousPeriod = () => {
  const left = compareRanges.find(r => r.key === compareLeftRange.value);
  const days = left?.days || 7;
  const match = compareRanges.find(r => r.offset === days);
  if (!match) return;
  compareRightRange.value = match.key;
  loadCompare();
};
const compareBasisNote = computed(() => {
  if (!compareLeftStats.value.days || !compareRightStats.value.days) return '';
  return compareSameLength.value
    ? '两个区间等长，变化为总量差'
    : '两个区间长度不同，变化按日均计算';
});
const compareMetrics = computed(() => {
  const left = compareLeftStats.value;
  const right = compareRightStats.value;
  const delta = (a: number, b: number) => {
    if (!b) return null;
    return ((a - b) / b) * 100;
  };
  /**
   * value 展示总量；变化率始终基于「日均」计算，
   * 这样"最近180天 vs 最近90天"这类长度不同的比较才有意义。
   */
  const buildMetric = (
    key: string,
    label: string,
    value: number | null,
    perDay: number | null,
    basePerDay: number | null
  ) => {
    const deltaValue = perDay === null || basePerDay === null ? null : delta(perDay, basePerDay);
    const deltaText = deltaValue === null ? '—' : `${deltaValue >= 0 ? '+' : ''}${Math.round(deltaValue)}%`;
    return {
      key,
      label,
      valueText: value === null ? '—' : value.toLocaleString(),
      avgText: perDay === null ? '' : `日均 ${perDay.toFixed(1)}`,
      deltaText,
      deltaHint: deltaValue === null ? '' : compareSameLength.value ? '总量' : '按日均',
      changeClass: deltaValue === null ? 'is-muted' : deltaValue >= 0 ? 'is-up' : 'is-down'
    };
  };
  return [
    buildMetric('visitors', '访客', left.uniqueIps, left.uniqueIpsPerDay, right.uniqueIpsPerDay),
    buildMetric('visits', '访问次数', left.visits, left.visitsPerDay, right.visitsPerDay),
    buildMetric('pageviews', '浏览量', left.visits, left.visitsPerDay, right.visitsPerDay),
    buildMetric('bounce', '跳出率', null, null, null),
    buildMetric('duration', '平均访问时长', null, null, null)
  ];
});

onMounted(() => {
  window.addEventListener('resize', checkMobile);
  fetchList();
  refreshTrend();
  
  unbindWS = onWS((type: string, payload: any) => {
    if (type === 'visitors:new') {
      const hasFilters = filterLocation.value || filterDevice.value || filterPath.value;
      if (page.value === 1 && !hasFilters) {
        items.value.unshift(payload);
        total.value++;
        if (items.value.length > pageSize.value) {
          items.value.pop();
        }
      } else if (!hasFilters) {
        total.value++;
      }
    } else if (type === 'visitors:update') {
      // 归属地异步补全（geoip 缺城市时）后回填，列表里同步更新
      const target = items.value.find((item: any) => item.ip === payload?.ip);
      if (target && payload?.location) {
        target.location = payload.location;
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
  if (compareChartInstance) {
    compareChartInstance.dispose();
    compareChartInstance = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (compareResizeObserver) {
    compareResizeObserver.disconnect();
    compareResizeObserver = null;
  }
});

let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let compareChartInstance: echarts.ECharts | null = null;
let compareResizeObserver: ResizeObserver | null = null;

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

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
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

const refreshTrend = async () => {
  await updateChart(trendRange.value);
};

/** 按当前选中的区间取数：短窗口走小时粒度，其余走天粒度 */
const fetchTrendByRange = (rangeKey: string) => {
  const range = trendRanges.find(r => r.key === rangeKey);
  if (range?.granularity === 'hour') {
    return getVisitorTrend(range.days || 1, {
      granularity: 'hour',
      hours: range.hours,
      scope: range.scope as 'today' | undefined
    });
  }
  return getVisitorTrend(range?.days || 30);
};

const updateChart = async (rangeKey: string) => {
  if (!chartRef.value) return;

  const range = trendRanges.find(r => r.key === rangeKey);
  const hourly = range?.granularity === 'hour';
  const trend = await fetchTrendByRange(rangeKey);
  
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }
  
  // 轴上的标签做缩写（天：MM-DD；小时：HH:00），tooltip 里仍然显示完整时间
  const dates = trend.map(t => String(t.date));
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
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
      axisLabel: {
        rotate: 0,
        hideOverlap: true,
        fontSize: 11,
        color: '#94a3b8',
        formatter: (value: string) => (hourly ? String(value).slice(11, 16) : String(value).slice(5))
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, color: '#94a3b8' },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }
    },
    series: [
      {
        name: '访问量',
        type: 'line',
        smooth: true,
        data: counts,
        showSymbol: false,
        itemStyle: { color: '#4f86f7' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(79,134,247,0.35)' },
            { offset: 1, color: 'rgba(79,134,247,0.02)' }
          ])
        }
      },
      {
        name: '独立IP',
        type: 'line',
        smooth: true,
        data: uniqueIps,
        showSymbol: false,
        itemStyle: { color: '#94a3b8' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(148,163,184,0.22)' },
            { offset: 1, color: 'rgba(148,163,184,0.02)' }
          ])
        }
      }
    ]
  };
  
  chartInstance.setOption(option);

  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(chartRef.value);
  }
};

const sumTrend = (trend: Array<{ count: number; unique_ip: number }>) => {
  return trend.reduce(
    (acc, item) => {
      acc.visits += item.count || 0;
      acc.uniqueIps += item.unique_ip || 0;
      return acc;
    },
    { visits: 0, uniqueIps: 0 }
  );
};

/**
 * 统计一个区间的总量、日均与实际日期范围。
 * 比较两个长度不同的区间时必须按「日均」口径，否则总量差只反映天数差。
 */
const formatDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * requestedDays 是请求的窗口长度（分母），不能拿"有数据的日期数"当分母：
 * 趋势接口只返回有访问的日期，窗口内无数据的日期应计为 0。
 */
const summarizeTrend = (
  trend: Array<{ date: string; count: number; unique_ip: number }>,
  requestedDays: number,
  offsetDays: number = 0
) => {
  const totals = sumTrend(trend);
  const days = requestedDays || trend.length || 1;
  // offsetDays：窗口整体往回推了几天的区间，结束日也跟着往回
  const end = new Date(Date.now() - offsetDays * 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return {
    days,
    dataDays: trend.length,
    visits: totals.visits,
    uniqueIps: totals.uniqueIps,
    visitsPerDay: totals.visits / days,
    uniqueIpsPerDay: totals.uniqueIps / days,
    start: formatDay(start),
    end: formatDay(end)
  };
};

const updateCompareChart = (leftTrend: Array<{ date: string; count: number }>, rightTrend: Array<{ date: string; count: number }>) => {
  if (!compareChartRef.value) return;
  if (!compareChartInstance) {
    compareChartInstance = echarts.init(compareChartRef.value);
  }
  // 两个窗口长度可能不同：按【日期】对齐，而不是按下标
  // （按下标会把长窗口最旧的那几天画到短窗口的日期上）
  const allDates = [...new Set([...leftTrend.map(t => t.date), ...rightTrend.map(t => t.date)])].sort();
  const leftMap = new Map(leftTrend.map(t => [t.date, t.count]));
  const rightMap = new Map(rightTrend.map(t => [t.date, t.count]));
  const labels = allDates.map(d => String(d).slice(5));

  // 两个区间都完整画出来（哪怕长区间包含短区间、尾巴上数值本就相同）
  const leftCounts = allDates.map(d => leftMap.get(d) ?? null);
  const rightCounts = allDates.map(d => rightMap.get(d) ?? null);

  // 两条「到今天为止」的区间必然重叠，重叠段本来就是同一份数据 ——
  // 在图上把那一段框出来，免得被看成"两条线数据一样"
  const overlapMark = (() => {
    if (!compareRangesOverlap.value || allDates.length === 0) return null;
    const leftDays = compareRanges.find(r => r.key === compareLeftRange.value)?.days || 7;
    const rightDays = compareRanges.find(r => r.key === compareRightRange.value)?.days || 30;
    const shorter = Math.min(leftDays, rightDays);
    const startIndex = Math.max(0, allDates.length - shorter);
    return {
      start: String(allDates[startIndex]).slice(5),
      end: String(allDates[allDates.length - 1]).slice(5)
    };
  })();
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: [compareLeftLabel.value, compareRightLabel.value]
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
      axisLabel: { rotate: 0, hideOverlap: true, fontSize: 11, color: '#94a3b8' }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, color: '#94a3b8' },
      splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } }
    },
    series: [
      {
        name: compareLeftLabel.value,
        type: 'bar',
        // 柱子压在折线之上：万一两个区间有重叠，也不会被折线盖住
        z: 3,
        barMaxWidth: 18,
        data: leftCounts,
        itemStyle: { color: 'rgba(79,134,247,0.85)', borderRadius: [4, 4, 0, 0] },
        markArea: overlapMark
          ? {
              silent: true,
              itemStyle: { color: 'rgba(148,163,184,0.10)' },
              label: {
                show: true,
                position: 'insideTop',
                formatter: '重叠区间 · 同一份数据',
                color: '#94a3b8',
                fontSize: 10
              },
              data: [[{ xAxis: overlapMark.start }, { xAxis: overlapMark.end }]]
            }
          : undefined
      },
      {
        name: compareRightLabel.value,
        type: 'line',
        z: 2,
        smooth: true,
        data: rightCounts,
        showSymbol: false,
        itemStyle: { color: '#94a3b8' },
        lineStyle: { width: 2 }
      }
    ]
  };
  compareChartInstance.setOption(option);
  if (!compareResizeObserver) {
    compareResizeObserver = new ResizeObserver(() => {
      compareChartInstance?.resize();
    });
    compareResizeObserver.observe(compareChartRef.value);
  }
};

const loadCompare = async () => {
  const leftRange = compareRanges.find(r => r.key === compareLeftRange.value);
  const rightRange = compareRanges.find(r => r.key === compareRightRange.value);
  const leftDays = leftRange?.days || 7;
  const rightDays = rightRange?.days || 30;
  const [leftTrend, rightTrend] = await Promise.all([
    getVisitorTrend(leftDays, { offset: leftRange?.offset }),
    getVisitorTrend(rightDays, { offset: rightRange?.offset })
  ]);
  compareLeftTrend.value = leftTrend;
  compareRightTrend.value = rightTrend;
  compareLeftStats.value = summarizeTrend(leftTrend, leftDays, leftRange?.offset || 0);
  compareRightStats.value = summarizeTrend(rightTrend, rightDays, rightRange?.offset || 0);
  updateCompareChart(leftTrend, rightTrend);
};

watch(activeTrendTab, async (val) => {
  if (val === 'overview') {
    await refreshTrend();
    nextTick(() => chartInstance?.resize());
  }
  if (val === 'compare') {
    await loadCompare();
    nextTick(() => compareChartInstance?.resize());
  }
});

const formatTime = (_row: any, _col: any, val: string) => {
  if (!val) return '';
  // Try to parse as UTC if it doesn't have timezone info
  const date = new Date(val.endsWith('Z') ? val : val + 'Z');
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const formatPath = (_row: any, _col: any, val: string) => {
  if (!val) return '';
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
};


const goBack = () => {
  router.push('/');
};

const exportCsv = async () => {
  try {
    await exportVisitors();
  } catch (error) {
    ElMessage.error('导出失败');
  }
};

</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.pagination { margin-top: 20px; display: flex; justify-content: flex-end; }

/* 中等宽度下允许横向滚动，避免列被压扁/内容被截断 */
.activity-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.activity-table-wrap :deep(.el-table) {
  min-width: 760px;
}

/* 窄屏卡片列表 */
.activity-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 80px;
}

.activity-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
}

.activity-card.is-clickable {
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.activity-card.is-clickable:hover {
  border-color: var(--el-color-primary-light-5);
  background-color: var(--el-fill-color-light);
}

.activity-card.is-clickable:active {
  background-color: var(--el-fill-color);
}

.activity-table :deep(.el-table__row) {
  cursor: pointer;
}

.ip-history-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.ip-history-location {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ip-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 52vh;
  min-height: 80px;
  overflow-y: auto;
}

.ip-history-row {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 4px 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
  font-size: 13px;
}

.ip-history-time {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.ip-history-path {
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.ip-history-device {
  max-width: 160px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

@media (max-width: 560px) {
  .ip-history-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .ip-history-device {
    max-width: none;
  }
}

.activity-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.activity-time {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.activity-device {
  flex: 0 0 auto;
  max-width: 55%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.activity-path {
  font-size: 13px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.activity-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.activity-empty {
  margin: 16px 0;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
.chart-container { width: 100%; height: 300px; }
.filter-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.card-header-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.trend-tabs {
  flex: 1;
}
.trend-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.trend-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.trend-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.trend-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.trend-title {
  min-width: 0;
}

.trend-select {
  width: 140px;
  flex: 0 0 auto;
}
.compare-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.compare-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.compare-vs {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 600;
}
.compare-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

/* 宽屏时 5 个指标并排一行，窄屏自动换行且等宽等高 */
@media (min-width: 900px) {
  .compare-metrics {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.filter-select {
  /* 收窄两档，给搜索框和右侧操作按钮腾出同一行的空间 */
  width: 160px;
  flex: 0 0 auto;
}

.filter-input {
  /* 搜索框吃掉剩余宽度：一行放得下时右侧的「批量删除 / 导出 CSV」不会被挤到第二行 */
  flex: 1 1 160px;
  min-width: 140px;
  width: auto;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.compare-toolbar-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.compare-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.compare-basis-note {
  padding: 2px 8px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 两个区间重叠时的提示：说明重叠段是同一份数据，并给一键切换 */
.compare-overlap-note {
  font-size: 12px;
  color: var(--el-color-warning);
}

.compare-overlap-action {
  padding: 0;
  font-size: 12px;
}

.compare-windows {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.compare-window {
  padding: 3px 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
}

.compare-metric-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.compare-metric-avg {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.compare-toolbar-right :deep(.el-select) {
  width: 120px;
}

.compare-toolbar-right {
  flex-wrap: nowrap;
}

@media (max-width: 768px) {
  .filter-select,
  .filter-input {
    width: 100%;
  }

  .filter-actions {
    width: 100%;
    margin-left: 0;
  }

  .compare-toolbar-right {
    flex-wrap: wrap;
  }
}
.compare-metric-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compare-metric-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.compare-metric-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.compare-metric-change {
  font-size: 12px;
  font-weight: 600;
}
.compare-metric-change.is-up {
  color: var(--el-color-success);
}
.compare-metric-change.is-down {
  color: var(--el-color-danger);
}
.compare-metric-change.is-muted {
  color: var(--el-text-color-secondary);
}
.compare-chart-title {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.compare-chart {
  height: 320px;
}

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
