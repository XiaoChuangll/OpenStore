<template>
  <div class="dashboard-overview">
    <!-- 三个指标不做等分：每张卡先按内容定基准宽度，再把剩余空间均摊填满整行 -->
    <el-row :gutter="20" class="mt-4">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>近30天访客趋势</span>
              <el-button link type="primary" @click="$emit('switch-tab', 'visitors')">详细数据</el-button>
            </div>
          </template>
          <!-- 总访客数 + 独立 IP 并进趋势卡片（原来的三张指标卡已去掉应用/文章两项） -->
          <div class="visitor-total">
            <div class="visitor-metric">
              <el-icon class="visitor-total-icon"><User /></el-icon>
              <div class="stat-info">
                <div class="stat-value"><AnimatedNumber :value="stats.visitorCount" /></div>
                <div class="stat-label">总访客数</div>
              </div>
            </div>
            <div class="visitor-metric">
              <el-icon class="visitor-total-icon is-ip"><Connection /></el-icon>
              <div class="stat-info">
                <div class="stat-value"><AnimatedNumber :value="stats.uniqueIpCount" /></div>
                <div class="stat-label">独立 IP</div>
              </div>
            </div>
            <div class="visitor-metric">
              <el-icon class="visitor-total-icon is-region"><Location /></el-icon>
              <div class="stat-info">
                <div class="stat-value"><AnimatedNumber :value="stats.locationKinds" /></div>
                <div class="stat-label">地区数</div>
              </div>
            </div>
          </div>
          <div ref="visitorChartRef" class="chart-body"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="quick-actions-card">
          <template #header>
            <div class="card-header">
              <span>快捷操作</span>
            </div>
          </template>
          <div class="actions-grid">
            <el-button type="primary" plain @click="$emit('switch-tab', 'apps')">
              <el-icon><Grid /></el-icon> 管理应用
            </el-button>
            <el-button type="success" plain @click="$emit('switch-tab', 'articles')">
              <el-icon><Edit /></el-icon> 发布文章
            </el-button>
            <el-button type="warning" plain @click="$emit('switch-tab', 'announcements')">
              <el-icon><Bell /></el-icon> 发布公告
            </el-button>
            <el-button type="info" plain @click="$emit('switch-tab', 'settings')">
              <el-icon><Setting /></el-icon> 主题设置
            </el-button>
            <el-button type="danger" plain @click="$emit('switch-tab', 'incidents')">
              <el-icon><Warning /></el-icon> 故障维护
            </el-button>
            <el-button type="danger" plain @click="showBlockedApps = true">
              <el-icon><CircleClose /></el-icon> 异常应用
            </el-button>
            <!-- 第 7 个按钮单独占一整行：进去看拦截记录、改警告页文案，也能一键触发真实拦截 -->
            <el-button class="is-wide" type="danger" plain @click="showScriptGuardPreview = true">
              <el-icon><Lock /></el-icon> 脚本拦截
            </el-button>
          </div>
          
          <el-divider />
          
          <div class="system-info">
            <div class="info-item">
              <span class="info-label">Node.js 版本</span>
              <span class="info-value">{{ nodeVersion }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">后端运行时长</span>
              <span class="info-value">{{ formatUptime(backendUptimeSeconds) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">系统时间</span>
              <span class="info-value">{{ currentTime }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!--
      首屏那两张卡（趋势 + 快捷操作）先各自去请求，下面的重卡片等浏览器空闲了再挂载：
      这样进入后台时是「先出总览的数字和走势」，而不是六七个请求一起挤在服务端排队。
    -->
    <template v-if="secondaryReady">
      <!-- 后端实时内容 -->
      <LiveLogPanel />
      <!-- 数据新鲜度 -->
      <DataFreshnessCard />
      <!-- 调用拓扑 -->
      <TopologyCard />
      <!-- 接口性能检测：一次性把服务端全部接口跑一遍 -->
      <PerfCheckCard />
      <!-- 访客分布与时段热力图 -->
      <VisitorInsightsCard />
    </template>

    <!-- 异常应用：屏蔽上游脏数据，首页列表不再展示 -->
    <BlockedAppsDialog v-model="showBlockedApps" />

    <!-- 脚本护栏面板：拦截记录 / 自定义警告页 / 一键触发真实拦截 -->
    <ScriptGuardPreviewDialog v-model="showScriptGuardPreview" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, onDeactivated, onMounted, onBeforeUnmount } from 'vue';
import { User, Grid, Edit, Bell, Setting, Warning, CircleClose, Connection, Location, Lock } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { getAdminOverviewStats, getVisitorTrend, type AdminOverviewStats } from '../../services/admin';
import LiveLogPanel from '../../components/LiveLogPanel.vue';
import BlockedAppsDialog from '../../components/BlockedAppsDialog.vue';
import ScriptGuardPreviewDialog from '../../components/ScriptGuardPreviewDialog.vue';
import DataFreshnessCard from '../../components/DataFreshnessCard.vue';
import TopologyCard from '../../components/TopologyCard.vue';
import VisitorInsightsCard from '../../components/VisitorInsightsCard.vue';
import PerfCheckCard from '../../components/PerfCheckCard.vue';
import AnimatedNumber from '../../components/AnimatedNumber.vue';
import { onWS } from '../../services/ws';

defineProps<{ embedded?: boolean }>();
defineEmits(['switch-tab']);

const showBlockedApps = ref(false);
const showScriptGuardPreview = ref(false);

const stats = ref<AdminOverviewStats>({
  visitorCount: 0,
  uniqueIpCount: 0,
  locationKinds: 0,
  appCount: 0,
  feedbackCount: 0,
  commentCount: 0,
  articleCount: 0,
  systemUptime: 0,
  nodeVersion: ''
});

const visitorChartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let timeInterval: number | null = null;
let unbindWS: (() => void) | null = null;
let statsRefreshTimer: number | null = null;
let statsPollTimer: number | null = null;
const currentTime = ref('');

/** 把短时间内的多次访问合并成一次刷新，避免每个访客都打一次接口 */
const scheduleStatsRefresh = () => {
  if (statsRefreshTimer !== null) return;
  statsRefreshTimer = window.setTimeout(() => {
    statsRefreshTimer = null;
    fetchStats();
  }, 2000);
};

// Node 版本由后端 /api/admin/overview 返回，浏览器里没有 process.versions
const nodeVersion = computed(() => stats.value.nodeVersion || '未知');

/**
 * 运行时长：后端返回的是 Node 进程的 process.uptime()。
 * 这里按「天/小时/分钟/秒」逐级显示，避免只显示整小时（后端刚重启时会变成 0 小时）。
 */
const formatUptime = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  if (total < 60) return `${total} 秒`;

  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);

  if (d > 0) return h > 0 ? `${d} 天 ${h} 小时` : `${d} 天`;
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
  return `${m} 分钟`;
};

/** 后端运行时长：拿接口值 + 本地每秒累加，卡片上能实时走字 */
const statsFetchedAt = ref(0);
const nowTick = ref(Date.now());
const backendUptimeSeconds = computed(() => {
  const base = stats.value.systemUptime || 0;
  if (!statsFetchedAt.value) return base;
  const drift = Math.max(0, Math.floor((nowTick.value - statsFetchedAt.value) / 1000));
  return base + drift;
});

const fetchStats = async () => {
  try {
    const data = await getAdminOverviewStats();
    stats.value = data;
    statsFetchedAt.value = Date.now();
  } catch (error) {
    console.error('Failed to fetch overview stats', error);
  }
};

const initChart = async () => {
  if (!visitorChartRef.value) return;
  
  try {
    const trendData = await getVisitorTrend(30);
    const dates = trendData.map(d => d.date.substring(5)); // Show MM-DD
    const counts = trendData.map(d => d.count);
    const uniqueIps = trendData.map(d => d.unique_ip);
    
    chartInstance = echarts.init(visitorChartRef.value);
    chartInstance.setOption({
      tooltip: { trigger: 'axis' },
      // 和访客日志页的图表保持一致：访问量 + 独立IP 两条
      legend: { data: ['访问量', '独立IP'], right: 0, top: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: dates },
      yAxis: { type: 'value' },
      series: [
        {
          name: '访问量',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: counts,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(64,158,255,0.5)' },
              { offset: 1, color: 'rgba(64,158,255,0.1)' }
            ])
          },
          itemStyle: { color: '#409EFF' }
        },
        {
          name: '独立IP',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: uniqueIps,
          itemStyle: { color: '#57c98a' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(87,201,138,0.28)' },
              { offset: 1, color: 'rgba(87,201,138,0.02)' }
            ])
          }
        }
      ]
    });
    
    resizeObserver = new ResizeObserver(() => {
      chartInstance?.resize();
    });
    resizeObserver.observe(visitorChartRef.value);
  } catch (error) {
    console.error('Failed to fetch visitor trend for chart', error);
  }
};

const updateTime = () => {
  currentTime.value = new Date().toLocaleString('zh-CN', { hour12: false });
  nowTick.value = Date.now();
};

const handleChartResize = () => chartInstance?.resize();

/*
 * 这几个数字要「实时跳动」：有前台访问时后端会推 visitors:new，
 * 这里做 2 秒合并再刷新一次统计（统计走的是后端缓存，很便宜）；
 * 另外每 30 秒兜底拉一次，避免漏掉事件。
 * 面板被 KeepAlive 挂起（切到别的管理页）时停掉，切回来再恢复，避免后台空转。
 */
const startLiveUpdates = () => {
  if (!unbindWS) {
    unbindWS = onWS((type: string) => {
      if (type === 'visitors:new') scheduleStatsRefresh();
    });
  }
  if (statsPollTimer === null) statsPollTimer = window.setInterval(fetchStats, 30_000);
  if (timeInterval === null) timeInterval = window.setInterval(updateTime, 1000);
  updateTime();
};

const stopLiveUpdates = () => {
  unbindWS?.();
  unbindWS = null;
  if (statsPollTimer !== null) {
    window.clearInterval(statsPollTimer);
    statsPollTimer = null;
  }
  if (timeInterval !== null) {
    window.clearInterval(timeInterval);
    timeInterval = null;
  }
  if (statsRefreshTimer !== null) {
    window.clearTimeout(statsRefreshTimer);
    statsRefreshTimer = null;
  }
};

// 首次挂载由 onMounted 启动，之后的 activated 才是「从缓存里切回来」
let mountedOnce = false;

/*
 * 下面那几张重卡（实时日志 / 数据新鲜度 / 调用拓扑 / 性能检测 / 访客分布）
 * 等浏览器空闲再挂载，首屏只留「访客趋势 + 快捷操作」两个请求，
 * 免得进后台时所有接口一起挤在服务端排队。
 */
const secondaryReady = ref(false);

const revealSecondary = () => {
  if (secondaryReady.value) return;
  secondaryReady.value = true;
};

onMounted(() => {
  fetchStats();
  initChart();
  startLiveUpdates();
  mountedOnce = true;
  window.addEventListener('resize', handleChartResize);

  // 先让首屏那两张卡走完一轮请求，再挂载下面的重卡
  requestAnimationFrame(() => window.setTimeout(revealSecondary, 120));
});

onActivated(() => {
  if (!mountedOnce) return;
  startLiveUpdates();
  // 挂起期间容器尺寸可能变过，回来补一次 resize（不重新请求数据）
  chartInstance?.resize();
});

onDeactivated(stopLiveUpdates);

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleChartResize);
  stopLiveUpdates();
  if (resizeObserver) resizeObserver.disconnect();
  chartInstance?.dispose();
});
</script>

<style scoped>
.dashboard-overview {
  /* 顶部不留白：数据总览没有面板标题行，首卡要与侧边栏顶对齐 */
  padding: 0 10px 10px;
}
/* 第一行本来是 .mt-4（20px），首屏时去掉，避免卡片比侧边栏低 */
.dashboard-overview > .el-row:first-child {
  margin-top: 0;
}
.mt-4 {
  margin-top: 20px;
}

/* Element Plus 的 gutter 只产生水平间距：卡片换行竖向堆叠时补上垂直间距，
   否则下方卡片会紧贴上方卡片（例如窄屏下的「快捷操作」） */
.dashboard-overview .el-row.mt-4 {
  row-gap: 20px;
}

/* 「近30天访客趋势」与「快捷操作」并排时保持等高：
   列先拉伸到一样高，卡片再撑满列，图表跟着填满多出来的空间 */
.dashboard-overview .el-row.mt-4 > .el-col {
  display: flex;
}

.chart-card,
.quick-actions-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  /* 供下面的容器查询使用：按卡片实际宽度决定快捷操作的列数 */
  container-type: inline-size;
}

.chart-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chart-body {
  flex: 1;
  /* 上面多了「总访客数」一行，图表高度相应收一点，整行高度与「快捷操作」保持齐平 */
  min-height: 240px;
}
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* 总访客数 + 独立 IP：并进「近30天访客趋势」卡片，放在图表上方 */
.visitor-total {
  /* 三列严格等宽：每列都以图标为起点，图标之间的间距也一致 */
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 12px 16px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  /* 按卡片实际宽度分档缩放（容器查询），保证三个指标始终一行 */
  container-type: inline-size;
}
.visitor-metric {
  min-width: 0;
  display: flex;
  /* 竖排居中：图标作为中心锚点，数字与标签在下方居中 */
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}
.visitor-total-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  font-size: 22px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}
.visitor-total-icon.is-ip {
  color: var(--el-color-success);
}
.visitor-total-icon.is-region {
  color: var(--el-color-warning);
}
.stat-info {
  flex: 1;
  min-width: 0;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 2px;
  font-variant-numeric: tabular-nums;
}
.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.visitor-total .stat-value { color: var(--el-color-primary); }
.visitor-total .visitor-metric:nth-child(2) .stat-value { color: var(--el-color-success); }
.visitor-total .visitor-metric:nth-child(3) .stat-value { color: var(--el-color-warning); }

/* 空间不足时整体缩一档：图标、字号、间距一起收 */
@container (max-width: 520px) {
  .visitor-total { gap: 10px; }
  .visitor-metric { gap: 8px; }
  .visitor-total-icon {
    width: 34px;
    height: 34px;
    font-size: 17px;
    border-radius: 10px;
  }
  .stat-value { font-size: 18px; }
  .stat-label { font-size: 12px; }
}

@container (max-width: 420px) {
  .visitor-total { gap: 8px; }
  .visitor-metric { gap: 6px; }
  .visitor-total-icon {
    width: 28px;
    height: 28px;
    font-size: 15px;
    border-radius: 8px;
  }
  .stat-value { font-size: 16px; }
  .stat-label { font-size: 11px; }
}

/* 再窄就只留数字，图标让位 */
@container (max-width: 320px) {
  .visitor-total-icon { display: none; }
  .stat-value { font-size: 15px; }
  .stat-label { font-size: 10px; }
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.actions-grid {
  display: grid;
  /* 6 个按钮：宽卡片 3×2，窄卡片 2×3（下面容器查询） */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

/* 卡片偏窄时固定 2 列 = 2×3，避免按钮挤成小方块 */
@container (max-width: 700px) {
  .actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.actions-grid .el-button {
  width: 100%;
  height: 50px;
  justify-content: flex-start;
  padding-left: 20px;
  font-size: 15px;
}

/* Element Plus 默认给相邻按钮加 margin-left，在 grid 里会把列撑偏、导致换行后不对齐 */
.actions-grid .el-button + .el-button {
  margin-left: 0;
}

/* 「脚本拦截」是第 7 个按钮，让它独占一行，别在 3 列网格里落单 */
.actions-grid .el-button.is-wide {
  grid-column: 1 / -1;
}
.actions-grid .el-icon {
  margin-right: 8px;
  font-size: 18px;
}

.system-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 15px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: var(--el-fill-color-light);
  border-radius: 6px;
}

.info-label {
  color: var(--el-text-color-regular);
  font-weight: 500;
}

.info-value {
  font-family: monospace;
  color: var(--el-text-color-primary);
  font-weight: bold;
}

@media (max-width: 768px) {
  /* 指标块的缩放交给上面的容器查询（按卡片实际宽度分档），这里不再覆盖 */
}
</style>
