<template>
  <div class="apps-view">
    <!-- Top Search Bar -->
    <div class="search-container">
      <el-input
        v-model="searchQuery"
        placeholder="搜索应用、游戏..."
        class="search-input"
        :prefix-icon="Search"
        size="large"
        @keyup.enter="handleSearch"
      >
        <template #suffix>
          <el-icon 
            v-if="searchQuery" 
            class="el-input__icon el-input__clear" 
            style="margin-right: 8px; cursor: pointer; color: var(--el-text-color-secondary);" 
            @click="searchQuery = ''"
          >
            <CircleClose />
          </el-icon>
          <el-button class="search-btn" text @click="handleSearch">
            搜索
          </el-button>
        </template>
      </el-input>
    </div>

    <div v-if="viewMode === 'home'" class="home-content">
      <!-- Device Tabs (Segmented Control) -->
      <div class="device-tabs-wrapper">
        <div class="device-tabs">
          <div
            v-if="categoriesLoading"
            class="device-tabs-progress-bar"
            :style="{ width: `${skeletonProgress}%` }"
          ></div>
          <div 
            class="tab-glider" 
            :style="{ 
              transform: `translateX(${devices.findIndex(d => d.key === activeDevice) * 100}%)`,
              width: `${100 / devices.length}%`
            }"
          ></div>
          <div 
            v-for="device in devices" 
            :key="device.key"
            class="device-tab"
            :class="{ active: activeDevice === device.key }"
            @click="activeDevice = device.key"
            :style="{ width: `${100 / devices.length}%` }"
          >
            <el-icon><component :is="device.icon" /></el-icon>
            <span class="tab-label">{{ device.label }}</span>
            <span v-if="deviceStats[device.key]" class="count-badge">{{ deviceStats[device.key] }}</span>
          </div>
        </div>
      </div>

      <!-- Categories Grid -->
      <div class="categories-grid-wrapper">
        <div v-if="showHomeSkeleton" class="categories-grid categories-grid-skeleton" aria-hidden="true">
          <div v-for="i in 12" :key="`category-skeleton-${i}`" class="category-card skeleton-category-card">
            <el-skeleton animated>
              <template #template>
                <div class="category-skeleton-content">
                  <el-skeleton-item variant="h3" class="category-skeleton-title" />
                  <div class="category-skeleton-count">
                    <el-skeleton-item variant="text" class="category-skeleton-number" />
                    <el-skeleton-item variant="text" class="category-skeleton-unit" />
                  </div>
                  <el-skeleton-item variant="circle" class="category-skeleton-icon" />
                </div>
              </template>
            </el-skeleton>
          </div>
        </div>

        <transition v-else name="categories-page" mode="out-in">
          <div :key="categoryPageKey" class="categories-grid categories-page-shell">
            <div 
              v-for="(category, index) in categories" 
              :key="index"
              class="category-card"
              :style="{ backgroundColor: category.color }"
              @click="handleCategoryClick(category)"
            >
              <div class="category-name">{{ category.name }}</div>
              <div class="category-count-badge">
                <span class="category-count-badge-number">{{ formatCategoryCount(category.count) }}</span>
                <span class="category-count-badge-unit">应用</span>
              </div>
              <div class="category-icon-bg">
                <el-icon><component :is="category.icon || Connection" /></el-icon>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- Apps Grid (Search/Category) -->
    <div v-else class="apps-container">
      <div class="view-header">
        <el-button circle @click="handleBack" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <h2 class="view-title">{{ pageTitle }}</h2>
        <div class="view-total-badge">共 {{ formatCategoryCount(totalCount || appList.length) }} 个应用</div>
      </div>

      <div class="apps-grid-container">
        <div v-if="loading" class="apps-grid">
          <div class="app-card skeleton-card" v-for="i in 12" :key="i">
            <el-skeleton animated>
              <template #template>
                <div class="skeleton-content">
                  <el-skeleton-item variant="image" class="skeleton-icon" />
                  <div class="skeleton-info">
                    <el-skeleton-item variant="h3" style="width: 50%; margin-bottom: 8px;" />
                    <el-skeleton-item variant="text" style="width: 80%; margin-bottom: 8px;" />
                    <div class="skeleton-meta">
                      <el-skeleton-item variant="text" style="width: 40px; height: 16px; margin-right: 8px;" />
                      <el-skeleton-item variant="text" style="width: 60px; height: 16px;" />
                    </div>
                  </div>
                  <el-skeleton-item variant="text" style="width: 50px; height: 20px; border-radius: 12px;" />
                </div>
              </template>
            </el-skeleton>
          </div>
        </div>
        <el-empty v-else-if="appList.length === 0" description="暂无应用" />
        <div class="apps-grid" v-else>
          <AppCard 
            v-for="(app, index) in appList" 
            :key="app.app_id || app.id" 
            :app="app"
            :rank="(currentPage - 1) * pageSize + index + 1"
            @click="handleAppClick"
          />
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination-container" v-if="!loading && (appList.length > 0 || currentPage > 1)">
        <el-button 
          :disabled="currentPage === 1" 
          @click="changePage(-1)"
          circle
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-info">{{ currentPage }} / {{ Math.ceil(totalCount / pageSize) || 1 }}</span>
        <el-button 
          :disabled="!hasMore" 
          @click="changePage(1)"
          circle
        >
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'AppsView'
});

import { ref, watch, computed, onBeforeUnmount } from 'vue';
import { 
  Search, Menu, Cellphone, Monitor, Van, Platform, Reading, Connection,
  Tools, MapLocation, Coffee, School, House, Suitcase, Lollipop, Wallet,
  Document, Camera, UserFilled, Basketball, ShoppingCart, DataAnalysis,
  Location, ChatDotRound, FirstAidKit, Trophy, Ticket, Food, Timer,
  Headset, Brush, Picture, VideoCamera, MagicStick, VideoPlay, Service,
  CircleClose, ArrowLeft, ArrowRight
} from '@element-plus/icons-vue';
import { useRouter, useRoute } from 'vue-router';
import { getCategories, searchApps, getDevices, DEVICE_MAP, getAppsByCategory } from '../services/next-api';
import AppCard from '../components/AppCard.vue';

const router = useRouter();
const route = useRoute();
const searchQuery = ref('');
const activeDevice = ref('all');
const categories = ref<any[]>([]);
const appList = ref<any[]>([]);
const loading = ref(false);
const categoriesLoading = ref(false);
const deviceStatsLoading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const totalCount = ref(0);
const hasMore = ref(false);
let categoriesRequestId = 0;
const categoryPageVersion = ref(0);
const categorySnapshots = new Map<string, any[]>();
const skeletonProgress = ref(12);
let skeletonProgressTimer: number | null = null;
let prewarmStarted = false;

const viewMode = computed(() => {
  if (route.query.q) return 'search';
  if (route.query.category) return 'category';
  return 'home';
});

const pageTitle = computed(() => {
  if (viewMode.value === 'search') return `"${route.query.q}" 的搜索结果`;
  if (viewMode.value === 'category') return route.query.category as string;
  return '应用分类';
});

const showHomeSkeleton = computed(() => categoriesLoading.value && categories.value.length === 0);
const categoryPageKey = computed(() => `${activeDevice.value}-${categoryPageVersion.value}`);

const deviceStats = ref<Record<string, number | string>>({
  phone: '-',
  tv: '-',
  tablet: '-',
  car: '-',
  pc: '-'
});

const devices = [
  { key: 'all', label: '全部', icon: Menu },
  { key: 'phone', label: '手机', icon: Cellphone },
  { key: 'tv', label: '智慧屏', icon: Monitor },
  { key: 'tablet', label: '平板', icon: Reading },
  { key: 'car', label: '车机', icon: Van },
  { key: 'pc', label: 'PC', icon: Platform }
];

const DEVICE_KEYS = new Set(devices.map((device) => device.key));

// Colors for categories
const colors = [
  '#b91c1c', '#0d9488', '#0891b2', '#15803d', '#d97706', '#7f1d1d', 
  '#7e22ce', '#0284c7', '#22c55e', '#eab308', '#dc2626', '#059669', 
  '#9333ea', '#ea580c'
];

const CATEGORY_ICON_MAP: Record<string, any> = {
  '工具': Tools,
  '旅游': MapLocation,
  '休闲益智': Coffee,
  '教育': School,
  '生活服务': House,
  '商务': Suitcase,
  '儿童': Lollipop,
  '金融理财': Wallet,
  '新闻': Document,
  '拍摄美化': Camera,
  '角色扮演': UserFilled,
  '运动健康': Basketball,
  '动作射击': MagicStick,
  '购物': ShoppingCart,
  '经营策略': DataAnalysis,
  '出行导航': Location,
  '社交': ChatDotRound,
  '汽车': Van,
  '医疗': FirstAidKit,
  '体育竞速': Trophy,
  '棋牌桌游': Ticket,
  '资讯': Document,
  '美食': Food,
  '效率': Timer,
  '休闲娱乐': VideoPlay,
  '音乐': Headset,
  '艺术与设计': Brush,
  '主题': Picture,
  '阅读与工具书': Reading,
  '影视与直播': VideoCamera,
  '实用工具': Tools,
  '体育': Basketball,
  '房产与装修': House,
  '便捷生活': Service,
  '旅游住宿': MapLocation,
  '新闻阅读': Reading,
  '购物比价': ShoppingCart,
  '影音娛樂': VideoPlay,
  '社交通讯': ChatDotRound
};

const mapCategoryList = (list: any[]) => {
  return list.map((item: any, index: number) => ({
    ...item,
    color: colors[index % colors.length],
    count: item.count || item.app_count || 0,
    icon: CATEGORY_ICON_MAP[item.name] || item.icon || 'Connection'
  }));
};

const loadCategoriesForDevice = async (deviceKey: string) => {
  const deviceId = DEVICE_MAP[deviceKey];
  const res = await getCategories(deviceId);

  let list: any[] = [];
  if (Array.isArray(res)) {
    list = res;
  } else if (res.data && Array.isArray(res.data)) {
    list = res.data;
  } else if (res.items && Array.isArray(res.items)) {
    list = res.items;
  }

  return mapCategoryList(list);
};

const startSkeletonProgress = () => {
  if (skeletonProgressTimer) {
    clearInterval(skeletonProgressTimer);
  }

  skeletonProgress.value = 12;
  skeletonProgressTimer = window.setInterval(() => {
    if (skeletonProgress.value < 78) {
      skeletonProgress.value += 7;
    } else if (skeletonProgress.value < 92) {
      skeletonProgress.value += 1;
    }
  }, 180);
};

const stopSkeletonProgress = () => {
  if (skeletonProgressTimer) {
    clearInterval(skeletonProgressTimer);
    skeletonProgressTimer = null;
  }
  skeletonProgress.value = 100;
  window.setTimeout(() => {
    if (!showHomeSkeleton.value) {
      skeletonProgress.value = 12;
    }
  }, 180);
};

const prewarmCategorySnapshots = async () => {
  if (prewarmStarted) return;
  prewarmStarted = true;

  const queue = devices
    .map((device) => device.key)
    .filter((deviceKey) => !categorySnapshots.has(deviceKey));

  for (const deviceKey of queue) {
    try {
      const mappedCategories = await loadCategoriesForDevice(deviceKey);
      categorySnapshots.set(deviceKey, mappedCategories);
    } catch (error) {
      console.warn(`Failed to prewarm categories for ${deviceKey}`, error);
    }
  }
};

const fetchDeviceStats = async () => {
  deviceStatsLoading.value = true;
  try {
    const res = await getDevices();
    let list: any[] = [];
    if (Array.isArray(res)) list = res;
    else if (res.data && Array.isArray(res.data)) list = res.data;
    else if (res.items && Array.isArray(res.items)) list = res.items;

    // Map API response to our local stats
    // Assuming list items have { id, count } or similar
    // We reverse map ID to key
    const idToKey: Record<number, string> = {};
    Object.entries(DEVICE_MAP).forEach(([key, val]) => {
      if (val !== undefined) idToKey[val] = key;
    });

    list.forEach((item: any) => {
       const key = idToKey[item.id || item.device_id || item.code];
       if (key) {
         // Format count (e.g. 1200 -> 1.2k)
         let count = item.count || item.app_count || 0;
         if (count > 10000) count = (count / 10000).toFixed(1) + 'w';
         else if (count > 1000) count = (count / 1000).toFixed(1) + 'k';
         deviceStats.value[key] = count;
       }
     });
  } catch (e) {
    console.error('Failed to fetch device stats', e);
  } finally {
    deviceStatsLoading.value = false;
  }
};

const fetchCategories = async () => {
  const requestId = ++categoriesRequestId;
  const deviceKey = activeDevice.value;
  const cachedCategories = categorySnapshots.get(deviceKey);

  if (cachedCategories) {
    categories.value = cachedCategories;
  } else {
    categories.value = [];
  }

  categoriesLoading.value = true;
  try {
    const mappedCategories = await loadCategoriesForDevice(deviceKey);

    if (requestId === categoriesRequestId) {
      categorySnapshots.set(deviceKey, mappedCategories);
      categories.value = mappedCategories;
      categoryPageVersion.value += 1;
      void prewarmCategorySnapshots();
    }
  } catch (error) {
    console.error('Failed to fetch categories:', error);
  } finally {
    if (requestId === categoriesRequestId) {
      categoriesLoading.value = false;
    }
  }
};

const formatCategoryCount = (count: unknown) => {
  const n = typeof count === 'number' ? count : Number(count);
  if (!Number.isFinite(n)) return String(count ?? '-');
  try {
    return new Intl.NumberFormat('zh-CN').format(n);
  } catch {
    return String(n);
  }
};

const fetchApps = async () => {
  loading.value = true;
  // appList.value = []; // Don't clear immediately to avoid flash if possible, or clear if desired. 
  // Clearing gives better feedback that new data is loading.
  if (currentPage.value === 1) {
    appList.value = [];
    totalCount.value = 0;
  }
  
  try {
    let res: any;
    if (viewMode.value === 'search') {
      const q = route.query.q as string;
      if (q) {
        searchQuery.value = q; // Sync input
        res = await searchApps(q, currentPage.value, pageSize.value);
      }
    } else if (viewMode.value === 'category') {
      const cat = route.query.category as string;
      const deviceKey = route.query.device as string | undefined;
      const deviceId = deviceKey && DEVICE_KEYS.has(deviceKey) ? DEVICE_MAP[deviceKey] : undefined;
      if (cat) {
        res = await getAppsByCategory(cat, currentPage.value, pageSize.value, deviceId);
      }
    }

    if (res) {
      let list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (res.data && Array.isArray(res.data)) {
        list = res.data;
      }
      if (typeof res.total === 'number') {
        totalCount.value = res.total;
      }
      appList.value = list;
      
      if (totalCount.value > 0) {
        hasMore.value = currentPage.value * pageSize.value < totalCount.value;
      } else {
        // Fallback Heuristic
        hasMore.value = list.length >= pageSize.value;
      }
    } else {
      appList.value = [];
      hasMore.value = false;
    }
  } catch (error) {
    console.error('Failed to fetch apps:', error);
    appList.value = [];
    hasMore.value = false;
  } finally {
    loading.value = false;
  }
};

const changePage = (delta: number) => {
  const newPage = currentPage.value + delta;
  if (newPage < 1) return;
  currentPage.value = newPage;
  fetchApps();
  // Scroll to top of grid
  const grid = document.querySelector('.apps-grid');
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const handleSearch = () => {
  if (!searchQuery.value) return;
  router.push({ query: { ...route.query, q: searchQuery.value } });
};

const handleCategoryClick = (category: any) => {
  router.push({
    query: {
      category: category.name,
      ...(activeDevice.value !== 'all' ? { device: activeDevice.value } : {})
    }
  });
};

const handleBack = () => {
  searchQuery.value = '';
  router.push({ query: {} }); // Clear query to go back to home view
};

const handleAppClick = async (app: any) => {
  console.log('View app details:', app);
  const appId = app.app_id || app.id;
  if (!appId) return;

  router.push({ 
    name: 'next-app-detail', 
    params: { id: appId },
    query: { title: app.name }
  });
};

watch(
  () => route.query,
  () => {
    const routeDevice = route.query.device;
    if (typeof routeDevice === 'string' && DEVICE_KEYS.has(routeDevice)) {
      activeDevice.value = routeDevice;
    } else if (viewMode.value === 'home') {
      activeDevice.value = 'all';
    }

    if (viewMode.value === 'home') {
      fetchCategories();
      fetchDeviceStats();
    } else {
      currentPage.value = 1;
      fetchApps();
    }
  },
  { immediate: true }
);

watch(activeDevice, () => {
  if (viewMode.value === 'home') {
    fetchCategories();
  }
});

watch(showHomeSkeleton, (visible) => {
  if (visible) {
    startSkeletonProgress();
  } else {
    stopSkeletonProgress();
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (skeletonProgressTimer) {
    clearInterval(skeletonProgressTimer);
  }
});

</script>

<style scoped>
.apps-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.search-container {
  width: 100%;
  max-width: 800px;
  margin: 10px auto 30px;
}

.search-input {
  --el-input-border-color: transparent;
  --el-input-hover-border-color: transparent;
  --el-input-focus-border-color: transparent;
}

.search-input :deep(.el-input__wrapper) {
  border-radius: 50px;
  background-color: var(--el-bg-color);
  box-shadow: none; /* Removed shadow */
  border: 1px solid var(--el-border-color); /* Added border instead */
  padding-left: 20px;
  padding-right: 10px; /* Adjust for suffix */
  transition: all 0.3s ease;
  z-index: 1;
}

.search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: none; /* Removed glow */
  border-color: var(--el-color-primary);
  z-index: 2;
}

/* Removed append slot styles */

.search-btn {
  background-color: transparent;
  border-radius: 50px;
  height: 32px; /* Fit inside input */
  padding: 0 16px;
  color: var(--el-text-color-primary); 
  font-weight: 600;
  font-size: 14px;
  border: none;
  box-shadow: none;
  transition: all 0.3s;
  margin-left: 5px; 
}

.search-btn:hover {
  background-color: var(--el-fill-color);
  color: var(--el-color-primary);
}

.search-btn:active {
  background-color: var(--el-fill-color-darker);
  transform: translateY(0);
}

.device-tabs-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 30px;
}

.device-tabs {
  display: flex;
  position: relative;
  background-color: var(--el-fill-color);
  border-radius: 50px;
  border: 4px solid var(--el-fill-color);
  padding: 0;
  width: 100%;
  max-width: 800px;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.06);
  box-sizing: border-box;
}

.home-content {
  position: relative;
}

.categories-grid-wrapper {
  position: relative;
}

.categories-page-shell {
  width: 100%;
}

.categories-grid-skeleton {
  pointer-events: none;
}

.categories-grid-skeleton .category-card {
  min-height: 100px;
}

.skeleton-category-card {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  cursor: default;
  background: var(--el-bg-color);
}

.device-tabs-progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 0;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgba(64, 158, 255, 0.1) 0%, rgba(64, 158, 255, 0.2) 100%);
  transition: width 0.2s linear;
  pointer-events: none;
}

.category-skeleton-content {
  display: flex;
  flex-direction: column;
  min-height: 100px;
}

.category-skeleton-title {
  width: 44%;
  height: 22px;
  margin-bottom: 14px;
}

.category-skeleton-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: auto;
}

.category-skeleton-number {
  width: 68px;
  height: 24px;
}

.category-skeleton-unit {
  width: 32px;
  height: 16px;
}

.category-skeleton-icon {
  width: 42px;
  height: 42px;
  margin-top: 18px;
  align-self: flex-end;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.categories-page-enter-active,
.categories-page-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease, filter 0.28s ease;
}

.categories-page-enter-from {
  opacity: 0;
  transform: translateX(28px) rotateY(-10deg);
  filter: blur(2px);
}

.categories-page-leave-to {
  opacity: 0;
  transform: translateX(-28px) rotateY(10deg);
  filter: blur(2px);
}

.tab-glider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background-color: var(--el-bg-color);
  border-radius: 50px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  z-index: 1;
}

.device-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 4px;
  border-radius: 50px;
  cursor: pointer;
  transition: color 0.3s;
  color: var(--el-text-color-regular);
  font-size: 14px;
  position: relative;
  z-index: 2;
  white-space: nowrap;
}

.device-tab:hover {
  color: var(--el-text-color-primary);
}

.device-tab.active {
  color: var(--el-color-primary);
  font-weight: 600;
}

.tab-label {
  display: inline-block;
}

.count-badge {
  font-size: 10px;
  background-color: var(--el-fill-color-darker);
  color: var(--el-text-color-secondary);
  padding: 0 4px;
  border-radius: 10px;
  line-height: 14px;
  height: 14px;
  min-width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
  transition: all 0.3s;
}

.device-tab.active .count-badge {
  background-color: var(--el-color-primary);
  color: white;
}

.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.category-card {
  height: 100px;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.view-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  position: relative;
  min-height: 32px;
}

.view-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  height: 32px; /* Explicit height to match button */
  line-height: 32px;
  text-align: center;
  white-space: nowrap;
  max-width: calc(100% - 180px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-total-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--el-bg-color) 0%, var(--el-fill-color-light) 100%);
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-align: center;
  line-height: 32px;
  border: 1px solid var(--el-border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.back-btn {
  font-size: 18px;
  padding: 0;
  width: 32px;
  height: 32px;
  line-height: 32px;
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-color-primary-light-7);
  background-color: var(--el-color-primary-light-9);
  box-shadow: 0 4px 10px rgba(64, 158, 255, 0.12);
  transition: all 0.2s ease;
}

.back-btn:hover {
  background-color: var(--el-color-primary-light-8);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
  box-shadow: 0 6px 14px rgba(64, 158, 255, 0.18);
  transform: translateX(-1px);
}

.back-btn:active {
  transform: translateX(0);
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.14);
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  column-gap: 24px;
  row-gap: 36px;
  padding-bottom: 24px;
}

.apps-grid-container {
  min-height: 810px;
}

.category-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 12px rgba(0,0,0,0.15);
}

.category-name {
  font-size: 16px;
  font-weight: bold;
  z-index: 1;
  text-align: center;
}

.category-count-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background-color: rgba(255,255,255,0.22);
  border: 1px solid rgba(255,255,255,0.28);
  color: rgba(255,255,255,0.95);
  line-height: 1;
  white-space: nowrap;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.category-count-badge-number {
  font-size: 13px;
  font-weight: 700;
}

.category-count-badge-unit {
  font-size: 11px;
  opacity: 0.9;
}

.category-icon-bg {
  position: absolute;
  right: -10px;
  bottom: -10px;
  font-size: 80px;
  opacity: 0.2;
  transform: rotate(-15deg);
}

/* Dark mode adjustments */
.dark .search-input :deep(.el-input__wrapper) {
  background-color: var(--el-bg-color-overlay);
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .device-tab .el-icon,
  .device-tab .count-badge {
    display: none;
  }
  
  .device-tab {
    padding: 8px 2px;
    font-size: 13px;
  }

  .categories-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .category-card {
    padding: 10px;
    height: 90px;
  }

  .category-name {
    font-size: 14px;
  }

  .category-count-badge {
    top: 8px;
    right: 8px;
    padding: 2px 8px;
    gap: 3px;
  }

  .category-count-badge-number {
    font-size: 12px;
  }

  .category-count-badge-unit {
    font-size: 10px;
  }

  .view-header {
    gap: 6px;
  }

  .view-title {
    font-size: 18px;
    max-width: calc(100% - 150px);
  }

  .view-total-badge {
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
    line-height: 30px;
  }
}

.pagination-container {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding-bottom: 40px;
}

.page-info {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

/* Skeleton Loader */
.skeleton-card {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  height: 100%;
  box-sizing: border-box;
}

.skeleton-content {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 84px;
}

.skeleton-icon {
  width: 56px !important;
  height: 56px !important;
  border-radius: 12px;
  margin-right: 12px;
  flex-shrink: 0;
}

.skeleton-info {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
}

.skeleton-meta {
  display: flex;
}

@media (min-width: 1280px) {
  .categories-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }

  .category-card,
  .categories-grid-skeleton .category-card {
    min-height: 112px;
  }

  .category-skeleton-content {
    min-height: 112px;
  }

  .apps-grid {
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    column-gap: 28px;
    row-gap: 40px;
  }

  .skeleton-card {
    padding: 14px;
  }

  .skeleton-icon {
    width: 60px !important;
    height: 60px !important;
  }
}

@media (max-width: 1024px) {
  .apps-grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    column-gap: 20px;
    row-gap: 28px;
  }

  .apps-grid-container {
    min-height: 680px;
  }
}

@media (max-width: 768px) {
  .categories-grid-skeleton .category-card {
    min-height: 90px;
  }

  .category-skeleton-content {
    min-height: 90px;
  }

  .category-skeleton-title {
    width: 54%;
    height: 18px;
    margin-bottom: 10px;
  }

  .category-skeleton-number {
    width: 54px;
    height: 18px;
  }

  .category-skeleton-unit {
    width: 24px;
    height: 14px;
  }

  .category-skeleton-icon {
    width: 34px;
    height: 34px;
    margin-top: 12px;
  }

  .apps-grid {
    grid-template-columns: 1fr;
    row-gap: 32px;
  }

  .apps-grid-container {
    min-height: 520px;
  }

  .skeleton-card {
    padding: 10px;
    border-radius: 10px;
  }

  .skeleton-content {
    min-height: 72px;
  }

  .skeleton-icon {
    width: 48px !important;
    height: 48px !important;
    border-radius: 10px;
    margin-right: 10px;
  }

  .skeleton-info {
    margin-right: 6px;
  }
}

@media (max-width: 480px) {
  .view-header {
    min-height: 30px;
  }

  .view-title {
    max-width: calc(100% - 124px);
  }

  .view-total-badge {
    height: 28px;
    padding: 0 10px;
    font-size: 11px;
    line-height: 28px;
  }

  .categories-grid-skeleton .category-card {
    min-height: 82px;
  }

  .category-skeleton-content {
    min-height: 82px;
  }

  .category-skeleton-title {
    width: 58%;
    height: 16px;
    margin-bottom: 8px;
  }

  .category-skeleton-number {
    width: 46px;
    height: 16px;
  }

  .category-skeleton-unit {
    width: 20px;
    height: 12px;
  }

  .category-skeleton-icon {
    width: 28px;
    height: 28px;
    margin-top: 10px;
  }

  .apps-grid {
    row-gap: 26px;
  }

  .skeleton-card {
    padding: 8px;
  }

  .skeleton-content {
    min-height: 64px;
  }

  .skeleton-icon {
    width: 42px !important;
    height: 42px !important;
    margin-right: 8px;
  }

  .skeleton-meta {
    gap: 6px;
  }
}
</style>
