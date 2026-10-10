<template>
  <div class="updates-app-detail-view" v-loading="loading">
    <div v-if="appDetail" class="detail-container">
      <div class="detail-header">
        <!-- 与「应用」页详情保持一致：分享 + 获取，两个按钮同尺寸 -->
        <el-tooltip content="复制本页链接" placement="bottom" :show-after="200">
          <el-button round class="detail-action" aria-label="分享" @click="copyLink">
            <el-icon><HarmonyShareIcon /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="打开应用商店" placement="bottom" :show-after="200">
          <el-button type="primary" round class="detail-action" @click="openAppGallery">获取</el-button>
        </el-tooltip>
      </div>

      <div class="detail-card basic-card">
        <el-image :src="appDetail.icon_url" class="app-icon" fit="cover">
          <template #error>
            <div class="image-slot">
              <el-icon><Picture /></el-icon>
            </div>
          </template>
        </el-image>
        <div class="basic-info">
          <div class="app-name">{{ appDetail.name || '—' }}</div>
          <!-- 这里「开发者 · 包名」和「应用简介」来回切换展示 -->
          <div class="app-subtitle" :title="subtitleLines[rotateIndex]">
            <transition name="subtitle-fade" mode="out-in">
              <span :key="rotateIndex">{{ subtitleLines[rotateIndex] }}</span>
            </transition>
          </div>
          <div class="basic-stats">
            <div class="stat-item">
              <div class="stat-label">评分</div>
              <div class="stat-value">{{ ratingText }}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">下载量</div>
              <div class="stat-value">{{ downloadsText }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="detail-card metric-card">
          <div class="metric-title">版本信息</div>
          <div class="metric-value">{{ latestVersionText }}</div>
        </div>
        <div class="detail-card metric-card">
          <div class="metric-title">更新时间</div>
          <div class="metric-value">{{ latestUpdateTimeText }}</div>
        </div>
        <div class="detail-card metric-card">
          <div class="metric-title">文件大小</div>
          <div class="metric-value">{{ latestSizeText }}</div>
        </div>
        <div class="detail-card metric-card">
          <div class="metric-title">目标SDK</div>
          <div class="metric-value">{{ latestTargetSdkText }}</div>
        </div>
      </div>

      <div class="detail-card history-card">
        <div class="history-header" @click="historyOpen = !historyOpen">
          <div class="history-title">
            <el-icon><Clock /></el-icon>
            更新历史
            <span class="history-count">({{ historyItems.length }})</span>
          </div>
          <el-icon class="history-chevron" :class="{ open: historyOpen }"><ArrowDown /></el-icon>
        </div>

        <div v-show="historyOpen" class="history-body">
          <div v-if="historyItems.length === 0" class="history-empty">暂无更新历史</div>
          <div v-else class="history-list">
            <div v-for="item in historyItems" :key="item.key" class="history-item">
              <div class="history-item-head">
                <div class="history-version">{{ item.version }}</div>
                <div class="history-date">{{ item.dateText }}</div>
              </div>
              <div class="history-desc">{{ item.description }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-empty v-else-if="!loading" description="未找到应用详情" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowDown, Clock, Picture } from '@element-plus/icons-vue';
import HarmonyShareIcon from '../components/HarmonyShareIcon.vue';
import { hmApi } from '../services/hm-api';
import { useLayoutStore } from '../stores/layout';
import { useActiveScope } from '../utils/page-active';
import { goBackOrHome } from '../utils/route-scroll';
import { buildAppShareMeta, clearPageShareMeta, setPageShareMeta, shareCurrentPage } from '../utils/page-share';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();

const loading = ref(false);
const historyOpen = ref(true);

const appDetail = ref<any>(null);
const metrics = ref<any[]>([]);

const appId = computed(() => String(route.params.id || '').trim());

/** 应用简介（上游 brief_desc，短简介；不是详情里的长说明） */
const briefText = computed(() => {
  const detail = appDetail.value;
  const raw = detail?.brief_desc ?? detail?.briefDesc ?? detail?.short_desc ?? detail?.intro;
  return String(raw || '').trim();
});

/** 副标题两行：开发者 · 包名 + 应用简介（有简介才轮播） */
const subtitleLines = computed(() => {
  const detail = appDetail.value || {};
  const who = `${detail.developer_name || '—'} · ${detail.pkg_name || '—'}`;
  return briefText.value ? [who, briefText.value] : [who];
});

const SUBTITLE_ROTATE_MS = 5000;
const rotateIndex = ref(0);
let subtitleTimer: number | null = null;

const getMetricTimeMs = (m: any) => {
  const raw = m?.created_at || m?.update_time || m?.last_update || 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/** 时间戳/时间字符串 → "2026/9/20 18:46:06"（release_date 是毫秒时间戳，偶尔是秒） */
const formatTimestamp = (raw: any) => {
  if (raw === undefined || raw === null || raw === '') return '—';
  const numeric = typeof raw === 'number' || /^\d+$/.test(String(raw).trim()) ? Number(raw) : NaN;
  const parsed = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(String(raw).replace(/-/g, '/'));
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', { hour12: false }) : String(raw);
};

/**
 * 版本发布时间：优先 release_date。
 * metrics.created_at 只是「我们抓到这个版本数据」的时刻，通常比实际发布晚几天，不能当更新时间。
 */
const getMetricReleaseMs = (m: any) => {
  const release = m?.release_date ?? m?.releaseDate;
  if (release !== undefined && release !== null && release !== '') {
    const numeric = typeof release === 'number' || /^\d+$/.test(String(release).trim()) ? Number(release) : NaN;
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = new Date(String(release));
    if (Number.isFinite(parsed.getTime())) return parsed.getTime();
  }
  return getMetricTimeMs(m);
};

const sortedMetrics = computed(() => {
  const list = Array.isArray(metrics.value) ? metrics.value.slice() : [];
  list.sort((a, b) => getMetricTimeMs(b) - getMetricTimeMs(a));
  return list;
});

const latestMetric = computed(() => sortedMetrics.value[0] || null);

const ratingText = computed(() => {
  const v = appDetail.value?.rating?.average_rating ?? appDetail.value?.average_rating ?? null;
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : String(v);
});

const downloadsText = computed(() => {
  const dc = latestMetric.value?.download_count ?? latestMetric.value?.downloads ?? null;
  const n = Number(typeof dc === 'string' ? dc.replace(/[^\d.]/g, '') : dc);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString();
});

const latestVersionText = computed(() => {
  const m = latestMetric.value;
  const v = m?.version_name ?? m?.version ?? m?.version_code ?? appDetail.value?.version_name ?? appDetail.value?.version ?? null;
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
});

const latestUpdateTimeText = computed(() => {
  /*
   * 应用真实的版本发布时间是上游的 release_date（毫秒时间戳）；
   * metrics.created_at / updated_at 只是「我们这边抓到数据」的时刻，不能当更新时间用。
   */
  const release = appDetail.value?.release_date ?? appDetail.value?.releaseDate;
  if (release !== undefined && release !== null && release !== '') {
    const text = formatTimestamp(release);
    if (text !== '—') return text;
  }

  const raw = latestMetric.value?.created_at ?? latestMetric.value?.update_time ?? latestMetric.value?.last_update ?? appDetail.value?.update_time ?? appDetail.value?.created_at ?? null;
  return formatTimestamp(raw);
});

const latestSizeText = computed(() => {
  const raw = latestMetric.value?.size_bytes ?? latestMetric.value?.file_size ?? latestMetric.value?.size ?? appDetail.value?.size_bytes ?? null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (n >= gb) return `${(n / gb).toFixed(2)} GB`;
  if (n >= mb) return `${(n / mb).toFixed(2)} MB`;
  if (n >= kb) return `${(n / kb).toFixed(2)} KB`;
  return `${n} B`;
});

const latestTargetSdkText = computed(() => {
  const raw = latestMetric.value?.target_sdk ?? latestMetric.value?.min_sdk ?? latestMetric.value?.minsdk ?? appDetail.value?.target_sdk ?? appDetail.value?.minsdk ?? null;
  if (raw === null || raw === undefined || raw === '') return '—';
  return String(raw);
});

const historyItems = computed(() => {
  const list = sortedMetrics.value;
  if (list.length === 0) return [];

  const bestByVersion = new Map<string, { key: string; time: number; value: any }>();
  for (const m of list) {
    const versionRaw = m?.version_name ?? m?.version ?? m?.version_code ?? '';
    const version = String(versionRaw || '').trim();
    // 用「版本发布时间」排序/取最新，而不是抓取时刻
    const time = getMetricReleaseMs(m);
    const key = version || `__t_${time}`;
    const existing = bestByVersion.get(key);
    if (!existing || existing.time < time) {
      bestByVersion.set(key, { key, time, value: m });
    }
  }

  const deduped = Array.from(bestByVersion.values())
    .sort((a, b) => b.time - a.time)
    .map((x, index) => {
      const m = x.value;
      const versionRaw = m?.version_name ?? m?.version ?? m?.version_code ?? `版本 ${index + 1}`;
      const version = String(versionRaw || '—');
      const dateRaw = m?.release_date ?? m?.releaseDate ?? m?.created_at ?? m?.update_time ?? m?.last_update ?? null;
      const dateText = formatTimestamp(dateRaw);

      const newFeatures = String(m?.new_features || '').trim();
      let description = newFeatures;
      if (!description) {
        const parts: string[] = [];
        const compileSdk = m?.compile_sdk_version;
        const minSdk = m?.min_sdk ?? m?.minsdk ?? m?.target_sdk;
        const downloadCount = m?.download_count;
        const fileSize = m?.size_bytes ?? m?.file_size ?? m?.size;
        if (compileSdk) parts.push(`编译SDK版本: ${compileSdk}`);
        if (minSdk) parts.push(`最低支持SDK: ${minSdk}`);
        if (downloadCount) parts.push(`累计下载: ${Number(downloadCount).toLocaleString()}次`);
        if (fileSize) parts.push(`安装包大小: ${latestSizeText.value}`);
        description = parts.length ? (index === 0 ? `最新版本 - ${parts.join(' | ')}` : `历史版本 - ${parts.join(' | ')}`) : (index === 0 ? '当前最新版本' : '历史版本');
      }

      return { key: x.key, version, dateText, description };
    });

  return deduped;
});



/** 分享本页：带应用图标 + 名称 / 开发者 / 简介，系统分享面板不支持时退回复制 */
const copyLink = () => shareCurrentPage('已复制应用分享信息');

const openAppGallery = () => {
  const pkg = appDetail.value?.pkg_name;
  const id = appDetail.value?.app_id || appId.value;
  if (pkg) {
    window.open(`https://appgallery.huawei.com/app/detail?id=${encodeURIComponent(pkg)}`, '_blank');
    return;
  }
  if (id) {
    window.open(`https://appgallery.huawei.com/app/${encodeURIComponent(id)}`, '_blank');
    return;
  }
  ElMessage.warning('无法获取应用标识');
};

const fetchDetail = async () => {
  if (!appId.value) return;
  loading.value = true;
  try {
    const res: any = await hmApi.get<any>(`apps/app_id/${encodeURIComponent(appId.value)}`);
    const data = res?.data || res;
    const info = data?.info || data?.full_info || data || {};
    const ratingRaw = data?.rating || info?.rating || {};
    appDetail.value = { ...info, rating: ratingRaw };

    const title = appDetail.value?.name || '应用更新详情';
    // 深链接直接进来时没有上一页，兜底回更新列表
    layoutStore.setPageInfo(title, true, () => goBackOrHome(router, '/updates'));
    document.title = `OpenStore | ${title}`;
    // 分享卡片带上这个应用自己的图标和文字
    setPageShareMeta(buildAppShareMeta(appDetail.value));

    // 分享 / meta 描述统一由 page-share 决定：这里要的是「应用简介」（brief_desc），
    // 不是详情里的长「应用说明」，所以不再单独改写 meta description。

    const pkg = appDetail.value?.pkg_name;
    if (pkg) {
      const mRes: any = await hmApi.get<any>(`apps/metrics/${encodeURIComponent(pkg)}`);
      const mData = mRes?.data || mRes;
      metrics.value = Array.isArray(mData) ? mData : Array.isArray(mData?.data) ? mData.data : [];
    } else {
      metrics.value = [];
    }
  } catch (e) {
    appDetail.value = null;
    metrics.value = [];
    ElMessage.error('获取应用详情失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchDetail();
});

/**
 * 「开发者 · 包名」与「应用简介」来回切换的定时器。
 * 页面在 keep-alive 里切走只是挂起，不停掉的话定时器会在后台一直改 ref、反复重渲染。
 */
const startSubtitleRotate = () => {
  if (subtitleTimer !== null) return;
  subtitleTimer = window.setInterval(() => {
    if (subtitleLines.value.length > 1) {
      rotateIndex.value = (rotateIndex.value + 1) % subtitleLines.value.length;
    }
  }, SUBTITLE_ROTATE_MS);
};

const stopSubtitleRotate = () => {
  if (subtitleTimer !== null) {
    window.clearInterval(subtitleTimer);
    subtitleTimer = null;
  }
};

useActiveScope(startSubtitleRotate, stopSubtitleRotate);

onBeforeUnmount(() => {
  clearPageShareMeta();
});
</script>

<style scoped>
.updates-app-detail-view {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 80vh;
}

.detail-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

/* 分享 / 获取两个按钮同尺寸 */
.detail-header :deep(.detail-action) {
  width: 88px;
  height: 32px;
  padding: 0;
}


.detail-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  padding: 16px;
}

.basic-card {
  display: flex;
  gap: 16px;
  align-items: center;
}

.app-icon {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  flex: 0 0 auto;
  overflow: hidden;
}

.image-slot {
  width: 80px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  border-radius: 16px;
}

.basic-info {
  flex: 1;
  min-width: 0;
}

.app-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-subtitle {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 副标题轮播时的淡入淡出 */
.subtitle-fade-enter-active,
.subtitle-fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.subtitle-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.subtitle-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.basic-stats {
  display: flex;
  gap: 16px;
  margin-top: 10px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  padding: 14px;
}

.metric-title {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  min-height: 20px;
}

.history-card {
  padding: 0;
  overflow: hidden;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
}

.history-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.history-count {
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.history-chevron {
  transition: transform 0.2s ease;
  color: var(--el-text-color-secondary);
}

.history-chevron.open {
  transform: rotate(180deg);
}

.history-body {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 14px 16px 16px;
}

.history-empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-fill-color-blank);
}

.history-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
}

.history-version {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.history-date {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: 0 0 auto;
}

.history-desc {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
