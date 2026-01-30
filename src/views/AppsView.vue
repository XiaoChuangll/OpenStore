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

    <!-- Device Tabs (Segmented Control) -->
    <div v-if="viewMode === 'home'" class="device-tabs-wrapper">
      <div class="device-tabs">
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
    <div v-if="viewMode === 'home'" class="categories-grid">
      <div 
        v-for="(category, index) in categories" 
        :key="index"
        class="category-card"
        :style="{ backgroundColor: category.color }"
        @click="handleCategoryClick(category)"
      >
        <div class="category-name">{{ category.name }}</div>
        <div class="category-count">{{ category.count }}个应用</div>
        <div class="category-icon-bg">
          <el-icon><component :is="category.icon || Connection" /></el-icon>
        </div>
      </div>
    </div>

    <!-- Apps Grid (Search/Category) -->
    <div v-else class="apps-container">
      <div class="view-header">
        <el-button circle @click="handleBack" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <h2 class="view-title">{{ pageTitle }}</h2>
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
            v-for="app in appList" 
            :key="app.app_id || app.id" 
            :app="app"
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

import { ref, watch, computed } from 'vue';
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
const currentPage = ref(1);
const pageSize = ref(20);
const totalCount = ref(0);
const hasMore = ref(false);

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

const fetchDeviceStats = async () => {
  try {
    const res = await getDevices();
    let list = [];
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
  }
};

const fetchCategories = async () => {
  loading.value = true;
  try {
    const deviceId = DEVICE_MAP[activeDevice.value];
    const res = await getCategories(deviceId);
    
    // Check response structure
    let list = [];
    if (Array.isArray(res)) {
      list = res;
    } else if (res.data && Array.isArray(res.data)) {
      list = res.data;
    } else if (res.items && Array.isArray(res.items)) {
        list = res.items;
    }

    // Map to view model
    categories.value = list.map((item: any, index: number) => ({
      ...item,
      color: colors[index % colors.length],
      count: item.count || item.app_count || 0, // Handle different count field names
      icon: CATEGORY_ICON_MAP[item.name] || item.icon || 'Connection'
    }));
  } catch (error) {
    console.error('Failed to fetch categories:', error);
  } finally {
    loading.value = false;
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
      if (cat) {
        res = await getAppsByCategory(cat, currentPage.value, pageSize.value);
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
  router.push({ query: { category: category.name } });
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

</script>

<style scoped>
.apps-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.search-container {
  max-width: 700px;
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
}

.view-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  height: 32px; /* Explicit height to match button */
  line-height: 32px;
}

.back-btn {
  font-size: 18px;
  padding: 0;
  width: 32px;
  height: 32px;
  line-height: 32px;
  color: var(--el-text-color-regular);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background-color: transparent;
}

.back-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.back-btn:hover {
  color: var(--el-color-primary);
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

.category-count {
  font-size: 12px;
  opacity: 0.9;
  margin-top: 4px;
  z-index: 1;
  background-color: rgba(0,0,0,0.2);
  padding: 2px 8px;
  border-radius: 10px;
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
</style>
