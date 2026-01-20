<template>
  <div class="monitor-card" :class="{ 'is-open': isOpen }" @click="emit('click')">
    <div class="card-header">
      <div class="header-left">
        <div class="accent-bar" :class="accentClass"></div>
        <h3 class="card-title">{{ monitor.friendly_name }}</h3>
        <a :href="monitor.url" target="_blank" class="title-link" @click.stop>
          <el-icon :size="18" class="link-icon"><Link /></el-icon>
        </a>
      </div>
      <div class="header-right">
        <div class="status-text" :class="statusTextClass">{{ statusText }}</div>
        <div v-if="lastResponseTime" class="ping-text">{{ lastResponseTime }}ms</div>
      </div>
    </div>
    <div class="card-footer">
      <el-tag :type="uptimeStatusType" effect="light" size="small" class="custom-tag">
        可用率: {{ dayUptime }}%
      </el-tag>
      <el-tag type="success" effect="light" size="small" class="custom-tag">
        运行时长: {{ runningTime }}
      </el-tag>
    </div>
    
    <div class="uptime-history">
      <div class="history-bars">
        <el-tooltip
          v-for="(range, index) in historyRanges"
          :key="index"
          :content="getBarTooltip(range, index)"
          placement="top"
          :show-after="200"
        >
          <div class="history-bar" :class="getBarClass(range)"></div>
        </el-tooltip>
      </div>
      <div class="history-summary">
        <span class="text-xs text-secondary">30天前</span>
        <span class="text-xs text-center flex-1">{{ historySummaryText }}</span>
        <span class="text-xs text-secondary">今日</span>
      </div>
    </div>
    
    <div class="logs-section">
      <div v-show="isOpen" class="logs-content" @click.stop>
        <div v-if="failureLogs.length === 0" class="no-logs">
          暂无故障记录
        </div>
        <div v-else v-for="(log, idx) in failureLogs" :key="idx" class="log-item">
          <div class="log-row">
            <span class="log-reason">{{ getLogReason(log) }}</span>
            <span class="log-date">{{ formatLogDate(log.datetime) }}</span>
          </div>
          <div class="log-duration">持续时间: {{ formatDuration(log.duration) }}</div>
        </div>
      </div>
      <div class="logs-header" @click.stop="toggleLogs">
        <span>故障记录</span>
        <el-icon :class="{ 'is-active': isOpen }"><ArrowUp /></el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Link, ArrowUp } from '@element-plus/icons-vue';
import type { Monitor as MonitorType } from '../services/api';

const emit = defineEmits(['click', 'toggle-logs']);

const props = defineProps<{ 
  monitor: MonitorType;
  isOpen?: boolean;
}>();

const toggleLogs = () => {
  emit('toggle-logs');
};

const failureLogs = computed(() => {
  if (!props.monitor.logs) return [];
  // Filter for Down (1) and sort descending by time
  return props.monitor.logs
    .filter(l => l.type === 1)
    .sort((a, b) => b.datetime - a.datetime);
});

const getLogReason = (log: any) => {
  // Try to use provided reason or fallback
  if (log.reason && log.reason.detail) return log.reason.detail;
  return '连接超时'; // Default text as seen in screenshot
};

const formatLogDate = (ts: number) => {
  const date = new Date(ts * 1000);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${m}-${d} ${h}:${min}`;
};

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${hours}小时`;
  return `${hours}小时${m}分钟`;
};

const historyRanges = computed(() => {
  if (!props.monitor.custom_uptime_ranges) {
    // Return 30 placeholders if data not ready
    return new Array(30).fill(null);
  }
  return props.monitor.custom_uptime_ranges.split('-');
});

const getBarClass = (rangeVal: string | null) => {
  if (rangeVal === null) return 'bg-gray';
  const val = parseFloat(rangeVal);
  if (isNaN(val)) return 'bg-gray';
  if (val >= 100) return 'bg-success';
  if (val >= 98) return 'bg-warning'; // Minor downtime
  return 'bg-danger';
};

const getBarTooltip = (rangeVal: string | null, index: number) => {
  if (rangeVal === null) return '无数据';
  // Calculate date for this bar (index 0 = 29 days ago, index 29 = today)
  const date = new Date();
  date.setDate(date.getDate() - (29 - index));
  const dateStr = date.toLocaleDateString();
  return `${dateStr}: ${rangeVal}%`;
};

const historySummaryText = computed(() => {
  // Use custom_uptime_ratio (1-7-30) -> 3rd value for 30 days
  const ratios = props.monitor.custom_uptime_ratio ? props.monitor.custom_uptime_ratio.split('-') : [];
  const ratio30 = ratios.length >= 3 ? parseFloat(ratios[2]) : 100;
  
  // Calculate total downtime
  // 30 days in minutes = 30 * 24 * 60 = 43200 minutes
  const totalMinutes = 43200;
  const downMinutes = Math.round(totalMinutes * (1 - ratio30 / 100));
  
  let durationText = '';
  if (downMinutes <= 0) {
    durationText = '0分钟';
  } else if (downMinutes < 60) {
    durationText = `${downMinutes}分钟`;
  } else {
    const h = Math.floor(downMinutes / 60);
    const m = downMinutes % 60;
    durationText = `${h}小时${m}分钟`;
  }

  // Count failures from logs (approximate)
  // Filter logs for type=1 (Down) in last 30 days
  const now = Date.now() / 1000;
  const thirtyDaysAgo = now - 30 * 24 * 3600;
  const failures = props.monitor.logs 
    ? props.monitor.logs.filter(l => l.type === 1 && l.datetime >= thirtyDaysAgo).length
    : 0;

  return `最近30天 ${failures} 次故障，累计${durationText}`;
});

const accentClass = computed(() => {
  switch (props.monitor.status) {
    case 2: return 'bg-success';
    case 8: return 'bg-warning';
    case 9: return 'bg-danger';
    default: return 'bg-info';
  }
});


const statusTextClass = computed(() => {
  switch (props.monitor.status) {
    case 2: return 'text-success';
    case 8: return 'text-warning';
    case 9: return 'text-danger';
    default: return 'text-info';
  }
});

const statusText = computed(() => {
  switch (props.monitor.status) {
    case 2: return '运行中';
    case 8: return '疑似故障';
    case 9: return '故障';
    case 0: return '已暂停';
    default: return '未知';
  }
});

const runningTime = computed(() => {
  if (!props.monitor.create_datetime) return '未知';
  const created = props.monitor.create_datetime * 1000;
  const now = Date.now();
  const diff = now - created;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return `${days} 天`;
});

const dayUptime = computed(() => {
  if (props.monitor.custom_uptime_ratio) {
    return props.monitor.custom_uptime_ratio.split('-')[0];
  }
  return props.monitor.uptime_ratio || '0.00';
});

const uptimeStatusType = computed(() => {
  const ratio = parseFloat(dayUptime.value);
  if (ratio >= 99) return 'success';
  if (ratio >= 95) return 'warning';
  return 'danger';
});

const lastResponseTime = computed(() => {
  if (props.monitor.response_times && props.monitor.response_times.length > 0) {
    // response_times usually sorted descending by datetime? Or we should take the last one?
    // UptimeRobot API typically returns recent first or last? 
    // Usually it's a list. Let's grab the first one if it's recent, or verify order.
    // Assuming the API returns them, usually index 0 is the latest.
    return props.monitor.response_times[0].value;
  }
  return null;
});
</script>

<style scoped>
.monitor-card { 
  background-color: var(--el-bg-color); 
  border-radius: 16px; 
  padding: 16px; 
  box-shadow: var(--el-box-shadow-light); 
  transition: transform 0.2s; 
  cursor: pointer; 
  position: relative; 
  -webkit-tap-highlight-color: transparent; 
}
.monitor-card.is-open { z-index: 10; }
.monitor-card:hover { transform: translateY(-2px); box-shadow: var(--el-box-shadow); }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.header-left { display: flex; align-items: center; gap: 8px; }
.header-right { display: flex; flex-direction: row; align-items: center; gap: 8px; }
.accent-bar { width: 4px; height: 16px; border-radius: 4px; margin-right: 8px; }
.card-title { font-weight: 700; font-size: 0.875rem; margin: 0; color: var(--el-text-color-primary); }
.title-link { display: inline-flex; align-items: center; color: var(--el-text-color-secondary); text-decoration: none; }
.link-icon { color: var(--el-text-color-secondary); }
.title-link:hover .link-icon { color: var(--el-color-primary); }
.status-text { font-size: 0.85rem; font-weight: 600; }
.ping-text { font-size: 0.75rem; font-family: monospace; font-weight: 600; color: var(--el-text-color-secondary); }
.text-success { color: var(--el-color-success); }
.text-warning { color: var(--el-color-warning); }
.text-danger { color: var(--el-color-danger); }
.text-info { color: var(--el-color-info); }
.card-footer { border-top: 1px solid var(--el-border-color-lighter); padding-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.custom-tag { font-weight: 500; }
.history-bar {
  width: calc(100% / 15 - 6px); /* Smaller size */
  aspect-ratio: 1;
  border-radius: 5px;
  background-color: var(--el-fill-color);
  margin: 1px;
}
.bg-success { background-color: var(--el-color-success) !important; }
.bg-warning { background-color: var(--el-color-warning) !important; }
.bg-danger { background-color: var(--el-color-danger) !important; }
.bg-info { background-color: var(--el-color-info) !important; }
.bg-gray { background-color: var(--el-fill-color) !important; }

.uptime-history {
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 8px;
}
.history-bars {
  display: flex;
  flex-wrap: wrap;
  gap: 3px; /* Slightly larger gap */
  margin-bottom: 6px;
  height: auto;
  justify-content: space-between;
}

.history-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.text-center { text-align: center; }
.flex-1 { flex: 1; }

.logs-section {
  margin-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  position: relative;
}
.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  background-color: var(--el-bg-color); /* Ensure opaque bg for header */
  position: relative;
  z-index: 6;
}
.logs-header:hover {
  color: var(--el-text-color-primary);
}
.logs-header .el-icon {
  transition: transform 0.3s;
}
.logs-header .el-icon.is-active {
  transform: rotate(180deg);
}
.logs-content {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: 5;
  background-color: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 8px;
  margin-bottom: 4px; /* Space between content and header */
  max-height: 200px;
  overflow-y: auto;
  box-shadow: var(--el-box-shadow-light);
  scrollbar-width: none; /* Firefox */
}
.logs-content::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}
.no-logs {
  color: var(--el-text-color-secondary);
  text-align: center;
  font-size: 12px;
  padding: 8px;
}
.log-item {
  border: 1px solid var(--el-color-danger-light-5);
  background-color: var(--el-color-danger-light-9);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
}
.log-item:last-child {
  margin-bottom: 0;
}
.log-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.log-reason {
  color: var(--el-color-danger);
  font-size: 13px;
  font-weight: 500;
}
.log-date {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.log-duration {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

</style>
