<template>
  <div class="updates-app-detail-view" v-loading="loading">
    <div v-if="appDetail" class="detail-container">
      <div class="detail-header">
        <el-button round @click="copyLink">
          <el-icon><Share /></el-icon>
        </el-button>
        <el-button type="primary" round @click="openAppGallery">前往应用商店</el-button>
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
          <div class="app-subtitle">
            {{ appDetail.developer_name || '—' }} · {{ appDetail.pkg_name || '—' }}
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
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowDown, Clock, Picture, Share } from '@element-plus/icons-vue';
import { hmApi } from '../services/hm-api';
import { useLayoutStore } from '../stores/layout';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();

const loading = ref(false);
const historyOpen = ref(true);

const appDetail = ref<any>(null);
const metrics = ref<any[]>([]);

const appId = computed(() => String(route.params.id || '').trim());

const getMetricTimeMs = (m: any) => {
  const raw = m?.created_at || m?.update_time || m?.last_update || 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
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
  const raw = latestMetric.value?.created_at ?? latestMetric.value?.update_time ?? latestMetric.value?.last_update ?? appDetail.value?.update_time ?? appDetail.value?.created_at ?? null;
  if (!raw) return '—';
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('zh-CN') : '—';
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
    const time = getMetricTimeMs(m);
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
      const dateRaw = m?.created_at || m?.update_time || m?.last_update || null;
      const dateText = dateRaw ? new Date(dateRaw).toLocaleString('zh-CN') : '—';

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



const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.error('复制失败');
  }
};

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
    layoutStore.setPageInfo(title, true, () => router.back());
    document.title = `${title} - OpenStore`;

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
