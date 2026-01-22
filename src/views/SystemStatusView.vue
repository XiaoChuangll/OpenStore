<template>
  <div class="detail-view-wrapper">
    <div class="detail-view">
      <el-page-header @back="goBack" class="page-header">
        <template #content>
          <div class="page-header-content">
            <span class="page-title"> 系统状态详细监控 </span>
            <el-tag :type="isSystemHealthy ? 'success' : 'danger'" class="status-tag">
              {{ isSystemHealthy ? '系统正常' : '部分异常' }}
            </el-tag>
          </div>
        </template>
      </el-page-header>

      <el-row :gutter="20">
        <!-- VITE_API_TARGET Monitor -->
        <el-col :xs="24" :md="12" class="monitor-col">
          <el-card class="info-card h-100" shadow="hover">
            <template #header>
              <div class="card-header">
                <span class="monitor-title">主 API 服务</span>
                <el-tag :type="targets.api.online ? 'success' : 'danger'" size="small">
                  {{ targets.api.online ? '在线' : '离线' }}
                </el-tag>
              </div>
            </template>
            <div class="info-list">
              <div class="info-item">
                <span class="label">目标地址 (VITE_API_TARGET)</span>
              </div>
              <div class="info-item">
                <span class="label">响应时间</span>
                <span class="value" :class="getLatencyClass(targets.api.latency)">
                  {{ targets.api.latency ? targets.api.latency + 'ms' : '-' }}
                </span>
              </div>
              <div class="info-item">
                <span class="label">最后检测</span>
                <span class="value">{{ targets.api.lastCheck || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="label">状态描述</span>
                <span class="value">{{ targets.api.statusText }}</span>
              </div>
            </div>
            <div class="actions">
              <el-button type="primary" size="small" :loading="targets.api.checking" @click="checkTarget('api')">
                立即检测
              </el-button>
            </div>
          </el-card>
        </el-col>

        <!-- VITE_NEXT_API_TARGET Monitor -->
        <el-col :xs="24" :md="12" class="monitor-col">
          <el-card class="info-card h-100" shadow="hover">
            <template #header>
              <div class="card-header">
                <span class="monitor-title">副 API 服务</span>
                <el-tag :type="targets.nextApi.online ? 'success' : 'danger'" size="small">
                  {{ targets.nextApi.online ? '在线' : '离线' }}
                </el-tag>
              </div>
            </template>
            <div class="info-list">
              <div class="info-item">
                <span class="label">目标地址 (VITE_NEXT_API_TARGET)</span>
              </div>
              <div class="info-item">
                <span class="label">响应时间</span>
                <span class="value" :class="getLatencyClass(targets.nextApi.latency)">
                  {{ targets.nextApi.latency ? targets.nextApi.latency + 'ms' : '-' }}
                </span>
              </div>
              <div class="info-item">
                <span class="label">最后检测</span>
                <span class="value">{{ targets.nextApi.lastCheck || '-' }}</span>
              </div>
              <div class="info-item">
                <span class="label">状态描述</span>
                <span class="value">{{ targets.nextApi.statusText }}</span>
              </div>
            </div>
            <div class="actions">
              <el-button type="primary" size="small" :loading="targets.nextApi.checking" @click="checkTarget('nextApi')">
                立即检测
              </el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';

const router = useRouter();

const goBack = () => {
  router.back();
};

const targets = ref({
  api: {
    url: import.meta.env.VITE_API_TARGET,
    proxyPath: '/api/v0', // 通过本站代理访问
    online: false,
    latency: 0,
    lastCheck: '',
    statusText: '等待检测...',
    checking: false
  },
  nextApi: {
    url: import.meta.env.VITE_NEXT_API_TARGET,
    proxyPath: '/next-api/apps/devices', // 通过本站代理访问，使用存在的接口
    online: false,
    latency: 0,
    lastCheck: '',
    statusText: '等待检测...',
    checking: false
  }
});

const isSystemHealthy = computed(() => {
  return targets.value.api.online && targets.value.nextApi.online;
});

const getLatencyClass = (latency: number) => {
  if (!latency) return '';
  if (latency < 200) return 'text-success';
  if (latency < 500) return 'text-warning';
  return 'text-danger';
};

const checkTarget = async (key: 'api' | 'nextApi') => {
  const target = targets.value[key];
  target.checking = true;
  target.statusText = '正在检测...';
  
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // 使用本站代理路径进行 GET 请求
    // @ts-ignore
    const requestUrl = target.proxyPath || target.url;

    const response = await fetch(requestUrl, { 
      method: 'GET', 
      headers: {
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    const endTime = performance.now();
    target.latency = Math.round(endTime - startTime);
    
    // 只要有响应且状态码正常，视为在线
    if (response.ok) {
      target.online = true;
      target.statusText = '连接正常';
    } else {
      // 即使是非200响应，只要不是5xx服务器错误，通常也意味着服务进程在运行
      // 但为了准确性，我们显示具体状态
      target.online = response.status < 500;
      target.statusText = `状态异常: ${response.status}`;
    }
  } catch (error) {
    target.online = false;
    target.latency = 0;
    target.statusText = '连接失败: ' + (error instanceof Error ? error.message : '未知错误');
  } finally {
    target.lastCheck = dayjs().format('YYYY-MM-DD HH:mm:ss');
    target.checking = false;
  }
};

let autoCheckTimer: number | null = null;

onMounted(() => {
  checkTarget('api');
  checkTarget('nextApi');
  
  // 每 30 秒自动检测一次
  autoCheckTimer = window.setInterval(() => {
    checkTarget('api');
    checkTarget('nextApi');
  }, 30000);
});

onUnmounted(() => {
  if (autoCheckTimer) {
    clearInterval(autoCheckTimer);
  }
});
</script>

<style scoped>
.detail-view-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  animation: fadeIn 0.5s ease-out;
}

.page-header {
  margin-bottom: 20px;
}

.page-header-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.monitor-title {
  font-weight: 600;
  font-size: 16px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.info-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.label {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.value {
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.value.link {
  color: var(--el-color-primary);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 4px;
}

.value.link:hover {
  text-decoration: underline;
}

.text-success {
  color: var(--el-color-success);
}

.text-warning {
  color: var(--el-color-warning);
}

.text-danger {
  color: var(--el-color-danger);
}

.actions {
  margin-top: 16px;
  display: flex;
}

.actions .el-button {
  width: 100%;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
  .detail-view-wrapper {
    padding: 10px;
  }
  
  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}

.monitor-col {
  margin-bottom: 20px;
}
</style>
