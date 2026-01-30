<template>
  <div class="apps-view">
    <el-skeleton :loading="loading" animated>
      <template #template>
        <el-skeleton-item variant="rect" style="width: 100%; height: 200px" />
      </template>
      <template #default>
        <el-row :gutter="20" :class="{ 'detail-row': isDetail }">
          <el-col :xs="24" :sm="isDetail ? 24 : 12" :md="isDetail ? 24 : 8" :lg="isDetail ? 24 : 6" v-for="(item, idx) in items" :key="idx" class="mb-4">
            <AppDetailCard :item="item" :is-detail="isDetail" />
          </el-col>
        </el-row>
        <el-empty v-if="!loading && items.length === 0" description="暂无应用数据" />
      </template>
    </el-skeleton>
  </div>
  
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { getPublicApps } from '../services/admin';
import { getAppDetail } from '../services/next-api';
import { useLayoutStore } from '../stores/layout';
import AppDetailCard from '../components/AppDetailCard.vue';

defineOptions({
  name: 'AppCardView'
});

const router = useRouter();
const route = useRoute();
const layoutStore = useLayoutStore();
const loading = ref(false);
const items = ref<any[]>([]);
const pageHeaderRef = ref<HTMLElement | null>(null);

const isDetail = computed(() => !!route.params.id);
const pageTitle = computed(() => isDetail.value ? '应用详情' : '应用列表');

const fetchApps = async () => {
  loading.value = true;
  try {
    if (isDetail.value) {
      const id = route.params.id as string;
      const res = await getAppDetail(id);
      items.value = res ? [res] : [];
    } else {
      items.value = await getPublicApps();
    }
  } finally {
    loading.value = false;
  }
};

const goBack = () => {
  router.back();
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
  // Enable global back button
  layoutStore.setPageInfo(pageTitle.value, true, goBack);
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
  layoutStore.reset();
});
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.page-header {
  display: flex;
  align-items: center;
}
.text-large { font-size: 1.5rem; }
.font-600 { font-weight: 600; }
.mr-3 { margin-right: 0.75rem; }

.app-card { 
  background-color: var(--el-bg-color); 
  border-radius: 16px; 
  box-shadow: var(--el-box-shadow-light); 
  position: relative;
  overflow: hidden;
  border: none;
}
.detail-card {
  max-width: 800px;
  margin: 0 auto;
}
.detail-row {
  justify-content: center;
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
