<template>
  <el-card class="app-card" shadow="hover" :class="{ 'detail-card': isDetail }">
    <div class="app-card-bg" v-if="bgUrl" :style="{ backgroundImage: `url(${bgUrl})` }"></div>
    <div class="app-card-content">
      <div class="card-header">
        <div class="accent-bar bg-green"></div>
        <h3 class="card-title">{{ item.name || '应用' }}</h3>
      </div>
      <div class="app-banner">
        <img v-if="bgUrl && !bannerError" :src="bgUrl" class="app-banner-img" alt="banner" @error="bannerError = true" />
        <div v-else class="app-banner-placeholder"></div>
      </div>
      <div class="app-header">
        <img v-if="iconUrl && !iconError" :src="iconUrl" class="app-icon" alt="icon" @error="iconError = true" />
        <i v-else class="el-icon app-icon-fallback" style="font-size: 24px;">
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
            <path fill="currentColor" d="M511.6 76.3C264.3 76.2 64 276.4 64 523.5 64 718.9 189.3 885 363.8 946c23.5 5.9 19.9-10.8 19.9-22.2v-77.5c-135.7 15.9-141.2-73.9-150.8-88.9C215 726 171.5 718 184.5 703c30.9-15.9 62.4 4 98.9 57.9 26.4 39.1 77.9 32.5 104 26 5.7-23.5 17.9-44.5 34.7-60.8-140.6-25.2-199.2-111-199.2-213 0-49.5 16.3-95 48.3-131.7-20.4-60.5 1.9-112.3 4.9-120 58.1-5.2 118.5 41.6 123.2 45.3 33-8.9 70.7-13.6 112.9-13.6 42.4 0 80.2 4.9 113.5 13.9 11.3-8.6 67.3-48.8 121.3-43.9 2.9 7.7 24.7 58.3 5.5 118 32.4 36.8 48.9 82.7 48.9 132.3 0 102.2-59 188.1-200 212.9a127.5 127.5 0 0 1 38.1 91v112.5c.8 9 0 17.9 15 17.9 177.1-59.7 304.6-227 304.6-424.1 0-247.2-200.4-447.3-447.5-447.3z"></path>
          </svg>
        </i>
        <div class="app-title">{{ item.name || '应用' }}</div>
      </div>
      <div class="app-desc" v-if="item.provider || item.developer_name">{{ item.provider || item.developer_name }}</div>
      <div class="app-desc" v-if="isDetail && (item.description || item.intro)">
          {{ item.description || item.intro }}
      </div>
      <div class="app-actions">
        <el-button
          class="app-download-btn glass-btn"
          round
          :icon="Download"
          @click="handleDownload"
        >下载</el-button>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Download } from '@element-plus/icons-vue';
import { getGitHubInfo, getAppIconUrl } from '../utils/app-info';

const props = defineProps<{
  item: any;
  isDetail?: boolean;
}>();

const bannerError = ref(false);
const iconError = ref(false);

const iconUrl = computed(() => getAppIconUrl(props.item));

const bgUrl = computed(() => {
  const item = props.item;
  const direct = item.bg_url || item.banner || item.cover || item.image || item.thumbnail || item.screenshot;
  if (direct) return direct;
  
  const link = item.download_url || item.downloadLink || item.url || item.link || item.homepage;
  if (link) {
    const gh = getGitHubInfo(link);
    if (gh) return `https://images.weserv.nl/?url=opengraph.githubassets.com/1/${gh.owner}/${gh.repo}`;
  }
  
  return null;
});

watch(bgUrl, () => {
  bannerError.value = false;
});

watch(iconUrl, () => {
  iconError.value = false;
});

const handleDownload = () => {
  const item = props.item;
  const d = item.download_url || item.downloadLink || item.download || item.apk || item.file || item.pkg || item.dmg || item.deb || item.rpm;
  const link = d || item.url || item.link || item.homepage;
  if (link) window.open(link, '_blank');
};
</script>

<style scoped>
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
.app-banner-img { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: block; }
.app-banner-placeholder {
  width: 100%;
  height: 120px;
  border-radius: 8px;
  background: linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%);
  box-shadow: inset 0 0 20px rgba(0,0,0,0.02);
}
.dark .app-banner-placeholder {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
}
.app-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.app-icon { width: 24px; height: 24px; border-radius: 6px; object-fit: contain; }
.app-icon-fallback { color: var(--el-text-color-primary); }
.app-title { font-weight: 500; font-size: 0.875rem; }
.app-desc { 
  font-size: 0.875rem; 
  color: var(--el-text-color-secondary); 
  margin-bottom: 6px;
  /* Limit to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Fixed height for 2 lines + line-height 1.5 */
  height: 2.625rem; 
  line-height: 1.5;
}
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
