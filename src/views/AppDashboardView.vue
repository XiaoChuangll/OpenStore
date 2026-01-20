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
          </div>
        </div>
        <div class="app-header-right">
          <el-button @click="copyLink">分享 App</el-button>
          <el-button @click="openAppGallery">打开 App</el-button>
        </div>
      </div>

      <!-- Meta Grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <div class="meta-label">分类</div>
          <div class="meta-value">{{ formatCategory(appDetail) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">评分</div>
          <div class="meta-value">{{ appDetail.rating?.average_rating ?? '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">评分数量</div>
          <div class="meta-value">{{ formatNumber(appDetail.rating?.total_star_rating_count) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">总下载量</div>
          <div class="meta-value">{{ formatNumber(lastMetric?.download_count) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">大小</div>
          <div class="meta-value">{{ formatSize(lastMetric?.size_bytes) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">数据更新时间</div>
          <div class="meta-value">{{ formatDateTime(lastMetric?.created_at) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">创建时间</div>
          <div class="meta-value">{{ formatDateTime(appDetail.created_at) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">上架时间</div>
          <div class="meta-value">{{ formatDateTime(appDetail.listed_at) }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">包名</div>
          <div class="meta-value pkg-name" :title="appDetail.pkg_name">{{ appDetail.pkg_name || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">应用ID</div>
          <div class="meta-value">{{ appDetail.app_id || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">开发者</div>
          <div class="meta-value">{{ appDetail.developer_name || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">版本</div>
          <div class="meta-value">{{ lastMetric?.version || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">版本号</div>
          <div class="meta-value">{{ lastMetric?.version_code || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">目标 API 版本</div>
          <div class="meta-value">{{ lastMetric?.target_sdk || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">最小 API 版本</div>
          <div class="meta-value">{{ lastMetric?.minsdk || '—' }}</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">编译 API 版本</div>
          <div class="meta-value">{{ lastMetric?.compile_sdk_version || '—' }}</div>
        </div>

      </div>

      <!-- Description -->
      <div class="section-container" v-if="appDetail.description">
        <h3>应用介绍</h3>
        <p
          ref="descriptionRef"
          :class="['app-description', { 'is-collapsed': isDescriptionLong && !showFullDescription }]"
        >
          {{ appDetail.description }}
        </p>
        <div
          v-if="isDescriptionLong"
          class="section-toggle"
          @click="toggleDescription"
        >
          <el-icon :class="{ 'is-expanded': showFullDescription }"><ArrowDown /></el-icon>
        </div>
      </div>

      <!-- Devices & Countries -->
      <div class="section-container">
        <h3>支持设备</h3>
        <div class="chip-container">
          <el-tag v-for="device in deviceLabels" :key="device" class="chip">{{ device }}</el-tag>
          <el-tag v-if="deviceLabels.length === 0" type="info" class="chip">—</el-tag>
        </div>
      </div>
      
      <div class="section-container">
        <div class="section-header">
          <h3>发布地区</h3>
          <el-button
            v-if="isCountryListLong"
            link
            class="section-toggle-btn"
            @click="toggleCountries"
          >
            <el-icon :class="{ 'is-expanded': showFullCountries }"><ArrowDown /></el-icon>
          </el-button>
        </div>
        <div 
          ref="countryContainerRef"
          :class="['chip-container', { 'is-collapsed': isCountryListLong && !showFullCountries }]"
        >
          <el-tag v-for="country in countryLabels" :key="country" class="chip">{{ country }}</el-tag>
          <el-tag v-if="countryLabels.length === 0" type="info" class="chip">—</el-tag>
        </div>
      </div>
    </div>

    <div class="metrics-section" v-if="appDetail">
       <AppMetricsChart :metrics="metricsData" :rate-history="rateHistoryData" />
    </div>

    <div v-else-if="!loading && !appDetail" class="not-found">
      <el-empty description="未找到应用信息" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { hmApi } from '../services/hm-api';
import AppMetricsChart from '../components/AppMetricsChart.vue';
import { Picture, ArrowDown } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useLayoutStore } from '../stores/layout';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();
const loading = ref(false);
const appDetail = ref<any>(null);
const lastMetric = ref<any>(null);
const metricsData = ref<any[]>([]);
const rateHistoryData = ref<any[]>([]);
const scriptTag = ref<HTMLScriptElement | null>(null);
const descriptionRef = ref<HTMLElement | null>(null);
const showFullDescription = ref(false);
const isDescriptionLong = ref(false);

const countryContainerRef = ref<HTMLElement | null>(null);
const showFullCountries = ref(false);
const isCountryListLong = ref(false);

const DEVICE_CODE_MAP: Record<string, string> = {
  '0': '手机',
  '4': '平板',
  '3': '智能手表/手环',
  '7': '智慧屏',
  '15': '电脑',
};

const formatNumber = (num: any) => {
  if (typeof num === 'number') return num.toLocaleString();
  return num ?? '—';
};

const formatSize = (bytes: any) => {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(bytes);
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(2)} ${units[i]}`;
};

const formatDateTime = (ts: any) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
};

const formatCategory = (detail: any) => {
  const typeName = detail.kind_type_name || '';
  const kindName = detail.kind_name || '';
  return `${typeName}-${kindName}`.replace(/^-/, '') || '—';
};

const checkDescriptionOverflow = () => {
  if (!descriptionRef.value) return;
  const el = descriptionRef.value;
  // Use a slight delay to ensure rendering is complete
  requestAnimationFrame(() => {
    // 9.6em * 16px ≈ 153.6px
    isDescriptionLong.value = el.scrollHeight > 155; 
  });
};

const toggleDescription = () => {
  showFullDescription.value = !showFullDescription.value;
};

const toggleCountries = () => {
  showFullCountries.value = !showFullCountries.value;
};

const checkCountryOverflow = () => {
  if (!countryContainerRef.value) return;
  const el = countryContainerRef.value;
  requestAnimationFrame(() => {
    // Approx 3 lines of tags (32px height + 8px gap) * 3 = 120px
    // Use slightly larger threshold to be safe
    isCountryListLong.value = el.scrollHeight > 125;
  });
};

let descObserver: ResizeObserver | null = null;
let countryObserver: ResizeObserver | null = null;

const initObservers = () => {
  if (descriptionRef.value && !descObserver) {
    descObserver = new ResizeObserver(() => {
      // Only check if NOT collapsed to avoid toggle loops
      if (!showFullDescription.value && !descriptionRef.value?.classList.contains('is-collapsed')) {
        checkDescriptionOverflow();
      }
    });
    descObserver.observe(descriptionRef.value);
  }
  
  if (countryContainerRef.value && !countryObserver) {
    countryObserver = new ResizeObserver(() => {
      if (!showFullCountries.value && !countryContainerRef.value?.classList.contains('is-collapsed')) {
        checkCountryOverflow();
      }
    });
    countryObserver.observe(countryContainerRef.value);
  }
};

const deviceLabels = computed(() => {
  if (!appDetail.value) return [];
  const info = appDetail.value;
  const deviceRaw = info.main_device_codes ?? info.device_codes ?? info.terminals ?? info.device_code_list ?? [];
  let deviceCodes = Array.isArray(deviceRaw) ? deviceRaw : (typeof deviceRaw === 'string' ? deviceRaw.split(',') : []);
  deviceCodes = deviceCodes.map((c: any) => String(c).trim()).filter(Boolean);
  return deviceCodes.map((c: string) => DEVICE_CODE_MAP[c] ?? DEVICE_CODE_MAP[String(Number(c))] ?? `设备代码 ${c}`);
});

const countryLabels = computed(() => {
  if (!appDetail.value) return [];
  const info = appDetail.value;
  const countryRaw = info.release_countries ?? info.countries ?? info.supported_countries ?? [];
  let countryCodes = Array.isArray(countryRaw) ? countryRaw : (typeof countryRaw === 'string' ? countryRaw.split(',') : []);
  countryCodes = countryCodes.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean);
  
  let regionDisplay: Intl.DisplayNames | undefined;
  try { regionDisplay = new Intl.DisplayNames(['zh-CN'], { type: 'region' }); } catch {}
  
  return countryCodes.map((code: string) => {
    if (code === 'CN') return '中国';
    return regionDisplay?.of(code) || code;
  });
});

const structuredData = computed(() => {
  if (!appDetail.value) return '';

  const app = appDetail.value;
  const metric = lastMetric.value;
  const currentUrl = window.location.href;

  const data = {
    "@context": "http://schema.org",
    "@type": "SoftwareApplication",
    "name": app.name,
    "operatingSystem": "Android", // Assuming Android for this platform
    "applicationCategory": `http://schema.org/SoftwareApplicationCategory/${app.kind_name || 'OtherApplication'}`,
    "aggregateRating": app.rating?.average_rating ? {
      "@type": "AggregateRating",
      "ratingValue": app.rating.average_rating,
      "ratingCount": app.rating.total_star_rating_count || 0
    } : undefined,
    "offers": {
      "@type": "Offer",
      "price": "0", // Assuming free apps
      "priceCurrency": "CNY" // Assuming CNY
    },
    "softwareVersion": metric?.version || undefined,
    "downloadUrl": app.download_url || undefined,
    "screenshot": app.screenshot_urls && app.screenshot_urls.length > 0 ? app.screenshot_urls : undefined,
    "featureList": app.feature_list || undefined,
    "description": app.description || undefined,
    "image": app.icon_url || undefined,
    "url": currentUrl,
    "publisher": {
      "@type": "Organization",
      "name": app.developer_name || "未知开发者"
    }
  };

  return JSON.stringify(data, null, 2);
});

watch(appDetail, () => {
  showFullDescription.value = false;
  showFullCountries.value = false;
  // Wait for DOM updates then check and init observers
  nextTick(() => {
    checkDescriptionOverflow();
    checkCountryOverflow();
    setTimeout(initObservers, 100);
  });
}, { deep: true, immediate: true });

// Update JSON-LD script tag
watch(structuredData, (newValue) => {
  if (!newValue) {
    if (scriptTag.value) {
      document.head.removeChild(scriptTag.value);
      scriptTag.value = null;
    }
    return;
  }

  if (!scriptTag.value) {
    scriptTag.value = document.createElement('script');
    scriptTag.value.type = 'application/ld+json';
    document.head.appendChild(scriptTag.value);
  }
  scriptTag.value.text = newValue;
}, { immediate: true });

onUnmounted(() => {
  if (scriptTag.value) {
    document.head.removeChild(scriptTag.value);
    scriptTag.value = null;
  }
  descObserver?.disconnect();
  countryObserver?.disconnect();
});

const copyLink = () => {
  navigator.clipboard.writeText(window.location.href);
  ElMessage.success('链接已复制');
};

const openAppGallery = () => {
  if (appDetail.value && appDetail.value.pkg_name) {
    window.open(`https://appgallery.huawei.com/app/detail?id=${appDetail.value.pkg_name}`, '_blank');
  } else {
    ElMessage.warning('无法获取应用包名');
  }
};

const fetchData = async () => {
  const appId = route.query.app_id as string;
  if (!appId) return;
  
  loading.value = true;
  try {
    const res = await hmApi.get<any>(`apps/app_id/${encodeURIComponent(appId)}`);
    const data = res?.data || res; // Handle different response structures
    
    // Normalize data structure
    const info = (data?.info) ? data.info : (data?.full_info) ? data.full_info : (data || {});
    // Rating normalization
    const ratingBase = data?.rating || {};
    info.rating = {
      average_rating: ratingBase.average_rating ?? info.average_rating ?? info.full_average_rating ?? null,
      total_star_rating_count: ratingBase.total_star_rating_count ?? info.total_star_rating_count ?? info.info_rate_count ?? null,
    };
    
    appDetail.value = info;

    const title = info.name || '应用详情';
    layoutStore.setPageInfo(title, true, () => router.back());
    document.title = `${title} - OpenStore`;

    if (info.pkg_name) {
      try {
        const metricsRes = await hmApi.get<any>(`apps/metrics/${encodeURIComponent(info.pkg_name)}`);
        const metrics = metricsRes?.data || metricsRes; // Handle array or wrapped
        metricsData.value = Array.isArray(metrics) ? metrics : [];
        const sortedMetrics = Array.isArray(metrics) ? metrics.slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];
        if (sortedMetrics.length > 0) {
          lastMetric.value = sortedMetrics[0];
        }
      } catch (e) {
        console.error('Failed to fetch metrics', e);
      }
    }

    try {
      const rateHistoryRes = await hmApi.get<any>('rankings/rate_history', {
        app_id: info.app_id ?? null,
        pkg_name: info.pkg_name ?? null,
      });
      const payload = rateHistoryRes?.data ?? rateHistoryRes;
      const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
      rateHistoryData.value = list;
    } catch (e) {
      console.error('Failed to fetch rate history', e);
    }
  } catch (error) {
    console.error('Failed to fetch app details:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.app-dashboard-view {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;
}

.app-detail-container {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  padding: 24px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.app-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  flex-shrink: 0;
}

.app-name {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--el-text-color-primary);
}

.app-subtitle {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.meta-item {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
}

.meta-item.full-width {
  grid-column: 1 / -1;
}

.meta-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.meta-value {
  font-size: 14px;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.pkg-name {
  font-family: monospace;
}

.section-container {
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-header h3 {
  margin: 0;
}

.section-toggle-btn {
  padding: 0;
  font-size: 14px;
}

.section-container h3 {
  font-size: 18px;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.metrics-section {
  margin-top: 24px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  padding: 24px;
}

.app-description {
  white-space: pre-wrap;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  max-height: 2000px; /* 足够大的高度以容纳展开内容 */
  transition: max-height 0.4s ease-in-out;
  overflow: hidden;
}

.chip-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 2000px; /* 足够大的高度以容纳展开内容 */
  transition: max-height 0.4s ease-in-out;
  overflow: hidden;
}

.chip {
  margin-right: 0;
}

@media (max-width: 768px) {
  .app-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }
  
  .app-header-right {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }
}

.app-description.is-collapsed {
  max-height: 9.6em; /* 1.6em * 6 lines = 9.6em */
  /* 移除 line-clamp 以启用高度动画 */
  display: block; 
}

.section-toggle {
  margin-top: 8px;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chip-container.is-collapsed {
  max-height: 120px;
  overflow: hidden;
}

.section-toggle .el-icon,
.section-toggle-btn .el-icon {
  transition: transform 0.3s;
}

.section-toggle .el-icon.is-expanded,
.section-toggle-btn .el-icon.is-expanded {
  transform: rotate(180deg);
}
</style>
