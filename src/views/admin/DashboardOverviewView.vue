<template>
  <div class="dashboard-overview">
    <el-row :gutter="20">
      <el-col :xs="12" :sm="12" :md="8" :lg="4" class="stat-col">
        <el-card shadow="hover" class="stat-card visitor-card">
          <div class="stat-content">
            <el-icon class="stat-icon"><User /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.visitorCount.toLocaleString() }}</div>
              <div class="stat-label">总访客数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="8" :lg="4" class="stat-col">
        <el-card shadow="hover" class="stat-card app-card">
          <div class="stat-content">
            <el-icon class="stat-icon"><Grid /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.appCount.toLocaleString() }}</div>
              <div class="stat-label">应用总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="8" :lg="4" class="stat-col">
        <el-card shadow="hover" class="stat-card article-card">
          <div class="stat-content">
            <el-icon class="stat-icon"><Document /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.articleCount.toLocaleString() }}</div>
              <div class="stat-label">文章总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="8" :lg="4" class="stat-col">
        <el-card shadow="hover" class="stat-card feedback-card">
          <div class="stat-content">
            <el-icon class="stat-icon"><Message /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.feedbackCount.toLocaleString() }}</div>
              <div class="stat-label">待处理反馈</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="8" :lg="4" class="stat-col">
        <el-card shadow="hover" class="stat-card comment-card">
          <div class="stat-content">
            <el-icon class="stat-icon"><ChatDotRound /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ stats.commentCount.toLocaleString() }}</div>
              <div class="stat-label">待审评论</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="8" :lg="4" class="stat-col">
        <el-card shadow="hover" class="stat-card uptime-card">
          <div class="stat-content">
            <el-icon class="stat-icon"><Timer /></el-icon>
            <div class="stat-info">
              <div class="stat-value">{{ formatUptime(stats.systemUptime) }}</div>
              <div class="stat-label">系统运行时间</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-4">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>近30天访客趋势</span>
              <el-button link type="primary" @click="$emit('switch-tab', 'visitors')">详细数据</el-button>
            </div>
          </template>
          <div ref="visitorChartRef" style="height: 300px;"></div>
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
          </div>
          
          <el-divider />
          
          <div class="system-info">
            <div class="info-item">
              <span class="info-label">Node.js 版本</span>
              <span class="info-value">{{ nodeVersion }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">系统时间</span>
              <span class="info-value">{{ currentTime }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { User, Grid, Document, Message, ChatDotRound, Timer, Edit, Bell, Setting, Warning } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { getAdminOverviewStats, getVisitorTrend } from '../../services/admin';

defineProps<{ embedded?: boolean }>();
defineEmits(['switch-tab']);

const stats = ref({
  visitorCount: 0,
  appCount: 0,
  feedbackCount: 0,
  commentCount: 0,
  articleCount: 0,
  systemUptime: 0
});

const visitorChartRef = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let timeInterval: number | null = null;
const currentTime = ref('');

// Helper to safely get node version if available in browser
const getNodeVersion = () => {
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      return 'v' + process.versions.node;
    }
  } catch (e) {
    // ignore
  }
  return '未知 (Browser)';
};

const nodeVersion = ref(getNodeVersion());

const formatUptime = (seconds: number) => {
  if (!seconds) return '0天';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  if (d > 0) return `${d}天${h}小时`;
  return `${h}小时`;
};

const fetchStats = async () => {
  try {
    const data = await getAdminOverviewStats();
    stats.value = data;
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
.stat-col {
  margin-bottom: 20px;
}
.stat-card {
  border-radius: 8px;
  border: none;
}
.stat-content {
  display: flex;
  align-items: center;
  padding: 10px 5px;
}
.stat-icon {
  font-size: 48px;
  margin-right: 15px;
  padding: 15px;
  border-radius: 12px;
  color: #fff;
}
.stat-info {
  flex: 1;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  line-height: 1.2;
  margin-bottom: 4px;
}
.stat-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

/* Colors for stat cards */
.visitor-card .stat-icon { background: linear-gradient(135deg, #409EFF, #53a8ff); }
.visitor-card .stat-value { color: #409EFF; }

.app-card .stat-icon { background: linear-gradient(135deg, #67C23A, #85ce61); }
.app-card .stat-value { color: #67C23A; }

.article-card .stat-icon { background: linear-gradient(135deg, #E6A23C, #ebb563); }
.article-card .stat-value { color: #E6A23C; }

.feedback-card .stat-icon { background: linear-gradient(135deg, #F56C6C, #f78989); }
.feedback-card .stat-value { color: #F56C6C; }

.comment-card .stat-icon { background: linear-gradient(135deg, #909399, #a6a9ad); }
.comment-card .stat-value { color: #909399; }

.uptime-card .stat-icon { background: linear-gradient(135deg, #8e44ad, #b370cf); }
.uptime-card .stat-value { color: #8e44ad; font-size: 20px; }

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
  .stat-icon {
    font-size: 36px;
    padding: 10px;
  }
  .stat-value {
    font-size: 20px;
  }
}
</style>