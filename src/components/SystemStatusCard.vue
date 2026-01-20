<template>
  <el-card class="system-status-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span>系统状态监控</span>
        <div class="status-summary">
          <el-tag :type="isSystemOnline ? 'success' : 'danger'" size="small" effect="light" class="online-tag">
            <span class="tag-content">
              <span class="status-dot" :class="{ 'is-active': isSystemOnline }"></span>
              <span>{{ isSystemOnline ? '系统在线' : '连接中断' }}</span>
            </span>
          </el-tag>
        </div>
      </div>
    </template>
    <el-row :gutter="20">
      <el-col :span="8" :xs="24">
        <div class="status-item">
          <span class="label">后端接口</span>
          <div class="value">
            <el-icon :class="isSystemOnline ? 'text-success' : 'text-danger'"><Connection /></el-icon>
            <span :class="isSystemOnline ? 'text-success' : 'text-danger'">
              {{ isSystemOnline ? '连接正常' : '连接失败' }}
            </span>
          </div>
        </div>
      </el-col>
      <el-col :span="8" :xs="24">
        <div class="status-item">
          <span class="label">图表状态</span>
          <div class="value">
            <el-icon v-if="isLoading" class="is-loading"><Loading /></el-icon>
            <el-icon v-else class="text-success"><CircleCheck /></el-icon>
            <span :class="!isLoading ? 'text-success' : ''">{{ isLoading ? '数据加载中...' : '渲染就绪' }}</span>
          </div>
        </div>
      </el-col>
      <el-col :span="8" :xs="24">
        <div class="status-item">
          <span class="label">数据状态</span>
          <div class="value">
            <el-icon class="is-loading-reverse" :class="isStreamConnected ? 'text-success' : 'text-gray'"><Refresh /></el-icon>
            <span :class="isStreamConnected ? 'text-success' : 'text-gray'">
               {{ streamStatusText }}
             </span>
          </div>
        </div>
      </el-col>
    </el-row>

    <div v-if="syncStatus" class="sync-details">
      <el-divider class="sync-divider" />
      <el-row :gutter="20">
        <el-col :span="12" :xs="12">
          <div class="stat-item item-primary">
            <div class="stat-label">距下次同步时间</div>
            <div class="stat-value">
              <el-tag effect="dark" round size="large" class="stat-tag">
                {{ syncStatus.nextSyncTime || '--' }}
              </el-tag>
            </div>
          </div>
        </el-col>
        <el-col :span="12" :xs="12">
          <div class="stat-item item-info">
            <div class="stat-label">{{ syncStatus.isSyncing ? '本次同步已用时' : '上次同步已用时' }}</div>
            <div class="stat-value">
              <el-tag effect="dark" round size="large" type="info" class="stat-tag">
                {{ syncStatus.lastSyncDuration || '--' }}
              </el-tag>
            </div>
          </div>
        </el-col>
        <el-col :span="12" :xs="12">
          <div class="stat-item item-success">
            <div class="stat-label">已插入应用数量</div>
            <div class="stat-value">
              <el-tag effect="dark" round size="large" type="success" class="stat-tag">
                {{ formatNumber(syncStatus.insertedCount) }}
              </el-tag>
            </div>
          </div>
        </el-col>
        <el-col :span="12" :xs="12">
          <div class="stat-item item-primary">
            <div class="stat-label">共处理应用数量</div>
            <div class="stat-value">
              <el-tag effect="dark" round size="large" class="stat-tag">
                {{ formatNumber(syncStatus.processedCount) }}
              </el-tag>
            </div>
          </div>
        </el-col>
        <el-col :span="12" :xs="12">
          <div class="stat-item item-danger">
            <div class="stat-label">已失败应用数量</div>
            <div class="stat-value">
              <el-tag effect="dark" round size="large" type="danger" class="stat-tag">
                {{ formatNumber(syncStatus.failedCount) }}
              </el-tag>
            </div>
          </div>
        </el-col>
        <el-col :span="12" :xs="12">
          <div class="stat-item item-warning">
            <div class="stat-label">已跳过应用数量</div>
            <div class="stat-value">
              <el-tag effect="dark" round size="large" type="warning" class="stat-tag">
                {{ formatNumber(syncStatus.skippedCount) }}
              </el-tag>
            </div>
          </div>
        </el-col>
      </el-row>
      <div class="sync-progress" v-if="syncStatus.isSyncing">
        <div v-if="syncStatus.totalExpected > 0">
           <el-progress 
             :percentage="syncStatus.percentage" 
             :stroke-width="12" 
             striped 
             striped-flow 
             :duration="20"
           >
             <template #default>
               <span class="progress-text">
                 {{ formatNumber(syncStatus.processedCount) }}/{{ formatNumber(syncStatus.totalExpected) }} 
                 [{{ syncStatus.elapsedTimeConcise }}&lt;{{ syncStatus.remainingTime }}]
               </span>
             </template>
           </el-progress>
        </div>
        <div v-else>
           <el-progress :percentage="50" :indeterminate="true" :duration="2" :show-text="false" striped striped-flow />
        </div>
      </div>
    </div>

    <div v-else-if="lastStreamMessage" class="stream-log">
       <span class="log-label">同步日志:</span> {{ lastStreamMessage }}
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Connection, Loading, CircleCheck, Refresh } from '@element-plus/icons-vue';
import { hmApi } from '../services/hm-api';

interface SyncStatus {
  nextSyncTime: string;
  lastSyncDuration: string;
  insertedCount: number;
  processedCount: number;
  failedCount: number;
  skippedCount: number;
  isSyncing: boolean;
  totalExpected: number;
  remainingTime: string;
  percentage: number;
  elapsedTimeConcise: string;
}

const isLoading = hmApi.isLoading;
const isStreamConnected = ref(false);
const isStreamConnecting = ref(true);
const lastStreamMessage = ref('');
const syncStatus = ref<SyncStatus | null>(null);
const retryCount = ref(0);
const nextSyncSeconds = ref(0);
const isSyncingActive = ref(false);
let eventSource: EventSource | null = null;
let retryTimer: any = null;
let countdownInterval: any = null;

const isSystemOnline = computed(() => isStreamConnected.value || !retryCount.value);

const displayNextSyncTime = computed(() => {
  if (isSyncingActive.value) return '正在同步中...';
  return formatDuration(nextSyncSeconds.value);
});

const streamStatusText = computed(() => {
  if (isSyncingActive.value) return '正在同步中';
  if (isStreamConnected.value) return '实时同步';
  if (isStreamConnecting.value) return '正在连接...';
  return '未连接';
});

const formatNumber = (num: number | undefined) => {
  if (num === undefined) return '0';
  return num.toLocaleString();
};

const formatDuration = (secs: number) => {
  if (!secs && secs !== 0) return '--';
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
};

const formatDurationConcise = (secs: number) => {
  if (!secs && secs !== 0) return '00:00';
  const minutes = Math.floor(secs / 60);
  const seconds = secs % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const connectStream = () => {
  if (eventSource) {
    eventSource.close();
  }

  isStreamConnecting.value = true;
  const streamUrl = '/api/v0/sync_status/stream';
  
  eventSource = new EventSource(streamUrl);

  const handleMessage = (event: MessageEvent) => {
    try {
        const data = JSON.parse(event.data);
        const nextSyncSecs = data.next_sync_countdown?.secs || 0;
        
        // Update local countdown logic
        nextSyncSeconds.value = nextSyncSecs;
        isSyncingActive.value = nextSyncSecs === 0;

        const elapsedSecs = data.elapsed_time?.secs || 0;
        
        let processed = Number(data.total_processed || 0);
        let totalExpected = Number(data.total_expected || data.total_count || data.total_apps || 0);

        // Prioritize 'progress' array if available [current, total]
        if (Array.isArray(data.progress) && data.progress.length >= 2) {
            processed = Number(data.progress[0]);
            totalExpected = Number(data.progress[1]);
        }
        
        let percentage = 0;
        let remainingTime = '--:--';
        
        if (totalExpected > 0) {
            percentage = Math.min(Math.round((processed / totalExpected) * 100), 100);
            
            if (processed > 0 && elapsedSecs > 0) {
                const rate = processed / elapsedSecs;
                const remainingCount = totalExpected - processed;
                if (remainingCount > 0) {
                    const remainingSecs = Math.floor(remainingCount / rate);
                    remainingTime = formatDurationConcise(remainingSecs);
                } else {
                    remainingTime = '00:00';
                }
            }
        }

        syncStatus.value = {
          nextSyncTime: displayNextSyncTime.value,
          lastSyncDuration: formatDuration(elapsedSecs),
          insertedCount: Number(data.total_inserted || 0),
          processedCount: processed,
          failedCount: Number(data.total_failed || 0),
          skippedCount: Number(data.total_skipped || 0),
          isSyncing: isSyncingActive.value,
          totalExpected,
          remainingTime,
          percentage,
          elapsedTimeConcise: formatDurationConcise(elapsedSecs)
        };
        lastStreamMessage.value = ''; // Clear raw message if parsed successfully
    } catch (e) {
        // syncStatus.value = null; // Don't clear status on single error to prevent flickering
        lastStreamMessage.value = String(event.data);
        console.warn('Failed to parse stream data:', e);
    }
  };

  eventSource.onopen = () => {
    isStreamConnected.value = true;
    isStreamConnecting.value = false;
    retryCount.value = 0;
    console.log('[SystemStatus] Stream connected');
  };

  // Start local countdown
  if (!countdownInterval) {
    countdownInterval = setInterval(() => {
      if (nextSyncSeconds.value > 0) {
        nextSyncSeconds.value--;
      }
      
      // Update display in syncStatus if it exists
      if (syncStatus.value) {
        syncStatus.value.nextSyncTime = displayNextSyncTime.value;
        syncStatus.value.isSyncing = isSyncingActive.value;
      }
    }, 1000);
  }

  eventSource.onmessage = handleMessage;
  eventSource.addEventListener('sync_status', handleMessage);

  eventSource.onerror = (err) => {
    console.warn('[SystemStatus] Stream error', err);
    isStreamConnected.value = false;
    isStreamConnecting.value = false;
    eventSource?.close();
    
    // Retry logic
    retryCount.value++;
    const timeout = Math.min(5000 * retryCount.value, 30000);
    console.log(`[SystemStatus] Retrying in ${timeout}ms...`);
    
    retryTimer = setTimeout(() => {
      connectStream();
    }, timeout);
  };
};

onMounted(() => {
  connectStream();
});

onUnmounted(() => {
  if (eventSource) {
    eventSource.close();
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
</script>

<style scoped>
.system-status-card {
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
  margin-bottom: 10px;
}
.status-item .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.status-item .value {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.text-success {
  color: var(--el-color-success);
}
.text-danger {
  color: var(--el-color-danger);
}
.text-gray {
  color: var(--el-text-color-secondary);
}
.stream-log {
  margin-top: 15px;
  padding: 10px;
  background-color: #303133;
  color: #67C23A;
  font-family: monospace;
  font-size: 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-label {
  color: #fff;
  font-weight: bold;
  margin-right: 5px;
}

.sync-details {
  margin-top: 10px;
}
.sync-divider {
  margin: 15px 0;
}
.stat-item {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  margin-bottom: 12px;
  text-align: left;
  display: flex;
  flex-direction: row; /* Change to row for desktop */
  align-items: center; /* Center vertically */
  justify-content: space-between; /* Space between label and value */
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 0; /* Remove bottom margin */
  padding-left: 12px;
  width: auto; /* Auto width */
  text-align: left;
  position: relative;
}

/* Desktop Label Border */
.stat-item .stat-label::before {
  content: '';
  position: absolute;
  left: 0;
  top: 2px;
  bottom: 2px;
  width: 4px;
  border-radius: 2px;
  background-color: var(--el-color-primary);
}
.stat-item.item-success .stat-label::before { background-color: var(--el-color-success); }
.stat-item.item-warning .stat-label::before { background-color: var(--el-color-warning); }
.stat-item.item-danger .stat-label::before { background-color: var(--el-color-danger); }

.stat-value {
  width: auto; /* Auto width */
  display: block;
  text-align: right; /* Right align value */
}

.stat-item :deep(.el-tag) {
  background-color: transparent !important;
  border: none !important;
  padding: 0 !important;
  height: auto !important;
  line-height: 1.2 !important;
  font-size: 16px !important;
  font-weight: 600 !important;
  color: var(--el-text-color-primary) !important;
  display: block !important;
  position: relative;
}

.stat-item :deep(.el-tag)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  border-radius: 2px;
  display: none;
}

.stat-item :deep(.el-tag--dark):not(.el-tag--success):not(.el-tag--warning):not(.el-tag--danger)::before,
.stat-item :deep(.el-tag--primary)::before {
  background-color: var(--el-color-primary);
}

.stat-item :deep(.el-tag--success)::before {
  background-color: var(--el-color-success);
}

.stat-item :deep(.el-tag--warning)::before {
  background-color: var(--el-color-warning);
}

.stat-item :deep(.el-tag--danger)::before {
  background-color: var(--el-color-danger);
}

@media (max-width: 768px) {
  .stat-item {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .stat-label {
    margin-bottom: 8px;
    width: 100%;
  }

  /* Restore Mobile Styles */
  .stat-item .stat-label::before {
    display: none;
  }
  
  .stat-item :deep(.el-tag) {
    padding-left: 12px !important;
  }
  
  .stat-item :deep(.el-tag)::before {
    display: block;
  }
  
  .stat-value {
    width: 100%;
    text-align: left;
  }
}

.text-warning {
  color: var(--el-color-warning);
}
.sync-progress {
  margin-top: 15px;
  padding: 0 10px;
}
.progress-text {
  font-size: 12px;
  white-space: nowrap;
  margin-left: 10px;
  color: var(--el-text-color-regular);
}
.online-tag {
  border: none;
}
.tag-content {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
  display: inline-block;
  flex-shrink: 0;
}
.status-dot.is-active {
  animation: breathe 2s infinite ease-in-out;
}
@keyframes breathe {
  0% { opacity: 0.6; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.15); box-shadow: 0 0 8px currentColor; }
  100% { opacity: 0.6; transform: scale(0.95); }
}

.is-loading-reverse {
  animation: rotating-reverse 2s linear infinite;
}

@keyframes rotating-reverse {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}

@media (max-width: 768px) {
  .progress-text {
    display: none !important;
  }

  .status-item {
    flex-direction: row;
    justify-content: space-between;
    padding: 12px 16px;
  }

  .status-item .label {
    margin-bottom: 0;
  }
}
</style>