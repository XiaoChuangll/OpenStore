<template>
  <div class="app-dashboard-view" v-loading="loading">
    <div class="app-detail-container" v-if="appDetail">
      <!-- Header -->
      <div class="app-header">
        <div class="app-header-left">
          <el-image :src="appDetail.icon_url" class="app-icon" fit="cover">
            <template #error>
              <div class="image-slot">
                <el-icon><Picture /></el-icon>
              </div>
            </template>
          </el-image>
          <div class="app-title-block">
            <h1 class="app-name">{{ appDetail.name }}</h1>
            <div class="app-subtitle">
              {{ appDetail.developer_name || '—' }} · {{ appDetail.pkg_name || '—' }}
            </div>
            <div class="app-actions">
              <el-button type="primary" round @click="handleInstall">
                获取
              </el-button>
              <el-button round @click="copyLink">
                <el-icon><Share /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
        <div class="app-header-right">
          <el-button @click="$router.back()" circle>
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>



      <!-- Description -->
      <div class="description-section">
        <h3 class="section-title">应用介绍</h3>
        <p class="description-text">{{ appDetail.description || appDetail.intro || '暂无介绍' }}</p>
      </div>
      
      <!-- New Features -->
      <div class="description-section" v-if="appDetail.new_features || appDetail.upgrade_msg">
        <h3 class="section-title">新版本特性</h3>
        <p class="description-text">{{ appDetail.new_features || appDetail.upgrade_msg }}</p>
      </div>

      <!-- Meta Grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">分类</div>
          <div class="meta-value">{{ appDetail.kind_name || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">评分</div>
          <div class="meta-value">{{ appDetail.average_rating || appDetail.rating_score || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">下载量</div>
          <div class="meta-value">{{ appDetail.download_count_str || appDetail.down_count_desc || appDetail.down_count || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">大小</div>
          <div class="meta-value">{{ appDetail.size_str || formatSize(appDetail.size) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">版本</div>
          <div class="meta-value">{{ appDetail.version || appDetail.app_version || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">更新时间</div>
          <div class="meta-value">{{ formatDate(appDetail.updated_at || appDetail.update_time) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">包名</div>
          <div class="meta-value pkg-name" :title="appDetail.pkg_name">{{ appDetail.pkg_name || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">开发者</div>
          <div class="meta-value">{{ appDetail.developer_name || '—' }}</div>
        </div>
      </div>
      
      <!-- Privacy Policy -->
      <div class="meta-grid" v-if="appDetail.privacy_url">
        <div class="meta-item full-width privacy-item">
          <div class="meta-label">隐私政策</div>
          <div class="meta-value">
            <a :href="appDetail.privacy_url" target="_blank" style="text-decoration: none;">
              <el-button round size="small">
                查看隐私政策
                <i class="fas fa-external-link-alt el-icon--right"></i>
              </el-button>
            </a>
          </div>
        </div>
      </div>

    </div>
    
    <el-empty v-else-if="!loading" description="未找到应用信息" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Picture, Share, Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getAppDetail } from '../services/next-api';
import { useLayoutStore } from '../stores/layout';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();
const loading = ref(false);
const appDetail = ref<any>(null);

const formatSize = (bytes: number | string) => {
  if (!bytes) return '—';
  const num = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (isNaN(num)) return '—';
  if (num < 1024) return num + ' B';
  if (num < 1024 * 1024) return (num / 1024).toFixed(2) + ' KB';
  if (num < 1024 * 1024 * 1024) return (num / 1024 / 1024).toFixed(2) + ' MB';
  return (num / 1024 / 1024 / 1024).toFixed(2) + ' GB';
};

const formatDate = (date: string | number) => {
  if (!date) return '—';
  return new Date(date).toLocaleString();
};

const copyLink = () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    ElMessage.success('链接已复制');
  }).catch(() => {
    ElMessage.error('复制失败');
  });
};

const handleInstall = () => {
  if (!appDetail.value) return;
  
  const appId = appDetail.value.app_id || appDetail.value.id;
  if (!appId) {
    ElMessage.warning('无法获取应用ID');
    return;
  }
  
  const url = `https://appgallery.huawei.com/app/detail?id=${appId}`;
  window.open(url, '_blank');
};

const fetchDetail = async () => {
  const id = route.params.id as string;
  if (!id) return;
  
  loading.value = true;
  try {
    const res = await getAppDetail(id);
    if (res && res.data) {
      appDetail.value = res.data;
    } else if (res) {
      appDetail.value = res;
    }

    if (appDetail.value) {
      const title = appDetail.value.name || '应用详情';
      layoutStore.setPageInfo(title, true, () => router.back());
      document.title = `${title} - OpenStore`;
    }
  } catch (error) {
    console.error('Failed to fetch app detail:', error);
    ElMessage.error('获取应用详情失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchDetail();
});
</script>

<style scoped>
.app-dashboard-view {
  padding: 20px;
  max-width: 1000px; /* Narrower for readability like detail pages */
  margin: 0 auto;
  min-height: 80vh;
}

.app-detail-container {
  background: var(--el-bg-color);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.app-header-left {
  display: flex;
  gap: 24px;
}

.app-icon {
  width: 120px;
  height: 120px;
  border-radius: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.app-title-block {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.app-name {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: var(--el-text-color-primary);
}

.app-subtitle {
  font-size: 16px;
  color: var(--el-text-color-secondary);
  margin-bottom: 20px;
}

.app-actions {
  display: flex;
  gap: 12px;
}

.screenshots-section {
  margin-bottom: 32px;
  overflow: hidden;
}

.screenshots-scroll {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 12px;
  /* Hide scrollbar for cleaner look but allow scroll */
  scrollbar-width: thin;
}

.screenshot-item {
  width: 200px; /* Phone screenshot ratio approx */
  height: 355px; /* 9:16 aspect ratio roughly */
  border-radius: 12px;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-lighter);
}

.description-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.description-text {
  font-size: 16px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item.full-width {
  grid-column: 1 / -1;
}

.meta-item.privacy-item {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.meta-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.meta-value {
  font-size: 15px;
  color: var(--el-text-color-primary);
  font-weight: 500;
  word-break: break-all;
}

.pkg-name {
  font-family: monospace;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .app-dashboard-view {
    padding: 10px;
  }
  
  .app-detail-container {
    padding: 20px;
  }

  .app-header {
    flex-direction: column-reverse;
    gap: 16px;
  }
  
  .app-header-right {
    align-self: flex-end;
  }
  
  .app-header-left {
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
  }
  
  .app-actions {
    justify-content: center;
  }
  
  .meta-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
