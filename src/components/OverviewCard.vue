<template>
  <el-card class="overview-card" shadow="hover" v-loading="loading">
    <template #header>
      <div class="card-header">
        <span>市场概览</span>
        <span class="installation-volume" v-if="marketInfo.app_count?.max_download_count">
          鸿蒙装机量: {{ marketInfo.app_count.max_download_count.toLocaleString() }}
        </span>
      </div>
    </template>
    <el-row :gutter="20">
      <el-col :span="6" :xs="12">
        <div class="stat-item">
          <div class="stat-label">应用总数量</div>
          <div class="stat-value">
            <el-tag effect="dark" round size="large" class="stat-tag">
              {{ marketInfo.app_count?.total || 0 }}
            </el-tag>
          </div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="stat-item">
          <div class="stat-label">元服务总数</div>
          <div class="stat-value">
            <el-tag effect="dark" round type="success" size="large" class="stat-tag">
              {{ marketInfo.app_count?.atomic_services || 0 }}
            </el-tag>
          </div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="stat-item">
          <div class="stat-label">开发者总数</div>
          <div class="stat-value">
            <el-tag effect="dark" round type="warning" size="large" class="stat-tag">
              {{ marketInfo.developer_count || 0 }}
            </el-tag>
          </div>
        </div>
      </el-col>
      <el-col :span="6" :xs="12">
        <div class="stat-item">
          <div class="stat-label">专题总数量</div>
          <div class="stat-value">
            <el-tag effect="dark" round type="danger" size="large" class="stat-tag">
              {{ marketInfo.substance_count || 0 }}
            </el-tag>
          </div>
        </div>
      </el-col>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { hmApi } from '../services/hm-api';

interface AppCount {
  apps: number;
  atomic_services: number;
  max_download_count: number;
  total: number;
}

interface MarketInfo {
  app_count: AppCount;
  developer_count: number;
  substance_count: number;
  [key: string]: any;
}

const marketInfo = ref<Partial<MarketInfo>>({});
const loading = ref(false);

const fetchMarketInfo = async () => {
  loading.value = true;
  try {
    // 使用 hmApi 进行请求，享受自动降级和缓存功能
    const response = await hmApi.get<any>('/market_info');
    // response is { success: true, data: { ... } }
    marketInfo.value = response.data || {};
  } catch (error) {
    console.error('Failed to fetch market info:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchMarketInfo();
});
</script>

<style scoped>
.overview-card {
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.installation-volume {
  font-size: 14px;
  color: #409EFF;
  font-weight: bold;
}
.stat-item {
  text-align: center;
}
.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}
.stat-value {
  display: flex;
  justify-content: center;
}
.stat-tag {
  font-size: 20px;
  font-weight: bold;
  height: 36px;
  padding: 0 20px;
}

@media (max-width: 768px) {
  .stat-item {
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
    margin-bottom: 12px;
    text-align: left;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .stat-label {
    padding-left: 12px;
    width: 100%;
    text-align: left;
  }

  .stat-value {
    width: 100%;
    display: block;
    text-align: left;
  }

  .stat-item :deep(.el-tag) {
    background-color: transparent !important;
    border: none !important;
    padding: 0 0 0 12px !important;
    height: auto !important;
    line-height: 1.2 !important;
    font-size: 24px !important;
    font-weight: bold !important;
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
}
</style>
