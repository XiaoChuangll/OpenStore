<template>
  <div class="apps-view">
    <el-page-header ref="pageHeaderRef" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 应用列表 </span>
      </template>
    </el-page-header>

    <el-skeleton :loading="loading" animated>
      <template #template>
        <el-skeleton-item variant="rect" style="width: 100%; height: 200px" />
      </template>
      <template #default>
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="(item, idx) in items" :key="idx" class="mb-4">
            <el-card class="app-card" shadow="hover">
              <div class="app-card-bg" v-if="bgUrl(item)" :style="{ backgroundImage: `url(${bgUrl(item)})` }"></div>
              <div class="app-card-content">
                <div class="card-header">
                  <div class="accent-bar bg-green"></div>
                  <h3 class="card-title">{{ item.name || '应用' }}</h3>
                </div>
                <div class="app-banner" v-if="bgUrl(item)">
                  <img :src="bgUrl(item)" class="app-banner-img" alt="banner" />
                </div>
                <div class="app-header">
                  <img v-if="iconUrl(item)" :src="iconUrl(item)" class="app-icon" alt="icon" />
                  <el-icon v-else :size="24" class="app-icon-fallback"><Monitor /></el-icon>
                  <div class="app-title">{{ item.name || '应用' }}</div>
                </div>
                <div class="app-desc" v-if="item.provider">{{ item.provider }}</div>
                <div class="app-actions">
                  <el-button
                    class="app-download-btn glass-btn"
                    round
                    :icon="Download"
                    @click="download(item)"
                  >下载</el-button>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
        <el-empty v-if="!loading && items.length === 0" description="暂无应用数据" />
      </template>
    </el-skeleton>
  </div>
  
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Monitor, Download } from '@element-plus/icons-vue';
import { getPublicApps, type AppItem } from '../services/admin';
import { useLayoutStore } from '../stores/layout';

const router = useRouter();
const layoutStore = useLayoutStore();
const loading = ref(false);
const items = ref<AppItem[]>([]);
const pageHeaderRef = ref<HTMLElement | null>(null);

const fetchApps = async () => {
  loading.value = true;
  try {
    items.value = await getPublicApps();
  } finally {
    loading.value = false;
  }
};

const iconUrl = (item: any) => {
  if (item.icon_url) return item.icon_url;
  const direct = (item as any).icon || (item as any).logo;
  if (direct) return direct;
  const link = (item as any).url || (item as any).link || (item as any).homepage;
  if (!link) return null;
  try {
    const u = new URL(link);
    return `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
};

const bgUrl = (item: any) => {
  return item.bg_url || (item as any).banner || (item as any).cover || (item as any).image || (item as any).thumbnail || (item as any).screenshot || null;
};

const download = (item: any) => {
  const d = item.download_url || (item as any).downloadLink || (item as any).download || (item as any).apk || (item as any).file || (item as any).pkg || (item as any).dmg || (item as any).deb || (item as any).rpm;
  const link = d || (item as any).url || (item as any).link || (item as any).homepage;
  if (link) window.open(link, '_blank');
};

const goBack = () => {
  router.push('/');
};

// Scroll Handler
let ticking = false;

const checkScrollPosition = () => {
  if (!pageHeaderRef.value) return;
  const el = (pageHeaderRef.value as any).$el || pageHeaderRef.value;
  if (!el || !el.getBoundingClientRect) return;

  const rect = el.getBoundingClientRect();
  layoutStore.setHeaderState(rect.bottom < 60);
};

const handleScroll = () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      checkScrollPosition();
      ticking = false;
    });
    ticking = true;
  }
};

onMounted(() => {
  fetchApps();
  window.addEventListener('scroll', handleScroll);
  layoutStore.setPageInfo('应用列表', true, goBack);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  layoutStore.reset();
});
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.app-card { 
  background-color: var(--el-bg-color); 
  border-radius: 16px; 
  box-shadow: var(--el-box-shadow-light); 
  position: relative;
  overflow: hidden;
  border: none;
}
.app-card-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-size: cover;
  background-position: center;
  filter: blur(20px);
  transform: scale(1.2);
  opacity: 0.3;
  z-index: 0;
}
.app-card-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, transparent 30%, var(--el-bg-color) 100%);
  opacity: 0.8;
}
.app-card-content {
  position: relative;
  z-index: 1;
}
.card-header { display: flex; align-items: center; margin-bottom: 8px; }
.accent-bar { width: 4px; height: 16px; border-radius: 4px; margin-right: 8px; }
.bg-green { background-color: #10b981; }
.card-title { font-weight: 700; font-size: 0.875rem; margin: 0; color: var(--el-text-color-primary); }
.app-banner { width: 100%; margin-bottom: 8px; }
.app-banner-img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.app-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.app-icon { width: 24px; height: 24px; border-radius: 6px; object-fit: contain; }
.app-icon-fallback { color: var(--el-text-color-primary); }
.app-title { font-weight: 500; font-size: 0.875rem; }
.app-desc { font-size: 0.875rem; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.app-link { font-size: 0.75rem; color: var(--el-color-primary); }
.app-actions { margin-top: 12px; }
.app-download-btn { font-weight: 500; width: 100%; }

.glass-btn {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: var(--el-text-color-primary);
  transition: all 0.3s ease;
}

.glass-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: rgba(255, 255, 255, 0.5);
  color: var(--el-color-primary);
}

.dark .glass-btn {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
}

.dark .glass-btn:hover {
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.2);
}
</style>
