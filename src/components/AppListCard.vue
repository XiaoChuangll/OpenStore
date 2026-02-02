<template>
  <el-card class="app-list-card" shadow="hover">
    <template #header>
      <header class="card-header">
        <div class="header-left">
          <span class="card-title">应用列表</span>
          <el-button 
            v-if="!isMobile"
            :icon="Switch"
            circle
            size="small"
            class="view-toggle-btn"
            @click="toggleViewMode"
            title="切换视图"
          />
        </div>
        <el-switch 
          v-model="isExactSearch" 
          active-text="精确搜索" 
          @change="handleSearch" 
          class="exact-switch"
        />
        <div class="search-bar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索应用..."
            class="search-input"
            @keyup.enter="handleSearch"
            clearable
            @clear="handleSearch"
          >
            <template #prepend>
              <el-select v-model="searchKey" placeholder="搜索类型" style="width: 110px">
                <el-option
                  v-for="item in searchOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </template>
            <template #append>
              <el-button :icon="Search" @click="handleSearch" />
            </template>
          </el-input>
        </div>
      </header>
    </template>
    
    <el-table
      v-if="!isMobile && viewMode === 'table'"
      :data="apps"
      style="width: 100%"
      v-loading="loading"
      @row-click="handleRowClick"
      :default-sort="{ prop: sortKey, order: sortDesc ? 'descending' : 'ascending' }"
      @sort-change="onSortChange"
    >
      <el-table-column label="序号" width="80" align="center">
        <template #default="scope">
          <span style="font-weight: bold; color: #909399;">
            {{ (currentPage - 1) * pageSize + scope.$index + 1 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="应用名称" width="220">
        <template #default="scope">
          <div class="app-info">
            <img 
              :src="(scope.row.icon_url && !failedIcons.has(scope.row.id)) ? scope.row.icon_url : '/placeholder.png'" 
              :alt="`${scope.row.name} 应用图标`" 
              class="app-icon" 
              loading="lazy" 
              @error="onIconError(scope.row.id)"
            />
            <span class="app-name">{{ scope.row.name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="developer_name" label="开发者" width="220" show-overflow-tooltip>
        <template #default="scope">
          <el-tag 
            effect="plain" 
            type="info" 
            class="clickable-tag"
            @click.stop="handleSearchByDeveloper(scope.row.developer_name)"
          >
            {{ scope.row.developer_name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="kind_name" label="分类" width="140" show-overflow-tooltip>
        <template #default="scope">
          <el-tag 
            effect="plain" 
            class="clickable-tag"
            @click.stop="handleSearchByKind(scope.row.kind_name)"
          >
            {{ scope.row.kind_name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column min-width="1" />
      <el-table-column prop="download_count" label="下载量" width="90" sortable="custom" align="right" />
      <el-table-column prop="average_rating" label="评分" width="80" sortable="custom" align="right" label-class-name="no-wrap">
        <template #default="scope">
          <span>{{ scope.row.average_rating || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="listed_at" label="上架时间" width="170" sortable="custom" align="right">
        <template #default="scope">
          <span>{{ formatDate(scope.row.listed_at) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div v-else-if="isMobile || viewMode === 'grid'" :class="['mobile-apps-grid', {'desktop-grid': !isMobile && viewMode === 'grid'}]" v-loading="loading">
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
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Download, Switch } from '@element-plus/icons-vue';
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
const loading = ref(false);
const viewMode = ref<'table' | 'grid'>('table');

const windowWidth = ref(window.innerWidth);
const updateWidth = () => {
  windowWidth.value = window.innerWidth;
};

const isMobile = computed(() => windowWidth.value <= 768);
const pagerCount = computed(() => (isMobile.value ? 5 : 7));

const toggleViewMode = () => {
  viewMode.value = viewMode.value === 'table' ? 'grid' : 'table';
};

const searchOptions = [
  { label: '应用名称', value: 'name' },
  { label: '开发者', value: 'developer_name' },
  { label: '分类', value: 'kind_name' }
];

const formatDate = (date: string | number) => {
  if (!date) return '-';
  return new Date(date).toLocaleString();
};

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
      sort: 'download_count',
      desc: true
    };

    if (searchQuery.value) {
      params.search_key = searchKey.value;
      params.search_value = searchQuery.value;
      params.search_exact = isExactSearch.value;
    }

    const response = await hmApi.get<any>(`/apps/list/${currentPage.value}`, params);
    const data = response.data || {};
    apps.value = data.data || [];
    total.value = data.total_count || 0;
    applyLocalSort();
  } catch (error) {
    console.error('Failed to fetch apps:', error);
  } finally {
    loading.value = false;
  }
};

const sortKey = ref<'download_count' | 'average_rating' | 'listed_at'>('download_count');
const sortDesc = ref(true);
const onSortChange = (opt: any) => {
  const prop = String(opt?.prop || '').trim();
  const order = String(opt?.order || '');
  if (!prop || !['download_count', 'average_rating', 'listed_at'].includes(prop)) return;
  sortKey.value = prop as any;
  sortDesc.value = order === 'descending' || order === '' || order === undefined;
  applyLocalSort();
};

const applyLocalSort = () => {
  const key = sortKey.value;
  const desc = sortDesc.value;
  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const toTime = (v: any) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const getVal = (item: any) => {
    if (key === 'listed_at') return toTime(item?.listed_at);
    if (key === 'average_rating') return toNum(item?.average_rating);
    return toNum(item?.download_count);
  };
  apps.value = [...apps.value].sort((a, b) => {
    const va = getVal(a);
    const vb = getVal(b);
    return desc ? vb - va : va - vb;
  });
};

const handleSearch = () => {
  currentPage.value = 1;
  fetchApps();
};

const handleSearchByDeveloper = (developerName: string) => {
  searchKey.value = 'developer_name';
  searchQuery.value = developerName;
  handleSearch();
};

const handleSearchByKind = (kindName: string) => {
  searchKey.value = 'kind_name';
  searchQuery.value = kindName;
  handleSearch();
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
  fetchApps();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth);
});
</script>

<style scoped>
.app-list-card {
  margin-bottom: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left {
  display: flex;
  align-items: center;
  margin-right: auto;
  gap: 12px;
}
.card-title {
  margin-right: 0;
}
.view-toggle-btn {
  font-size: 14px;
}
.exact-switch {
  margin-right: 12px;
}
.search-bar {
  width: 400px;
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
}

:deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 768px) {
  :deep(.el-pagination .el-pager) {
    margin: 0 4px;
  }
}
.app-info {
  display: flex;
  align-items: center;
}
.app-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  margin-right: 10px;
}
.app-name {
  font-weight: 500;
}

:deep(th.no-wrap .cell) {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .card-header {
    flex-wrap: wrap;
    align-items: center;
  }
  .search-bar {
    width: 100%;
    margin-top: 10px;
    order: 3;
  }
}

:deep(.el-table__row) {
  cursor: pointer;
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

.mobile-app-kind {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
  cursor: pointer;
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
