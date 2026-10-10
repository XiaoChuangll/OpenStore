<template>
  <div class="app-detail-view" v-loading="loading">
    <div class="detail-shell" v-if="appDetail">
      <!-- 头部：图标 + 名称 + 关键指标 + 操作 -->
      <header class="hero-card">
        <el-image :src="appDetail.icon_url" class="hero-icon" fit="cover">
          <template #error>
            <div class="image-slot">
              <el-icon><Picture /></el-icon>
            </div>
          </template>
        </el-image>

        <div class="hero-main">
          <div class="hero-head">
            <h1 class="hero-name">{{ appDetail.name }}</h1>
            <span v-if="appDetail.kind_name" class="hero-tag">{{ appDetail.kind_name }}</span>
          </div>
          <p class="hero-sub" :title="appDetail.pkg_name">
            {{ appDetail.developer_name || '未知开发者' }}
            <span class="hero-dot">·</span>
            <span class="hero-pkg">{{ appDetail.pkg_name || '—' }}</span>
          </p>

          <!-- 关键指标：评分 / 下载量 / 大小 / 版本 -->
          <div class="hero-stats">
            <div class="stat">
              <span class="stat-value">{{ appDetail.average_rating || appDetail.rating_score || '—' }}</span>
              <span class="stat-label">评分</span>
            </div>
            <div class="stat">
              <span class="stat-value" :title="rawDownloadCount">{{ downloadText }}</span>
              <span class="stat-label">下载量</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ appDetail.size_str || formatSize(appDetail.size) }}</span>
              <span class="stat-label">大小</span>
            </div>
            <div class="stat">
              <span class="stat-value">{{ appDetail.version || appDetail.app_version || '—' }}</span>
              <span class="stat-label">版本</span>
            </div>
          </div>
        </div>

        <div class="hero-actions">
          <el-button type="primary" round @click="handleInstall">获取</el-button>
          <el-tooltip content="分享本页" placement="bottom" :show-after="200">
            <el-button round @click="copyLink" aria-label="分享">
              <el-icon><HarmonyShareIcon /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </header>

      <!-- 正文：左侧介绍，右侧详细信息 -->
      <div class="detail-body">
        <!-- 左栏：应用介绍 + 更新记录竖排（同一容器，介绍不长时不留空隙） -->
        <div class="detail-main">
          <section ref="introPanelRef" class="panel intro-panel">
            <h2 class="panel-title">应用介绍</h2>
            <!-- 桌面端：介绍比右侧「技术信息」底部还长时收住，给展开 / 收起 -->
            <div
              ref="introBodyRef"
              class="intro-body"
              :class="{ 'is-clamped': isIntroClamped }"
              :style="introClampStyle"
            >
              <p class="panel-text">{{ appDetail.description || appDetail.intro || '暂无介绍' }}</p>

              <template v-if="newFeatures">
                <h2 class="panel-title is-spaced">新版本特性</h2>
                <p class="panel-text">{{ newFeatures }}</p>
              </template>
            </div>

            <div v-if="introOverflows" ref="introToggleRowRef" class="intro-toggle-row">
              <button type="button" class="intro-toggle" @click="toggleIntro">
                <span>{{ introExpanded ? '收起' : '展开' }}</span>
                <el-icon :size="12" class="intro-toggle-icon" :class="{ 'is-open': introExpanded }">
                  <ArrowDown />
                </el-icon>
              </button>
            </div>
          </section>

          <!-- 更新记录：样式同「更新」页的更新历史，默认两条、按批展开 -->
          <section v-if="updateRecords.length" class="panel update-panel">
            <!-- 整条头部可点，箭头指示开合 -->
            <div
              class="update-header"
              role="button"
              tabindex="0"
              :aria-expanded="!updatesCollapsed"
              @click="toggleUpdatesCollapse"
              @keydown.enter.prevent="toggleUpdatesCollapse"
              @keydown.space.prevent="toggleUpdatesCollapse"
            >
              <h2 class="update-title">
                <el-icon><Clock /></el-icon>
                更新记录
                <span class="update-count">({{ updateRecords.length }})</span>
              </h2>
              <el-icon
                v-if="updateRecords.length > UPDATE_PREVIEW_COUNT"
                class="update-chevron"
                :class="{ 'is-open': !updatesCollapsed }"
              >
                <ArrowDown />
              </el-icon>
            </div>

            <div class="update-body">
              <ol ref="updateListRef" class="update-list" :style="updateListStyle">
                <li v-for="item in visibleUpdates" :key="item.key" class="update-item">
                  <div class="update-item-head">
                    <span class="update-version">{{ item.version }}</span>
                    <span class="update-date">{{ item.dateText }}</span>
                  </div>
                  <p v-if="item.description" class="update-desc">{{ item.description }}</p>
                </li>
              </ol>

              <div v-if="!updatesCollapsed && hasMoreUpdates" class="intro-toggle-row">
                <button type="button" class="intro-toggle" @click="showMoreUpdates">
                  <span>展开更多</span>
                  <el-icon :size="12" class="intro-toggle-icon">
                    <ArrowDown />
                  </el-icon>
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside ref="sideRef" class="side">
          <!-- 区域一：应用信息 -->
          <section class="panel">
            <h2 class="panel-title">应用信息</h2>
            <dl class="info-list">
              <div class="info-row">
                <dt>分类</dt>
                <dd>{{ appDetail.kind_name || '—' }}</dd>
              </div>
              <div class="info-row">
                <dt>开发者</dt>
                <dd :title="appDetail.developer_name">{{ appDetail.developer_name || '—' }}</dd>
              </div>
              <div v-if="appDetail.listed_at" class="info-row">
                <dt>上架时间</dt>
                <dd>{{ formatDate(appDetail.listed_at) }}</dd>
              </div>
              <div class="info-row">
                <dt>更新时间</dt>
                <dd>{{ updatedAtText }}</dd>
              </div>
              <div v-if="ratingCount" class="info-row">
                <dt>评分人数</dt>
                <dd>{{ ratingCount.toLocaleString('zh-CN') }} 人</dd>
              </div>
            </dl>

            <div v-if="appDetail.privacy_url" class="privacy-row">
              <span class="privacy-label">隐私政策</span>
              <el-button size="small" round tag="a" :href="appDetail.privacy_url" target="_blank" rel="noopener">
                查看
              </el-button>
            </div>
          </section>

          <!-- 区域二：技术信息 -->
          <section class="panel">
            <h2 class="panel-title">技术信息</h2>
            <dl class="info-list">
              <div v-if="deviceItems.length" class="info-row is-stacked">
                <dt>支持设备</dt>
                <dd class="device-chips">
                  <span
                    v-for="item in deviceItems"
                    :key="item.key"
                    class="chip is-icon-only"
                    :title="item.label"
                    :aria-label="item.label"
                  >
                    <el-icon><DeviceIcon :kind="item.kind" /></el-icon>
                  </span>
                </dd>
              </div>
              <div v-if="sdkPills.length" class="info-row is-stacked">
                <dt>API 级别</dt>
                <dd class="device-chips">
                  <span v-for="pill in sdkPills" :key="pill" class="chip">{{ pill }}</span>
                </dd>
              </div>
              <div class="info-row">
                <dt>应用 ID</dt>
                <dd class="is-mono" :title="appDetail.app_id">{{ appDetail.app_id || '—' }}</dd>
              </div>
              <div class="info-row">
                <dt>包名</dt>
                <dd class="is-mono" :title="appDetail.pkg_name">{{ appDetail.pkg_name || '—' }}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>

    <el-empty v-else-if="!loading" description="未找到应用信息" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowDown, Clock, Picture } from '@element-plus/icons-vue';
import HarmonyShareIcon from '../components/HarmonyShareIcon.vue';
import DeviceIcon, { type DeviceKind } from '../components/DeviceIcon.vue';
import { ElMessage } from 'element-plus';
import { getAppDetail } from '../services/next-api';
import { hmApi } from '../services/hm-api';
import { useLayoutStore } from '../stores/layout';
import { goBackOrHome } from '../utils/route-scroll';
import { buildAppShareMeta, clearPageShareMeta, setPageShareMeta, shareCurrentPage } from '../utils/page-share';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();
const loading = ref(false);
const appDetail = ref<any>(null);
/** 版本快照（apps/metrics/{pkg}）：更新记录取自这里 */
const metrics = ref<any[]>([]);
/** 更新记录默认只露两条，之后每次「展开更多」再放一批 */
const UPDATE_PREVIEW_COUNT = 2;
const UPDATE_STEP = 5;
const updatesShown = ref(UPDATE_PREVIEW_COUNT);

/** 新版本说明：上游字段名不固定，兜一下 */
const newFeatures = computed(() => appDetail.value?.new_features || appDetail.value?.upgrade_msg || '');

/*
 * 更新记录：上游 apps/metrics/{pkg} 每个版本一条快照（可能重复），
 * 按版本去重后用 release_date 从新到旧排；created_at 是抓取时刻，不能当发布日期。
 */
const metricReleaseMs = (metric: any) => {
  const raw = metric?.release_date ?? metric?.releaseDate ?? metric?.created_at;
  const numeric = typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw.trim())) ? Number(raw) : NaN;
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = new Date(String(raw ?? ''));
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
};

/** 列表里日期只到天 */
const formatUpdateDay = (ms: number) => {
  if (!ms) return '—';
  const date = new Date(ms);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

const updateRecords = computed(() => {
  const bestByVersion = new Map<string, any>();
  for (const metric of metrics.value) {
    const version = String(metric?.version ?? metric?.version_name ?? '').trim();
    if (!version) continue;
    const previous = bestByVersion.get(version);
    if (!previous || metricReleaseMs(previous) < metricReleaseMs(metric)) bestByVersion.set(version, metric);
  }
  return Array.from(bestByVersion.entries())
    .map(([version, metric]) => {
      const time = metricReleaseMs(metric);
      return {
        key: version,
        version,
        time,
        dateText: formatUpdateDay(time),
        description: String(metric?.new_features ?? metric?.upgrade_msg ?? '').trim()
      };
    })
    .sort((a, b) => b.time - a.time);
});

const visibleUpdates = computed(() => updateRecords.value.slice(0, updatesShown.value));
const hasMoreUpdates = computed(() => updatesShown.value < updateRecords.value.length);
/** 折叠 = 只留最近两条（不是全收起来） */
const updatesCollapsed = computed(() => updatesShown.value <= UPDATE_PREVIEW_COUNT);

/* 改动条数时给列表钉一个像素高度做过渡（曲线同「应用介绍」），动画结束再放开 */
const updateListRef = ref<HTMLElement | null>(null);
/** 过渡用的像素高度；null = 不限高 */
const updateListHeight = ref<number | null>(null);
const updateListStyle = computed(() =>
  updateListHeight.value === null ? {} : { height: `${updateListHeight.value}px` }
);
let updateListTimer = 0;

/** 改动展示条数：先钉住当前高度，等新条目进 DOM 之后再过渡到新高度 */
const showUpdateCount = async (next: number) => {
  if (next === updatesShown.value) return;
  const from = updateListRef.value?.offsetHeight ?? 0;

  if (updateListTimer) window.clearTimeout(updateListTimer);
  updateListHeight.value = from;
  await nextTick();

  updatesShown.value = next;
  await nextTick();

  /* 不能用 scrollHeight：收起时列表还钉着旧高度，量不到变矮后的内容高度 */
  const listEl = updateListRef.value;
  const lastItem = listEl?.lastElementChild as HTMLElement | null;
  const target = listEl && lastItem
    ? Math.round(lastItem.getBoundingClientRect().bottom - listEl.getBoundingClientRect().top)
    : from;
  // 强制回流，否则两个高度会被合并成一帧、过渡不生效
  void listEl?.offsetHeight;
  updateListHeight.value = target;

  updateListTimer = window.setTimeout(() => {
    updateListTimer = 0;
    updateListHeight.value = null;
  }, 340);
};

/** 头部按钮：折叠 / 展开（展开先放一批） */
const toggleUpdatesCollapse = () => {
  const next = updatesCollapsed.value
    ? Math.min(updateRecords.value.length, UPDATE_PREVIEW_COUNT + UPDATE_STEP)
    : UPDATE_PREVIEW_COUNT;
  void showUpdateCount(next);
};

/** 底部「展开更多」：再放一批 */
const showMoreUpdates = () => {
  void showUpdateCount(Math.min(updateRecords.value.length, updatesShown.value + UPDATE_STEP));
};

/** 更新记录是次要信息：详情渲染后再补请求，失败按无记录处理 */
const loadUpdateRecords = async () => {
  const pkg = appDetail.value?.pkg_name;
  if (!pkg) return;
  updatesShown.value = UPDATE_PREVIEW_COUNT;
  try {
    const res: any = await hmApi.get<any>(`apps/metrics/${encodeURIComponent(pkg)}`);
    const data = res?.data ?? res;
    metrics.value = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  } catch (error) {
    console.warn('[app-detail] 更新记录加载失败', error);
    metrics.value = [];
  }
};

/** 设备码 → 名称 + 图标（与应用页设备页签同一套图标；7 = 手表） */
const DEVICE_CODE_META: Record<string, { key: string; label: string; kind: DeviceKind }> = {
  '0': { key: 'phone', label: '手机', kind: 'phone' },
  '3': { key: 'tv', label: '智慧屏', kind: 'tv' },
  '4': { key: 'tablet', label: '平板', kind: 'tablet' },
  '7': { key: 'watch', label: '手表', kind: 'watch' },
  '15': { key: 'pc', label: '电脑', kind: 'pc' }
};

/** 支持的设备：main_device_codes -> 手机 / 平板 / 手表 … */
const deviceItems = computed(() => {
  const raw = appDetail.value?.main_device_codes ?? appDetail.value?.device_codes ?? appDetail.value?.device_code_list;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? raw.split(',') : [];
  const items = list.map((code: any) => DEVICE_CODE_META[String(Number(code))]).filter(Boolean);
  return items.filter((item, index) => items.findIndex((x) => x.key === item!.key) === index);
});

/** 评分人数 */
const ratingCount = computed(() => {
  const raw = appDetail.value?.total_star_rating_count ?? appDetail.value?.info_rate_count;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : 0;
});

/*
 * 桌面端「应用介绍」限高：右栏（应用信息 + 技术信息）到底有多少，介绍就显示多少，
 * 超出的部分收起来给个展开 / 收起。手机端是单列，不做限高。
 */
const introPanelRef = ref<HTMLElement | null>(null);
const introBodyRef = ref<HTMLElement | null>(null);
const introToggleRowRef = ref<HTMLElement | null>(null);
const sideRef = ref<HTMLElement | null>(null);
/** 介绍正文允许的高度（px），由右栏底部决定 */
const introAvailableHeight = ref(0);
/** 介绍正文的完整高度（px），展开时作为动画目标高度 */
const introContentHeight = ref(0);
/** 正文是否高过右栏底部（只有超过才给展开按钮） */
const introOverflows = ref(false);
const introExpanded = ref(false);

/** 与 .detail-body 的断点保持一致：>1000px 才是左右两栏（CSS 为 max-width: 1000px 时改单列） */
const INTRO_CLAMP_MIN_WIDTH = 1001;
/** 再挤也要留出这么多介绍高度，否则小屏笔记本上只剩两行 */
const INTRO_MIN_HEIGHT = 180;
/** 展开 / 收起那一行的高度（首帧按钮还没渲染时先按这个留位，保证和右栏平齐） */
const INTRO_TOGGLE_ROW_FALLBACK = 33;
/** 手机端单列：介绍最多显示这么高（再长就收起），取屏高的 45%，并限制在 240–360px */
const INTRO_MOBILE_MIN_HEIGHT = 240;
const INTRO_MOBILE_MAX_HEIGHT = 360;
const INTRO_MOBILE_HEIGHT_RATIO = 0.45;

const isIntroClamped = computed(() => introOverflows.value && !introExpanded.value);
/*
 * 展开 / 收起都写具体像素高度（不用 none），这样 max-height 才能过渡出动画；
 * 不超长时干脆不限高。
 */
const introClampStyle = computed(() => {
  if (!introOverflows.value) return {};
  const target = introExpanded.value ? introContentHeight.value : introAvailableHeight.value;
  return { maxHeight: `${target}px` };
});

let introObserver: ResizeObserver | null = null;
let introMeasureRaf = 0;

const measureIntro = () => {
  introMeasureRaf = 0;
  const panel = introPanelRef.value;
  const body = introBodyRef.value;
  const side = sideRef.value;
  if (!panel || !body || !side) return;

  // 展开 / 收起那一行的高度：已经渲染就量，没渲染就按固定值留位（否则第一次量会多出 30px）
  const toggleRow = introToggleRowRef.value;
  const toggleRowHeight = toggleRow ? toggleRow.offsetHeight + 6 : INTRO_TOGGLE_ROW_FALLBACK;

  let available: number;
  if (window.innerWidth >= INTRO_CLAMP_MIN_WIDTH) {
    // 桌面端两栏：介绍高度跟着右侧「技术信息」的底部走
    const overhead = panel.offsetHeight - body.offsetHeight - (toggleRow ? toggleRow.offsetHeight + 6 : 0);
    available = Math.max(INTRO_MIN_HEIGHT, side.offsetHeight - overhead - toggleRowHeight);
  } else {
    // 手机端单列：右侧信息在下面，改按屏高的比例收住
    const ratio = window.innerHeight * INTRO_MOBILE_HEIGHT_RATIO;
    available = Math.round(Math.min(INTRO_MOBILE_MAX_HEIGHT, Math.max(INTRO_MOBILE_MIN_HEIGHT, ratio)));
  }

  introAvailableHeight.value = available;
  introContentHeight.value = body.scrollHeight;
  const overflows = body.scrollHeight > available + 2;
  if (overflows !== introOverflows.value) introOverflows.value = overflows;
  if (!overflows) introExpanded.value = false;
};

/** 多次触发合并到一帧，避免 ResizeObserver 里改高度又触发自己 */
const scheduleIntroMeasure = () => {
  if (introMeasureRaf) return;
  introMeasureRaf = window.requestAnimationFrame(measureIntro);
};

const toggleIntro = () => {
  introExpanded.value = !introExpanded.value;
  nextTick(scheduleIntroMeasure);
};

/*
 * 应用更新时间：上游的 updated_at / rating_created_at 都是「我们这边同步数据的时刻」，
 * 真正代表版本发布/更新的是 release_date（毫秒时间戳），拿它换算才对得上应用市场里的更新时间。
 */
const updatedAtText = computed(() => {
  const detail = appDetail.value || {};
  const release = detail.release_date ?? detail.releaseDate;
  if (release) return formatDate(release);
  return formatDate(detail.update_time || detail.updated_at);
});

/** API 级别：拆成两枚胶囊「最小 21」「目标 24」 */
const sdkPills = computed(() => {
  const detail = appDetail.value || {};
  const min = detail.minsdk ?? detail.min_sdk ?? detail.min_hmos_api_level;
  const target = detail.target_sdk ?? detail.targetSdk;
  const parts: string[] = [];
  if (min !== undefined && min !== null && min !== '') parts.push(`最小 ${min}`);
  if (target !== undefined && target !== null && target !== '') parts.push(`目标 ${target}`);
  return parts;
});

/** 下载量原始值（用于 hover 提示） */
const rawDownloadCount = computed(() => {
  const raw = appDetail.value?.download_count ?? appDetail.value?.down_count;
  return raw === undefined || raw === null ? '' : String(raw);
});

/** 下载量按 亿 / 万 压缩显示：73033350 -> 7,303万 */
const downloadText = computed(() => {
  const detail = appDetail.value;
  if (!detail) return '—';
  const str = detail.download_count_str || detail.down_count_desc;
  // 上游有时把纯数字塞进 *_str 字段，那种情况统一走下面的压缩格式化
  if (str && !/^\d+$/.test(String(str).trim())) return String(str);
  const raw = detail.download_count ?? detail.down_count;
  if (raw === undefined || raw === null || raw === '') return '—';
  const num = Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  if (num > 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num > 10000) return (num / 10000).toFixed(1) + '万';
  return num.toLocaleString('zh-CN');
});

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
  // 上游的 release_date 是毫秒时间戳（偶尔是秒），也有的字段是 "2025/6/24 21:05:07" 这种字符串
  let value: string | number = date;
  if (typeof date === 'string' && /^\d+$/.test(date.trim())) value = Number(date);
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleString('zh-CN', { hour12: false });
  }
  // 可能是 ISO（2025-09-01T17:56:43+08:00），也可能是 "2025/6/24 21:05:07"
  const raw = String(value);
  const iso = new Date(raw);
  if (Number.isFinite(iso.getTime())) return iso.toLocaleString('zh-CN', { hour12: false });
  const fallback = new Date(raw.replace(/-/g, '/'));
  return Number.isFinite(fallback.getTime()) ? fallback.toLocaleString('zh-CN', { hour12: false }) : raw;
};

/** 分享本页：带应用图标 + 名称 / 开发者 / 简介，系统分享面板不支持时退回复制 */
const copyLink = () => shareCurrentPage('已复制应用分享信息');

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
      // 深链接直接进来时没有上一页，兜底回应用列表
      layoutStore.setPageInfo(title, true, () => goBackOrHome(router, '/apps'));
      document.title = `OpenStore | ${title}`;
      // 分享卡片带上这个应用自己的图标和文字
      setPageShareMeta(buildAppShareMeta(appDetail.value));
      // 不 await：不拖住首屏
      void loadUpdateRecords();
    }
  } catch (error) {
    console.error('Failed to fetch app detail:', error);
    ElMessage.error('获取应用详情失败');
  } finally {
    loading.value = false;
    // 正文渲染出来之后再量一次高度，决定要不要收起
    nextTick(scheduleIntroMeasure);
  }
};

onMounted(() => {
  fetchDetail();
  window.addEventListener('resize', scheduleIntroMeasure);
  if (typeof ResizeObserver !== 'undefined') {
    introObserver = new ResizeObserver(scheduleIntroMeasure);
  }
  nextTick(() => {
    // 右栏高度决定介绍能显示多高，它一变就重新量
    if (introObserver && sideRef.value) introObserver.observe(sideRef.value);
    scheduleIntroMeasure();
  });
});

// 文本与右栏高度变化后重算（切回缓存的页面时也要再量一次）
watch(appDetail, () => nextTick(scheduleIntroMeasure));
// 按钮行第一次出现 / 消失后，行高才量得准，再补一次测量
watch(introOverflows, () => nextTick(scheduleIntroMeasure));
onActivated(() => nextTick(scheduleIntroMeasure));

onUnmounted(() => {
  window.removeEventListener('resize', scheduleIntroMeasure);
  if (introMeasureRaf) window.cancelAnimationFrame(introMeasureRaf);
  introObserver?.disconnect();
  introObserver = null;
  clearPageShareMeta();
});
</script>

<style scoped>
.app-detail-view {
  padding: 16px 20px 32px;
  max-width: 1120px;
  margin: 0 auto;
  min-height: 80vh;
}

/* ---------- 头部：图标 + 名称 + 指标 + 操作 ---------- */
.hero-card {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 24px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  box-shadow: var(--el-box-shadow-light);
}

.hero-icon {
  flex: 0 0 auto;
  width: 96px;
  height: 96px;
  border-radius: 22px;
  border: 1px solid var(--el-border-color-extra-light);
}

.hero-main {
  flex: 1 1 auto;
  min-width: 0;
}

.hero-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hero-name {
  margin: 0;
  font-size: 26px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.hero-tag {
  padding: 2px 10px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.hero-sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.hero-dot {
  flex: 0 0 auto;
}

.hero-pkg {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SFMono-Regular', Consolas, monospace;
}

/* 四个关键指标：分隔线用边框，窄屏自动折行 */
.hero-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 26px;
  margin-top: 16px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hero-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ---------- 正文：左介绍 + 右信息 ---------- */
.detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  margin-top: 16px;
  align-items: start;
}

/* 左栏：应用介绍 + 更新记录竖排 */
.detail-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* 右侧两栏区块：应用信息 / 技术信息 */
.side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.panel {
  padding: 20px 24px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 16px;
  box-shadow: var(--el-box-shadow-light);
}

.panel-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-title.is-spaced {
  margin-top: 24px;
}

.panel-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 「应用介绍」限高：右栏到底就不再多显示，底部渐隐 + 展开 / 收起 */
.intro-panel {
  display: flex;
  flex-direction: column;
}

.intro-body {
  position: relative;
  min-height: 0;
  overflow: hidden;
  /* 展开 / 收起的高度过渡 */
  transition: max-height 0.32s cubic-bezier(0.25, 1, 0.5, 1);
}

/* 底部渐隐：收起时淡入，展开时淡出 */
.intro-body::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72px;
  background: linear-gradient(to bottom, transparent, var(--el-bg-color) 82%);
  opacity: 0;
  transition: opacity 0.24s ease;
  pointer-events: none;
}

.intro-body.is-clamped::after {
  opacity: 1;
}

.intro-toggle-row {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

/* 展开 / 收起：小胶囊，不用 el-button，免得它的默认样式在深色下脏 */
.intro-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12.5px;
  line-height: 1.6;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.intro-toggle:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-5);
  background-color: var(--el-color-primary-light-9);
}

.intro-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 2px;
}

.intro-toggle-icon {
  transition: transform 0.2s ease;
}

.intro-toggle-icon.is-open {
  transform: rotate(180deg);
}

/* ---------- 更新记录 ---------- */
/* 造型同「更新」页的更新历史：卡片不内缩，头部与内容各自带内边距 */
.update-panel {
  padding: 0;
  overflow: hidden;
}

.update-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
  user-select: none;
}

.update-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.update-count {
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.update-chevron {
  transition: transform 0.2s ease;
  color: var(--el-text-color-secondary);
}

.update-chevron.is-open {
  transform: rotate(180deg);
}

.update-body {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 14px 16px 16px;
}

.update-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  /* 展开 / 收起时列表高度过渡 */
  overflow: hidden;
  transition: height 0.32s cubic-bezier(0.25, 1, 0.5, 1);
}

.update-item {
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-fill-color-blank);
}

.update-item-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
}

.update-version {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  /* 等宽数字，版本号更整齐 */
  font-variant-numeric: tabular-nums;
}

.update-date {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.update-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 「展开更多」hover / 按下只变文字色，不点亮整颗胶囊（focus-visible 描边保留） */
.update-body .intro-toggle:hover,
.update-body .intro-toggle:active {
  border-color: var(--el-border-color);
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

/* 右侧信息表：标签左、值右，长包名省略号不换行 */
.info-list {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row dt {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.info-row dd {
  margin: 0;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-row dd.is-mono {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-weight: 400;
}

/* 支持设备：标签竖排更省宽度，值在右侧一列排开 */
.info-row.is-stacked {
  align-items: flex-start;
}

.device-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}

/* 只有图标的设备组之间留宽一点 */
.device-chips:has(.is-icon-only) {
  gap: 10px;
}

/* 支持设备 / API 级别用的胶囊 */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 18px;
}

.chip :deep(svg) {
  width: 1em;
  height: 1em;
}

/* 支持设备：不要胶囊底，只留图标本身（名称走 title/aria-label） */
.chip.is-icon-only {
  width: auto;
  height: auto;
  padding: 0;
  background: transparent;
  /* 公共 .chip 带 1px 描边：盒子只有图标那么大，配上 999px 圆角就成了一个圆圈套着图标 */
  border: none;
  justify-content: center;
}

/* el-icon 的 svg 尺寸跟着 font-size 走 */
.chip.is-icon-only :deep(.el-icon) {
  font-size: 19px;
}

/* 「获取」与「分享」两个胶囊保持同样大小 */
.hero-actions :deep(.el-button) {
  width: 88px;
  height: 32px;
  padding: 0;
}

.privacy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--el-border-color-extra-light);
}

.privacy-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.image-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  background-color: var(--el-fill-color-light);
  font-size: 22px;
}

/* ---------- 自适应 ---------- */
@media (max-width: 1000px) {
  .detail-body {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 单列时更新记录排到最后：拆开左栏容器（display: contents）后用 order 排序 */
  .detail-main {
    display: contents;
  }

  .intro-panel {
    order: 0;
  }

  .side {
    order: 1;
  }

  .update-panel {
    order: 2;
  }
}

@media (max-width: 768px) {
  .app-detail-view {
    padding: 12px 12px 24px;
  }

  .hero-card {
    /* 手机上：图标与名称并排，副标题 / 四个指标 / 操作按钮各占整行 */
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px 14px;
    padding: 16px;
  }

  .hero-icon {
    grid-area: 1 / 1 / 2 / 2;
    width: 64px;
    height: 64px;
    border-radius: 16px;
  }

  .hero-main {
    display: contents;
  }

  .hero-head {
    grid-area: 1 / 2 / 2 / 3;
  }

  .hero-sub {
    grid-area: 2 / 1 / 3 / -1;
  }

  .hero-name {
    font-size: 19px;
  }

  .hero-tag {
    font-size: 11px;
    padding: 1px 8px;
  }

  .hero-sub {
    flex-wrap: wrap;
    gap: 2px 8px;
    margin-top: 0;
    font-size: 12px;
  }

  /* 手机上包名不再强行省略，折行完整显示 */
  .hero-pkg {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .hero-stats {
    /* 手机上也要一行四个：等宽四列，值过长就省略（hover/长按有完整值） */
    grid-area: 3 / 1 / 4 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-top: 2px;
    gap: 8px;
  }

  .stat-value {
    font-size: 14px;
    max-width: 100%;
  }

  .stat-label {
    font-size: 11px;
  }

  .hero-actions {
    grid-area: 4 / 1 / 5 / -1;
    width: 100%;
    justify-content: flex-start;
    gap: 10px;
  }

  /* 「获取」占满剩余宽度，两个图标按钮跟在后面 */
  .hero-actions :deep(.el-button) {
    flex: 1 1 0;
    width: auto;
  }

  .detail-body {
    margin-top: 12px;
    gap: 12px;
  }

  .panel {
    padding: 14px 16px;
    border-radius: 14px;
  }

  .panel-title {
    font-size: 15px;
  }

  .panel-text {
    font-size: 13.5px;
    line-height: 1.7;
  }

  .info-row {
    padding: 8px 0;
  }

  .info-row dd {
    font-size: 13px;
  }
}

/* 更窄的手机：四个指标还是排一行，只把字号和内边距收紧，避免数值被省略 */
@media (max-width: 420px) {
  .hero-card {
    padding: 14px 12px;
  }

  .hero-stats {
    gap: 6px;
  }

  .stat-value {
    font-size: 13px;
  }

  .stat-label {
    font-size: 10.5px;
  }
}

/* 极窄（≤340px）：四个指标仍在一行，数值允许折成两行，保证完整显示 */
@media (max-width: 340px) {
  /* 数值折成两行时，四个标签仍对齐在同一基线上 */
  .hero-stats {
    align-items: end;
  }

  .stat-value {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
}

</style>
