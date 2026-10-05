<template>
  <el-card class="app-list-card" shadow="hover">
    <template #header>
      <!-- 头部整块可点：右侧箭头会转，内容是平滑收起而不是直接消失（和 SDK 分布卡片一致） -->
      <header class="card-header" @click="toggleExpanded">
        <div class="header-left">
          <span class="card-title">应用搜索</span>
          <span class="chip result-count">共 {{ total }} 个应用</span>
        </div>
        <el-icon class="collapse-icon" :class="{ 'is-collapsed': !expanded }">
          <ArrowDown />
        </el-icon>
      </header>
    </template>

    <!-- 搜索条件：折叠状态也一直显示，这就是这张卡片的主体 -->
    <section class="search-panel">
      <!--
        主搜索：一整条胶囊 —— 类型下拉 + 分隔线 + 关键词输入（内嵌"搜索"按钮）。
        和维护方式一致：整条一起获得焦点高亮，窄屏也不会被拆成两段。
      -->
      <div class="search-bar">
        <el-select
          v-model="searchKey"
          placeholder="类型"
          class="search-scope"
          size="large"
        >
          <el-option
            v-for="item in searchOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <span class="search-divider" aria-hidden="true"></span>
        <el-input
          v-model="searchQuery"
          :placeholder="searchPlaceholder"
          class="search-input"
          size="large"
          @keyup.enter="handleSearch"
        >
          <template #suffix>
            <el-icon v-if="searchQuery" class="search-clear" @click="clearSearch">
              <CircleClose />
            </el-icon>
            <el-button class="search-btn" circle text aria-label="搜索" @click="handleSearch">
              <el-icon :size="18"><Search /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <!-- 次级筛选：开关 + 排序 -->
      <div class="search-filters">
        <button
          type="button"
          class="chip is-button filter-chip"
          :class="{ 'is-on': showOfficial }"
          :aria-pressed="showOfficial"
          @click="showOfficial = !showOfficial"
        >
          <span>官方</span>
        </button>
        <button
          type="button"
          class="chip is-button filter-chip"
          :class="{ 'is-on': isExactSearch }"
          :aria-pressed="isExactSearch"
          @click="isExactSearch = !isExactSearch"
        >
          <span>精确</span>
        </button>
        <div class="sort-group">
          <el-select v-model="sortKey" class="sort-select">
            <el-option v-for="item in sortOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="sortOrder" class="sort-order">
            <el-option label="从高到低" value="desc" />
            <el-option label="从低到高" value="asc" />
          </el-select>
        </div>
      </div>
    </section>

    <div class="collapsible-wrapper" :class="{ 'is-collapsed': !expanded }">
      <div class="list-body">
      <!-- 列表统一用卡片式（原来移动端那套）：窄屏单列，宽屏两列 -->
      <div :class="['mobile-apps-grid', { 'desktop-grid': !isMobile }]" v-loading="loading">
      <div 
        v-for="(app, index) in apps" 
        :key="app.id || index" 
        class="mobile-app-card"
        @click="handleRowClick(app)"
      >
        <div class="mobile-bg-index">{{ (currentPage - 1) * pageSize + index + 1 }}</div>
        
        <div class="mobile-card-top">
          <img 
            :src="(app.icon_url && !failedIcons.has(app.id)) ? app.icon_url : '/placeholder.png'" 
            :alt="`${app.name} 应用图标`" 
            class="mobile-app-icon" 
            loading="lazy" 
            @error="onIconError(app.id)"
          />
          
          <div class="mobile-card-content">
            <div class="mobile-card-header-row">
              <span class="mobile-app-name">{{ app.name }}</span>
            </div>
            
            <div class="mobile-tags-row">
              <div class="developer-tag-wrapper">
                <el-tag 
                  effect="plain" 
                  type="info" 
                  size="small" 
                  class="clickable-tag developer-tag"
                  @click.stop="handleSearchByDeveloper(app.developer_name)"
                >
                  {{ app.developer_name }}
                </el-tag>
              </div>
              <el-tag 
                effect="plain" 
                size="small" 
                class="clickable-tag category-tag"
                @click.stop="handleSearchByKind(app.kind_name)"
              >
                {{ app.kind_name }}
              </el-tag>
            </div>
          </div>
        </div>

        <div class="mobile-meta-row">
          <div class="meta-left">
            <span v-if="!app.average_rating || Number(app.average_rating) === 0" class="no-rating">暂无评分</span>
            <el-rate
              v-else
              :model-value="Number(app.average_rating)"
              disabled
              text-color="#ff9900"
              size="small"
            />
          </div>
          <div class="meta-right">
            <div class="stat-item">
              <el-icon><Download /></el-icon>
              <span>{{ formatCount(app.download_count) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
      <nav class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :pager-count="pagerCount"
          layout="prev, pager, next"
          @current-change="fetchApps"
          :small="isMobile"
        />
      </nav>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Download, ArrowDown, CircleClose } from '@element-plus/icons-vue';
import { hmApi } from '../services/hm-api';

const router = useRouter();

const failedIcons = ref(new Set<string>());

const onIconError = (id: string) => {
  failedIcons.value.add(id);
};

interface App {
  id: string;
  app_id?: string;
  name: string;
  pkg_name: string;
  icon_url: string;
  download_count: number;
  average_rating: string;
  updated_at: string | number;
  listed_at: string | number;
  developer_name: string;
  kind_name: string;
}

const apps = ref<App[]>([]);
const total = ref(0);
const currentPage = ref(1);
const pageSize = ref(10);
const searchQuery = ref('');
const searchKey = ref('name');
const isExactSearch = ref(false);
/**
 * 是否展示华为官方应用（默认开）。
 * 关闭 = 排除官方应用，后端会把它翻译成等价条件（exclude_huawei）。
 */
const showOfficial = ref(true);
const loading = ref(false);
/** 默认展开，直接展示列表；不想看可以点右上角收起来 */
const expanded = ref(true);
/** 是否已经请求过一次：展开时第一次才发请求，避免折叠状态下白白打上游 */
const hasLoadedOnce = ref(false);

const windowWidth = ref(window.innerWidth);
const updateWidth = () => {
  windowWidth.value = window.innerWidth;
};

const isMobile = computed(() => windowWidth.value <= 768);
const pagerCount = computed(() => (isMobile.value ? 5 : 7));

const searchOptions = [
  { label: '应用名', value: 'name' },
  { label: '开发者', value: 'developer_name' },
  { label: '分类', value: 'kind_name' },
  { label: '包名', value: 'pkg_name' }
];

const sortOptions = [
  { label: '下载量', value: 'download_count' },
  { label: '评分', value: 'average_rating' },
  { label: '上架时间', value: 'listed_at' },
  { label: '更新时间', value: 'updated_at' }
];

/** 搜索框提示语跟着搜索字段走，省得用户猜这里该填什么 */
const searchPlaceholder = computed(() => {
  const found = searchOptions.find((item) => item.value === searchKey.value);
  return `搜索${found?.label || '应用'}…`;
});

const formatCount = (count: number) => {
  if (!count) return '0';
  if (count > 100000000) return (count / 100000000).toFixed(1) + '亿';
  if (count > 10000) return (count / 10000).toFixed(1) + '万';
  return count.toString();
};

const fetchApps = async () => {
  loading.value = true;
  try {
    const params: any = {
      page_size: pageSize.value,
      // 排序交给上游做（只排当前页是错的），这三个字段上游都支持
      sort: sortKey.value,
      desc: sortOrder.value === 'desc',
      // 列表要展示开发者/分类/下载量/评分/上架时间，必须完整信息
      detail: true
    };

    const keyword = searchQuery.value.trim();
    if (keyword) {
      params.search_key = searchKey.value;
      params.search_value = keyword;
      params.search_exact = isExactSearch.value;
    }
    if (!showOfficial.value) params.exclude_huawei = true;

    const response = await hmApi.get<any>(`/apps/list/${currentPage.value}`, params);
    const data = response.data || {};
    apps.value = data.data || [];
    total.value = data.total_count || 0;
    hasLoadedOnce.value = true;
  } catch (error) {
    console.error('Failed to fetch apps:', error);
  } finally {
    loading.value = false;
  }
};

/* 排序：字段 + 方向，由上面两个下拉控制（排序交给上游做） */
const sortKey = ref<'download_count' | 'average_rating' | 'listed_at' | 'updated_at'>('download_count');
const sortOrder = ref<'desc' | 'asc'>('desc');

const handleSearch = () => {
  // 直接触发时取消待执行的防抖，避免重复请求
  if (searchTimer) {
    window.clearTimeout(searchTimer);
    searchTimer = null;
  }
  currentPage.value = 1;
  // 搜索一定是有结果要看的，顺手把列表展开
  expanded.value = true;
  fetchApps();
};

/** 清空关键词：清掉之后立刻按当前条件重新搜（回到默认列表） */
const clearSearch = () => {
  searchQuery.value = '';
  handleSearch();
};

/** 右上角展开 / 收起；第一次展开才去拉列表 */
const toggleExpanded = () => {
  expanded.value = !expanded.value;
  if (expanded.value && !hasLoadedOnce.value) fetchApps();
};

// 输入即搜：关键词 / 搜索字段 / 精确搜索 / 筛选项任一变化都防抖后自动搜索
const SEARCH_DEBOUNCE_MS = 400;
let searchTimer: number | null = null;

watch([searchQuery, searchKey, isExactSearch, showOfficial, sortKey, sortOrder], () => {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    handleSearch();
  }, SEARCH_DEBOUNCE_MS);
});

const handleSearchByDeveloper = (developerName: string) => {
  searchKey.value = 'developer_name';
  searchQuery.value = developerName;
};

const handleSearchByKind = (kindName: string) => {
  searchKey.value = 'kind_name';
  searchQuery.value = kindName;
};

const handleRowClick = (row: App) => {
  const appId = row.app_id || row.id;
  if (appId) {
    router.push({ 
      name: 'app-dashboard', 
      query: { 
        app_id: appId,
        title: row.name
      } 
    });
  }
};

onMounted(() => {
  window.addEventListener('resize', updateWidth);
  // 默认就是展开状态，进页面直接拉列表
  fetchApps();
});

onUnmounted(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
  window.removeEventListener('resize', updateWidth);
});
</script>

<style scoped>
.app-list-card {
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 放不下时整块换行（搜索栏自己有 100% 规则），别把左边的标题挤变形 */
  flex-wrap: wrap;
  gap: 10px 12px;
  /* 整块可点：和 SDK 分布卡片一样，点标题栏展开 / 收起 */
  cursor: pointer;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.result-count {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
}
.collapse-icon {
  color: var(--el-text-color-secondary);
  transition: transform 0.3s;
}
.collapse-icon.is-collapsed {
  transform: rotate(-90deg);
}

/*
 * 展开 / 收起：内容和 SDK 分布卡片一样平滑收起。
 * 行高动画用 grid-template-rows 0fr/1fr —— max-height 那种写法要猜一个大值，
 * 内容短的时候会先「卡住」再收，很难看。
 */
.collapsible-wrapper {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition: grid-template-rows 0.3s ease-in-out, opacity 0.3s ease-in-out;
}

.collapsible-wrapper.is-collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}

.list-body {
  min-height: 0;
  overflow: hidden;
}
/* ===== 搜索区：折叠时露出的就是这一块 ===== */
.search-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/*
 * 主搜索是一整条胶囊：类型下拉 + 分隔线 + 关键词输入（右侧内嵌放大镜按钮）。
 * 下拉和输入自己都不画边框/高亮，全交给外层这一条 —— 所以它们看起来是一体的。
 */
.search-bar {
  display: flex;
  align-items: center;
  padding: 2px 6px 2px 4px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background-color: var(--el-bg-color);
  transition: border-color 0.3s ease;
}

.search-bar:focus-within {
  border-color: var(--el-color-primary);
}

.search-scope {
  width: 124px;
  flex: 0 0 auto;
}

.search-scope :deep(.el-select__wrapper) {
  min-height: 34px;
  border-radius: 999px;
  background: transparent;
  border: none;
  box-shadow: none !important;
  outline: none;
  padding-left: 14px;
}

/*
 * 胶囊里的下拉 / 输入都不要自己再画 focus 圈（包括键盘 focus-visible 的 outline）：
 * 整条的高亮统一交给 .search-bar:focus-within 那一圈边框。
 */
.search-bar :deep(.el-select__wrapper:focus-visible),
.search-bar :deep(.el-input__wrapper:focus-visible),
.search-bar :deep(.el-input__inner:focus-visible),
.search-bar :deep(.el-select__wrapper.is-focused),
.search-bar :deep(.el-input__wrapper.is-focus) {
  outline: none;
  box-shadow: none;
}

/* 类型 / 关键词 之间的竖线 */
.search-divider {
  width: 1px;
  height: 18px;
  flex: 0 0 auto;
  margin: 0 4px;
  background-color: var(--el-border-color);
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}

.search-input :deep(.el-input__wrapper) {
  background: transparent;
  /* !important：Element Plus 的 .el-input__wrapper.is-focus 权重更高，不加压不住那圈蓝色光圈 */
  box-shadow: none !important;
  border: none;
  border-radius: 999px;
  padding-left: 4px;
  padding-right: 2px;
}

.search-clear {
  margin-right: 4px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}

/* 搜索是图标按钮：胶囊右端一个放大镜 */
.search-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--el-text-color-primary);
}

.search-btn:hover {
  background-color: var(--el-fill-color);
  color: var(--el-color-primary);
}

/* 次级筛选换成可点选的胶囊：未选中只是描边，选中后主题色底 + 对勾 */
.filter-chip {
  /* 自适应铺满：两个胶囊平分剩余空间（超宽时封顶，免得拉成一条长条） */
  flex: 1 1 auto;
  justify-content: center;
  max-width: 220px;
  height: 28px;
  padding: 0 12px;
  font-size: 12.5px;
}

.filter-chip.is-on {
  border-color: var(--el-color-primary);
  background-color: color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  color: var(--el-color-primary);
  font-weight: 600;
}

/* 次级筛选：左边两个开关，右边排序；和主搜索之间用一条细线分开 */
.search-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.sort-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.sort-select,
.sort-order {
  width: 120px;
}

.clickable-tag {
  cursor: pointer;
  transition: opacity 0.2s;
}
.clickable-tag:hover {
  opacity: 0.8;
}
.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
  overflow-x: auto;
  padding: 10px 0;
  -webkit-overflow-scrolling: touch;
}

:deep(.el-pagination) {
  /* 必须是 nowrap：Element Plus 默认不换行，之前写成 wrap，
     窄屏（约 320~380px）时「上一页 / 下一页」会被挤到独立的第二行。
     真的放不下时由 .pagination-container 的横向滚动兜底。 */
  flex-wrap: nowrap;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  :deep(.el-pagination) {
    gap: 4px;
  }

  :deep(.el-pagination .el-pager) {
    margin: 0 2px;
  }
}
.app-name {
  font-weight: 500;
}

@media (max-width: 768px) {
  .card-header {
    flex-wrap: wrap;
    align-items: center;
  }
}

/*
 * 手机（真·窄屏）才改成两行：
 *   类型 | 搜索框
 *   开关组（官方 · 精确） | 搜索按钮
 * 再下面是排序。
 * 平板宽度（600~768）继续用宽屏那套：类型 + 搜索框 + 搜索按钮 一行，
 * 否则五个控件会挤在同一行里。
 */
@media (max-width: 600px) {
  /*
   * 窄屏两行：
   *   类型 | 关键词（一整条胶囊，独占一行）
   *   官方 · 精确  →  排序
   */
  .search-panel {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 10px;
  }
  /* 胶囊独占一行 */
  .search-bar {
    flex: 1 1 100%;
  }
  .search-scope {
    /* 给关键词留出空间 */
    width: 104px;
    flex: 0 0 104px;
  }
  .search-filters {
    flex: 1 1 100%;
    /* 窄屏不用那条分隔线，靠行间距区分 */
    padding-top: 0;
    border-top: none;
  }
  .sort-group {
    width: 100%;
    margin-left: 0;
  }
  .sort-select,
  .sort-order {
    flex: 1 1 120px;
    width: auto;
  }
}

.mobile-apps-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}

.desktop-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 16px 0;
}

.mobile-app-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.mobile-card-top {
  display: flex;
  align-items: flex-start;
  width: 100%;
  position: relative;
  z-index: 1;
}

.mobile-app-card:active {
  background: var(--el-fill-color-light);
}

.mobile-bg-index {
  position: absolute;
  right: -5px;
  bottom: -15px;
  font-size: 80px;
  font-weight: 800;
  color: var(--el-text-color-placeholder);
  opacity: 0.15;
  pointer-events: none;
  z-index: 0;
  line-height: 1;
  font-family: Arial, sans-serif;
}

.mobile-app-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  margin-right: 12px;
  object-fit: cover;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.mobile-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.mobile-card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mobile-app-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.mobile-tags-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.developer-tag-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-start;
}

.developer-tag {
  max-width: 100%;
}

:deep(.developer-tag .el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: bottom;
}

.category-tag {
  flex-shrink: 0;
}

.mobile-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  width: 100%;
  position: relative;
  z-index: 1;
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-wrap: nowrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.meta-right {
  flex-shrink: 0;
  margin-left: 4px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.no-rating {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

:deep(.el-rate) {
  height: auto;
  --el-rate-icon-size: 14px;
  --el-rate-font-size: 12px;
}
</style>
