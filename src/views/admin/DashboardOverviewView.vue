<template>
  <div class="dashboard-overview">
    <!-- 三个指标不做等分：每张卡先按内容定基准宽度，再把剩余空间均摊填满整行 -->
    <div class="stat-row">
      <el-card shadow="hover" class="stat-card visitor-card">
        <div class="stat-content">
          <el-icon class="stat-icon"><User /></el-icon>
          <div class="stat-info">
            <div class="stat-value">{{ stats.visitorCount.toLocaleString() }}</div>
            <div class="stat-label">总访客数</div>
          </div>
        </div>
      </el-card>
      <el-card shadow="hover" class="stat-card app-card">
        <div class="stat-content">
          <el-icon class="stat-icon"><Grid /></el-icon>
          <div class="stat-info">
            <div class="stat-value">{{ stats.appCount.toLocaleString() }}</div>
            <div class="stat-label">应用总数</div>
          </div>
        </div>
      </el-card>
      <el-card shadow="hover" class="stat-card article-card">
        <div class="stat-content">
          <el-icon class="stat-icon"><Document /></el-icon>
          <div class="stat-info">
            <div class="stat-value">{{ stats.articleCount.toLocaleString() }}</div>
            <div class="stat-label">文章总数</div>
          </div>
        </div>
      </el-card>
    </div>

    <el-row :gutter="20" class="mt-4">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>近30天访客趋势</span>
              <el-button link type="primary" @click="$emit('switch-tab', 'visitors')">详细数据</el-button>
            </div>
          </template>
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
              <el-icon><Setting /></el-icon> 系统设置
            </el-button>
            <el-button type="danger" plain @click="$emit('switch-tab', 'incidents')">
              <el-icon><Warning /></el-icon> 故障维护
            </el-button>
            <el-button type="danger" plain @click="showBlockedApps = true">
              <el-icon><CircleClose /></el-icon> 异常应用
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

    <!-- 后端实时内容 -->
    <LiveLogPanel />
    <!-- 数据新鲜度 -->
    <DataFreshnessCard />
    <!-- 调用拓扑 -->
    <TopologyCard />
    <!-- 访客分布与时段热力图 -->
    <VisitorInsightsCard />

    <!-- 异常应用：屏蔽上游脏数据，首页列表不再展示 -->
    <BlockedAppsDialog v-model="showBlockedApps" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { User, Grid, Document, Edit, Bell, Setting, Warning, CircleClose } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { getAdminOverviewStats, getVisitorTrend, type AdminOverviewStats } from '../../services/admin';
import LiveLogPanel from '../../components/LiveLogPanel.vue';
import BlockedAppsDialog from '../../components/BlockedAppsDialog.vue';
import DataFreshnessCard from '../../components/DataFreshnessCard.vue';
import TopologyCard from '../../components/TopologyCard.vue';
import VisitorInsightsCard from '../../components/VisitorInsightsCard.vue';

defineProps<{ embedded?: boolean }>();
defineEmits(['switch-tab']);

const showBlockedApps = ref(false);

const stats = ref<AdminOverviewStats>({
  visitorCount: 0,
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
const currentTime = ref('');

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
    
    chartInstance = echarts.init(visitorChartRef.value);
    chartInstance.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: dates },
      yAxis: { type: 'value' },
      series: [
        {
          name: '访客数',
          type: 'line',
          smooth: true,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(64,158,255,0.5)' },
              { offset: 1, color: 'rgba(64,158,255,0.1)' }
            ])
          },
          itemStyle: { color: '#409EFF' },
          data: counts
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

onMounted(() => {
  fetchStats();
  initChart();
  
  const updateTime = () => {
    currentTime.value = new Date().toLocaleString('zh-CN', { hour12: false });
    nowTick.value = Date.now();
  };
  updateTime();
  timeInterval = window.setInterval(updateTime, 1000);
  
  window.addEventListener('resize', () => chartInstance?.resize());
});

onUnmounted(() => {
  window.removeEventListener('resize', () => chartInstance?.resize());
  if (resizeObserver) resizeObserver.disconnect();
  chartInstance?.dispose();
  if (timeInterval) clearInterval(timeInterval);
});
</script>

<style scoped>
.dashboard-overview {
  padding: 10px;
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
}

.chart-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chart-body {
  flex: 1;
  min-height: 300px;
}
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.stat-card {
  /* 基准宽度由内容决定，再一起拉伸填满整行：数字长的卡片自然更宽 */
  flex: 1 1 auto;
  min-width: 200px;
  height: 100%;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  transition: border-color 0.2s, transform 0.2s;
}

.stat-card:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-2px);
}

/* Element Plus 卡片自带 20px 内边距，这里收一档，避免和 .stat-content 重复留白 */
.stat-card :deep(.el-card__body) {
  padding: 14px 16px;
}
.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
}
.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  font-size: 22px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 12px;
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

/* Colors for stat cards */
/* 用"浅色底 + 同色系图标"替代高饱和渐变方块 */
.stat-icon {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.visitor-card .stat-icon { color: var(--el-color-primary); }
.visitor-card .stat-value { color: var(--el-color-primary); }

.app-card .stat-icon { color: var(--el-color-success); }
.app-card .stat-value { color: var(--el-color-success); }

.article-card .stat-icon { color: var(--el-color-warning); }
.article-card .stat-value { color: var(--el-color-warning); }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
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
  /* 窄屏下图标与文字改为上下排列，避免文字被挤成一字一行 */
  .stat-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 0;
  }

  .stat-icon {
    width: 40px;
    height: 40px;
    font-size: 20px;
    border-radius: 10px;
  }

  .stat-value {
    font-size: 20px;
  }

  .stat-label {
    font-size: 12.5px;
    line-height: 1.4;
  }
}
</style>
