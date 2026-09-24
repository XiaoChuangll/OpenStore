<template>
  <div class="app-dashboard-view" v-loading="loading">
    <div class="app-detail-container" v-if="appDetail">
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
          <el-tooltip content="分享" placement="left" :show-after="200">
            <el-button
              circle
              :icon="HarmonyShareIcon"
              aria-label="分享"
              @click="copyLink"
            />
          </el-tooltip>
          <el-tooltip content="打开应用商店" placement="left" :show-after="200">
            <el-button
              circle
              :icon="HarmonyDownloadIcon"
              aria-label="打开应用商店"
              @click="openAppGallery"
            />
          </el-tooltip>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-row meta-row-1">
          <div class="meta-pill">
            <span class="meta-pill-label">{{ categoryInfo.label }}</span>
            <span class="meta-pill-value">{{ categoryInfo.value }}</span>
          </div>
          <div class="meta-pill with-watermark">
            <span class="meta-pill-watermark">API</span>
            <span class="meta-pill-label">目标</span>
            <span class="meta-pill-value">{{ lastMetric?.target_sdk || '—' }}</span>
          </div>
          <div class="meta-pill with-watermark">
            <span class="meta-pill-watermark">API</span>
            <span class="meta-pill-label">最小</span>
            <span class="meta-pill-value">{{ lastMetric?.minsdk || '—' }}</span>
          </div>
        </div>

        <div class="meta-row meta-row-2">
          <div class="meta-card">
            <div class="meta-card-label">评分 / 评分数量</div>
            <div class="meta-card-value">
              <span>{{ appDetail.rating?.average_rating ?? '—' }}</span>
              <span class="meta-card-sub">({{ formatNumber(appDetail.rating?.total_star_rating_count) }})</span>
            </div>
          </div>
          <div class="meta-card">
            <div class="meta-card-label">总下载量</div>
            <div class="meta-card-value">{{ formatNumber(lastMetric?.download_count) }}</div>
          </div>
          <div class="meta-card">
            <div class="meta-card-label">大小</div>
            <div class="meta-card-value">{{ formatSize(lastMetric?.size_bytes) }}</div>
          </div>
          <div class="meta-card">
            <div class="meta-card-label">版本号</div>
            <div class="meta-card-value">{{ lastMetric?.version_code || '—' }}</div>
          </div>
        </div>

      </div>

      <div class="section-container" v-if="screenshotList.length">
        <h3>
          应用截图
          <span class="section-count">{{ screenshotList.length }}</span>
        </h3>
        <div class="shot-strip">
          <button
            v-for="(shot, index) in screenshotList"
            :key="shot.url"
            type="button"
            class="shot-thumb"
            :style="thumbStyle(shot)"
            :aria-label="`查看第 ${index + 1} 张截图`"
            @click="openViewer(index)"
          >
            <img
              :src="shotSrc(shot.url)"
              :alt="`${appDetail.name} 截图 ${index + 1}`"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="dropShot(shot.url)"
            />
          </button>
        </div>
      </div>

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

      <!-- 时间 / 标识 / 发布（放在截图与介绍之后） -->
      <div class="meta-grid spec-section">
        <div class="meta-row meta-row-3">
          <div class="meta-group">
            <div class="meta-group-title">时间</div>
            <div class="meta-kv">
              <div class="meta-kv-key">数据更新时间</div>
              <div class="meta-kv-value" :title="formatDateTime(lastMetric?.created_at)">{{ formatDateTime(lastMetric?.created_at) }}</div>
            </div>
            <div class="meta-kv">
              <div class="meta-kv-key">创建时间</div>
              <div class="meta-kv-value" :title="formatDateTime(appDetail.created_at)">{{ formatDateTime(appDetail.created_at) }}</div>
            </div>
            <div class="meta-kv">
              <div class="meta-kv-key">上架时间</div>
              <div class="meta-kv-value" :title="formatDateTime(appDetail.listed_at)">{{ formatDateTime(appDetail.listed_at) }}</div>
            </div>
          </div>

          <div class="meta-group">
            <div class="meta-group-title">标识</div>
            <div class="meta-kv">
              <div class="meta-kv-key">包名</div>
              <div class="meta-kv-value pkg-name" :title="appDetail.pkg_name">{{ appDetail.pkg_name || '—' }}</div>
            </div>
            <div class="meta-kv">
              <div class="meta-kv-key">应用ID</div>
              <div class="meta-kv-value" :title="appDetail.app_id">{{ appDetail.app_id || '—' }}</div>
            </div>
            <div class="meta-kv" v-if="appDetail.app_recordal_info">
              <div class="meta-kv-key">备案号</div>
              <div class="meta-kv-value" :title="appDetail.app_recordal_info">{{ appDetail.app_recordal_info }}</div>
            </div>
          </div>

          <div class="meta-group">
            <div class="meta-group-title">发布</div>
            <div class="meta-kv">
              <div class="meta-kv-key">开发者</div>
              <div class="meta-kv-value" :title="appDetail.developer_name">{{ appDetail.developer_name || '—' }}</div>
            </div>
            <div class="meta-kv">
              <div class="meta-kv-key">版本</div>
              <div class="meta-kv-value" :title="lastMetric?.version">{{ lastMetric?.version || '—' }}</div>
            </div>
            <div class="meta-kv">
              <div class="meta-kv-key">编译 API</div>
              <div class="meta-kv-value" :title="String(lastMetric?.compile_sdk_version ?? '—')">{{ lastMetric?.compile_sdk_version || '—' }}</div>
            </div>
          </div>
        </div>
      </div>

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

    <Teleport to="body">
      <div v-if="viewerOpen && viewerUrl" class="shot-viewer" @click.self="closeViewer">
        <img
          class="shot-viewer-img"
          :src="shotSrc(viewerUrl)"
          :alt="`${appDetail?.name || ''} 截图`"
          referrerpolicy="no-referrer"
        />

        <button
          v-if="screenshotList.length > 1"
          type="button"
          class="shot-nav shot-nav-prev"
          aria-label="上一张"
          @click.stop="stepViewer(-1)"
        >
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <button
          v-if="screenshotList.length > 1"
          type="button"
          class="shot-nav shot-nav-next"
          aria-label="下一张"
          @click.stop="stepViewer(1)"
        >
          <el-icon><ArrowRight /></el-icon>
        </button>
        <button type="button" class="shot-close" aria-label="关闭" @click.stop="closeViewer">
          <el-icon><Close /></el-icon>
        </button>

        <div class="shot-counter">{{ viewerIndex + 1 }} / {{ screenshotList.length }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { hmApi } from '../services/hm-api';
import AppMetricsChart from '../components/AppMetricsChart.vue';
import HarmonyShareIcon from '../components/HarmonyShareIcon.vue';
import HarmonyDownloadIcon from '../components/HarmonyDownloadIcon.vue';
import { Picture, ArrowDown, ArrowLeft, ArrowRight, Close } from '@element-plus/icons-vue';
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

/**
 * 应用截图。
 *
 * 只用上游的 `new_screen_shots`（{ url, resolution, rotated }）：
 * 旧的 `screen_shots` 数组里是不带设备段的 `screenshutN/xxx.jpg`，
 * 实测这些地址现在全部 403，直连只会得到一堆裂图。
 * 另外 CDN 没有 Referer 校验，但这里仍然统一加 `referrerpolicy="no-referrer"`，
 * 并且任何一张加载失败就从列表里摘掉 —— 全部失败时整个区块自动消失，不显示裂图。
 */
type Screenshot = { url: string; resolution?: string; rotated?: number };

const screenshotList = ref<Screenshot[]>([]);
const viewerOpen = ref(false);
const viewerIndex = ref(0);
const viewerUrl = computed(() => screenshotList.value[viewerIndex.value]?.url ?? '');

/**
 * 统一走本站同源代理（server/index.cjs 的 /api/screenshot）。
 * 直连华为 CDN 时，访客在海外、公司网络或装了广告拦截插件都可能拿不到图，
 * 而且我们无从感知；走代理后请求方固定是本站服务器，行为可预测、也能缓存。
 * 服务端可用 SCREENSHOT_PROXY=off 关闭代理，届时图片全部失败 → 区块自动隐藏。
 */
const shotSrc = (url: string) => (url ? `/api/screenshot?url=${encodeURIComponent(url)}` : '');

const collectScreenshots = (info: any): Screenshot[] => {
  const raw = Array.isArray(info?.new_screen_shots) ? info.new_screen_shots : [];
  const seen = new Set<string>();
  const list: Screenshot[] = [];

  for (const item of raw) {
    const url = typeof item === 'string' ? item : item?.url;
    if (typeof url !== 'string') continue;
    // 只接受已知来源的 HTTPS 截图地址，避免上游字段被换成任意 URL
    if (!/^https:\/\/[a-z0-9.-]*dbankcdn\.com\/application\/screenshut/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    list.push({
      url,
      resolution: typeof item === 'object' && item ? item.resolution : undefined,
      rotated: typeof item === 'object' && item ? item.rotated : undefined,
    });
  }

  return list;
};

const dropShot = (url: string) => {
  const next = screenshotList.value.filter((shot) => shot.url !== url);
  screenshotList.value = next;
  if (viewerIndex.value >= next.length) viewerIndex.value = 0;
  if (!next.length) viewerOpen.value = false;
};

/** 用上游给的 resolution 提前占位，图片加载完之前也不会跳动 */
const thumbStyle = (shot: Screenshot) => {
  const match = /^(\d+)\s*[*x×]\s*(\d+)$/.exec(shot.resolution || '');
  let ratio = 9 / 16;
  if (match) {
    let width = Number(match[1]);
    let height = Number(match[2]);
    if (shot.rotated === 90 || shot.rotated === 270) [width, height] = [height, width];
    if (width > 0 && height > 0) ratio = width / height;
  }
  return { aspectRatio: String(ratio) };
};

const openViewer = (index: number) => {
  viewerIndex.value = index;
  viewerOpen.value = true;
};

const closeViewer = () => {
  viewerOpen.value = false;
};

const stepViewer = (delta: number) => {
  const total = screenshotList.value.length;
  if (total < 2) return;
  viewerIndex.value = (viewerIndex.value + delta + total) % total;
};

const onViewerKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeViewer();
  else if (event.key === 'ArrowRight') stepViewer(1);
  else if (event.key === 'ArrowLeft') stepViewer(-1);
};

watch(viewerOpen, (open) => {
  if (open) {
    window.addEventListener('keydown', onViewerKey);
    document.documentElement.style.overflow = 'hidden';
  } else {
    window.removeEventListener('keydown', onViewerKey);
    document.documentElement.style.overflow = '';
  }
});

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

const categoryInfo = computed(() => {
  const detail = appDetail.value;
  if (!detail) return { label: '分类', value: '—' };

  const typeName = detail.kind_type_name;
  const kindName = detail.kind_name;

  if (typeName && kindName) {
    return { label: typeName, value: kindName };
  }
  
  const full = `${typeName || ''}-${kindName || ''}`.replace(/^-/, '').replace(/-$/, '') || '—';
  return { label: '分类', value: full };
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
  window.removeEventListener('keydown', onViewerKey);
  document.documentElement.style.overflow = '';
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
    screenshotList.value = collectScreenshots(info);
    viewerIndex.value = 0;

    const title = info.name || '应用详情';
    layoutStore.setPageInfo(title, true, () => router.back());
    document.title = `OpenStore | ${title}`;

    const description = info.description || info.intro || '';
    if (description) {
      let el = document.querySelector('meta[name="description"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', 'description');
        document.head.appendChild(el);
      }
      el.setAttribute('content', description.slice(0, 160));
    }

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
  max-width: 1200px;
  margin: 0 auto;
}

.app-detail-container {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  box-shadow: var(--el-box-shadow-light);
  padding: 24px;
}

/* 分享 / 打开应用商店：图标按钮竖排靠右，和左侧应用图标同处一行 */
.app-header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.meta-row {
  width: 100%;
}

.meta-row-1 {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  min-height: 28px;
  /* 宽度完全由内容决定：短的就窄、长的就宽，不再凑成等宽 */
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.meta-pill.with-watermark {
}

.meta-pill-watermark {
  position: absolute;
  right: 6px;
  bottom: -6px;
  font-size: 20px;
  font-weight: 900;
  color: var(--el-text-color-placeholder);
  opacity: 0.15;
  pointer-events: none;
  z-index: 0;
  font-style: italic;
  line-height: 1;
}

.meta-pill-label {
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
}

.meta-pill-value {
  color: var(--el-text-color-primary);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
  position: relative;
  z-index: 1;
}

.meta-row-1 .meta-pill {
  /* 每颗的基准宽度由内容决定，再一起拉伸把整行填满 */
  flex: 1 1 auto;
}

.meta-row-2 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.meta-card {
  background: var(--el-fill-color-light);
  border-radius: 10px;
  padding: 12px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-card-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-card-value {
  font-size: 14px;
  color: var(--el-text-color-primary);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-card-sub {
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-left: 6px;
}

.meta-row-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

/* 只有手机才把指标卡降到两列，平板/窄窗口保持四列，避免大片留白 */
@media (max-width: 600px) {
  .meta-row-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 平板与窄窗口：信息组两列，「时间」占整行（时间戳本身就长） */
@media (max-width: 1023px) {
  .meta-row-3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .meta-row-3 .meta-group:first-child {
    grid-column: 1 / -1;
  }
}

/* 平板区间：「时间」既占整行，内部也排成两列，避免键值被拉满一整行 */
@media (min-width: 769px) and (max-width: 1023px) {
  .meta-row-3 .meta-group:first-child {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;
    align-content: start;
  }

  .meta-row-3 .meta-group:first-child .meta-group-title {
    grid-column: 1 / -1;
  }
}

/* 大屏手机 / 小竖屏：信息组占满整行时，内部排两列，缩短键值之间的距离 */
@media (min-width: 601px) and (max-width: 768px) {
  .meta-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 20px;
    align-content: start;
  }

  .meta-group-title {
    grid-column: 1 / -1;
  }
}

.meta-group {
  background: var(--el-fill-color-light);
  border-radius: 10px;
  padding: 12px;
  min-width: 0;
}

.meta-group-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
  font-weight: 600;
}

.meta-kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  min-width: 0;
}

.meta-kv:first-of-type {
  margin-top: 0;
}

.meta-kv-key {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: 0 0 auto;
}

.meta-kv-value {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.pkg-name {
  font-family: monospace;
}

.section-container {
  margin-top: 24px;
}

/* 移到「应用介绍」之后的时间/标识/发布分组 */
.spec-section {
  margin-top: 24px;
}

.section-count {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  vertical-align: 2px;
}

/* 应用截图：横向滚动缩略图 */
.shot-strip {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  overflow-x: auto;
  padding: 2px 2px 8px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}

.shot-thumb {
  flex: 0 0 auto;
  height: 240px;
  padding: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-light);
  overflow: hidden;
  cursor: zoom-in;
  scroll-snap-align: start;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.shot-thumb:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
}

.shot-thumb:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.shot-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 点击放大 */
.shot-viewer {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 72px;
  background: rgba(0, 0, 0, 0.88);
  animation: shot-fade 0.18s ease-out;
}

.shot-viewer-img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  background: #000;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
}

.shot-nav,
.shot-close {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.shot-nav:hover,
.shot-close:hover {
  background: rgba(255, 255, 255, 0.28);
}

.shot-nav-prev {
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.shot-nav-next {
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
}

.shot-close {
  top: 16px;
  right: 16px;
}

.shot-counter {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@keyframes shot-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 768px) {
  .meta-row-1 {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    gap: 8px;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .meta-row-1::-webkit-scrollbar {
    display: none;
  }

  .meta-pill {
    font-size: 11px;
    min-height: 26px;
    padding: 0 8px;
    gap: 2px;
    flex: 0 0 auto;
  }
  
  .meta-pill-watermark {
    font-size: 16px;
    bottom: -4px;
    right: 4px;
  }

  .meta-row-3 {
    grid-template-columns: 1fr;
  }

  .meta-pill-value {
    max-width: 220px;
  }

  .meta-card {
    padding: 10px;
  }
  .meta-card-label {
    font-size: 11px;
  }
  .meta-card-value {
    font-size: 13px;
  }

  .meta-group {
    padding: 10px;
  }
  .meta-group-title {
    margin-bottom: 8px;
  }

  .shot-strip {
    gap: 10px;
  }

  .shot-thumb {
    height: 180px;
  }

  .shot-viewer {
    padding: 16px 56px;
  }
}

/* 小屏手机：包名、应用 ID 这类长标识允许折行，不要被省略号截掉 */
@media (max-width: 480px) {
  .meta-kv {
    align-items: flex-start;
  }

  .meta-kv-value {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
  }

  /* 包名是等宽字体，小屏上缩一档就能整行放下，不必折行 */
  .pkg-name {
    font-size: 12px;
  }
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
  /* 与新的中性标签语言保持一致，不用默认的浅蓝底 */
  background-color: var(--el-fill-color-light);
  border-color: var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
}

/* 窄屏时图标/名称和右侧两个圆形按钮仍保持同一行，名称块自行折行 */
@media (max-width: 600px) {
  .app-header {
    gap: 12px;
  }

  .app-name {
    font-size: 20px;
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

/*
 * 移动端：详情信息不再被套在卡片里，直接铺在主内容区上。
 * 去掉卡片/图表容器的背景、边框、圆角和内边距，只保留 12px 页面边距，
 * 这样在手机上能多出约 20% 的可用宽度来展示信息。
 */
@media (max-width: 768px) {
  .app-dashboard-view {
    padding: 12px;
  }

  .app-detail-container,
  .metrics-section {
    background: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  /* pill 按内容宽度排，一行放不下就整颗换行，不裁切、不省略 */
  .meta-row-1 {
    flex-wrap: wrap;
    overflow-x: visible;
    padding-bottom: 0;
  }

  .meta-pill {
    min-width: 56px;
  }
}

/* 小屏手机：再收一档边距，长标识折行而不是被省略号截断 */
@media (max-width: 480px) {
  .app-dashboard-view {
    padding: 10px;
  }

  .meta-kv {
    align-items: flex-start;
  }

  .meta-kv-value {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
  }

  /* 包名是等宽字体，小屏上缩一档就能整行放下 */
  .pkg-name {
    font-size: 12px;
  }
}
</style>
