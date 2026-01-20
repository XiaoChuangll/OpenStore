<template>
  <div class="updates-view" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <div class="page-header">
      <div class="tabs-container">
        <div class="device-tabs">
          <div 
            class="tab-glider" 
            :style="{ 
              transform: `translateX(${activeTab === 'new' ? 0 : 100}%)`,
              width: '50%'
            }"
          ></div>
          <div 
            class="device-tab"
            :class="{ active: activeTab === 'new' }"
            @click="activeTab = 'new'"
            style="width: 50%"
          >
            <span class="tab-label">今日上新</span>
          </div>
          <div 
            class="device-tab"
            :class="{ active: activeTab === 'update' }"
            @click="activeTab = 'update'"
            style="width: 50%"
          >
            <span class="tab-label">今日更新</span>
          </div>
        </div>
      </div>
      <div class="update-filters">
        <div class="device-tabs">
          <div 
            class="tab-glider" 
            :style="{ 
              transform: `translateX(${filterGliderPosition})`,
              width: '33.33%'
            }"
          ></div>
          <template v-if="activeTab === 'new'">
            <div 
              class="device-tab" 
              :class="{ active: updateFilter === 'thisWeek' }"
              @click="setUpdateFilter('thisWeek')"
              style="width: 33.33%"
            >
              本周
            </div>
            <div 
              class="device-tab" 
              :class="{ active: updateFilter === 'lastWeek' }"
              @click="setUpdateFilter('lastWeek')"
              style="width: 33.33%"
            >
              上周
            </div>
            <div 
              class="device-tab" 
              :class="{ active: updateFilter === 'older' }"
              @click="setUpdateFilter('older')"
              style="width: 33.33%"
            >
              更多
            </div>
          </template>
          <template v-else>
            <div 
              class="device-tab" 
              :class="{ active: updateFilter === 'today' }"
              @click="setUpdateFilter('today')"
              style="width: 33.33%"
            >
              今日
            </div>
            <div 
              class="device-tab" 
              :class="{ active: updateFilter === 'yesterday' }"
              @click="setUpdateFilter('yesterday')"
              style="width: 33.33%"
            >
              昨日
            </div>
            <div 
              class="device-tab" 
              :class="{ active: updateFilter === '2daysAgo' }"
              @click="setUpdateFilter('2daysAgo')"
              style="width: 33.33%"
            >
              前日
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="apps-container" v-if="activeTab === 'new'">
      <div class="update-group">
        <h3 class="group-title">
          <Transition :name="transitionName" mode="out-in">
            <span :key="`${titlePrefix}__${titleSuffix}`" class="title-combo">
              <span class="title-prefix">{{ titlePrefix }}</span>
              <span class="title-suffix" v-if="titlePrefix">{{ titleSuffix }}</span>
            </span>
          </Transition>
        </h3>
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
          <el-empty v-else-if="apps.length === 0" :description="emptyDescription" />
          <div class="apps-grid" v-else>
            <AppCard
              v-for="app in apps"
              :key="app.id"
              :app="app"
              :show-time-badge="true"
              time-field="listed_at"
              @click="handleAppClick"
            />
          </div>
        </div>
      </div>

      <div class="pagination-container" v-if="!loading && (apps.length > 0 || page > 1)">
        <el-button 
          :disabled="page === 1" 
          @click="changePage(-1)"
          circle
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-info">第 {{ page }} 页</span>
        <el-button 
          :disabled="!hasMore" 
          @click="changePage(1)"
          circle
        >
          <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>
    
    <div class="apps-container" v-else>
      <div class="update-group">
        <h3 class="group-title group-title-row">
          <div class="group-title-left">
            <Transition :name="transitionName" mode="out-in">
              <span :key="`${titlePrefix}__${titleSuffix}`" class="title-combo">
                <span class="title-prefix">{{ titlePrefix }}</span>
                <span class="title-suffix" v-if="titlePrefix">{{ titleSuffix }}</span>
              </span>
            </Transition>
          </div>
          <div class="group-title-right">
            <div
              class="title-search"
              :class="{ expanded: updateSearchOpen }"
            >
              <div class="search-trigger-wrapper" :class="{ 'is-hidden': updateSearchOpen }">
                <el-button
                  class="update-search-trigger"
                  circle
                  :icon="Search"
                  @click="toggleUpdateSearch"
                />
              </div>

              <div class="search-expanded-panel" :class="{ 'is-visible': updateSearchOpen }">
                <el-button
                  class="search-reset-btn"
                  text
                  circle
                  :icon="Close"
                  @click="closeSearch"
                />

                <el-input
                  ref="updateSearchInputRef"
                  v-model="updateSearchQuery"
                  placeholder="搜索应用..."
                  class="search-input-field"
                  @keyup.enter="runUpdateSearch"
                />

                <el-button
                  type="primary"
                  circle
                  class="search-submit-btn"
                  :icon="Search"
                  @click="runUpdateSearch"
                />
              </div>
            </div>

            <el-button v-if="isUpdateSearchActive && !updateSearchOpen" circle :icon="CircleClose" @click="clearUpdateSearch" />
          </div>
        </h3>
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
          <el-empty v-else-if="apps.length === 0" :description="emptyDescription" />
          <div class="apps-grid" v-else>
            <AppCard
              v-for="app in apps"
              :key="app.id"
              :app="app"
              :show-time-badge="true"
              time-field="release_date"
              @click="handleAppClick"
            />
          </div>
        </div>
      </div>

      <div class="pagination-container" v-if="!loading && (apps.length > 0 || page > 1)">
        <el-button 
          :disabled="page === 1" 
          @click="changePage(-1)"
          circle
        >
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <span class="page-info">第 {{ page }} 页</span>
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
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Search, CircleClose, Close } from '@element-plus/icons-vue';
import { getAppUpdates, getNewApps } from '../services/api';
import AppCard from '../components/AppCard.vue';
import { hmApi } from '../services/hm-api';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const loadSeq = ref(0);
const activeTab = ref('new');
const updateFilter = ref('thisWeek');
const apps = ref<any[]>([]);
const page = ref(1);
const pageSize = ref(20);
const hasMore = ref(false);
const totalCount = ref(0);
const transitionName = ref('flip-up');
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

const updateSearchOpen = ref(false);
const updateSearchQuery = ref('');
const updateSearchInputRef = ref<any>(null);
const updateSearchPerformed = ref(false);

const getQueryString = (v: unknown) => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return '';
};

const parsePositiveInt = (raw: unknown, fallback: number) => {
  const n = Number.parseInt(getQueryString(raw), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
};

const applyInitialStateFromRoute = () => {
  const tab = getQueryString(route.query.tab);
  const filter = getQueryString(route.query.filter);
  const initPage = parsePositiveInt(route.query.page, 1);
  const q = getQueryString(route.query.q);
  const searched = getQueryString(route.query.searched);

  if (tab === 'new' || tab === 'update') {
    activeTab.value = tab;
  }

  if (activeTab.value === 'new') {
    if (filter === 'thisWeek' || filter === 'lastWeek' || filter === 'older') {
      updateFilter.value = filter;
    } else {
      updateFilter.value = 'thisWeek';
    }
  } else {
    if (filter === 'today' || filter === 'yesterday' || filter === '2daysAgo') {
      updateFilter.value = filter;
    } else {
      updateFilter.value = 'today';
    }
    if (searched === '1' && q.trim()) {
      updateSearchQuery.value = q.trim();
      updateSearchPerformed.value = true;
    }
  }

  page.value = initPage;
};

applyInitialStateFromRoute();

const isUpdateSearchActive = computed(() => {
  return activeTab.value === 'update' && updateSearchPerformed.value;
});

const closeSearch = async () => {
  updateSearchOpen.value = false;
  if (updateSearchPerformed.value) {
    await clearUpdateSearch();
  } else {
    updateSearchQuery.value = '';
  }
};

// State for caching app updates
const allUpdateApps = ref<any[]>([]); // Cache for all fetched updates
const updateAppsPage = ref(0); // Current page fetched for updates
const updateAppsHasMore = ref(true); // Server has more updates

// State for caching new apps (thisWeek / lastWeek)
const allNewApps = ref<any[]>([]);
const newAppsPage = ref(0); // last fetched API page number (1-based), 0 means not fetched yet
const newAppsHasMore = ref(true);

// State for caching older apps (older)
const allOlderApps = ref<any[]>([]);
const olderAppsPage = ref<number | null>(null); // last fetched API page index
const olderAppsStartPage = ref<number | null>(null); // first API page that contains < lastWeekStart
const olderAppsTotalPages = ref<number | null>(null);
const olderAppsHasMore = ref(true);

const emptyDescription = computed(() => {
  const suffix = activeTab.value === 'new' ? '新应用上架' : '今日更新';
  if (isUpdateSearchActive.value) return '暂无搜索结果';
  if (activeTab.value === 'new') {
    if (updateFilter.value === 'thisWeek') return `本周暂无${suffix}`;
    if (updateFilter.value === 'lastWeek') return `上周暂无${suffix}`;
    if (updateFilter.value === 'older') return `暂无更早${suffix}`;
  } else {
    if (updateFilter.value === 'today') return `今日暂无${suffix}`;
    if (updateFilter.value === 'yesterday') return `昨日暂无${suffix}`;
    if (updateFilter.value === '2daysAgo') return `前日暂无${suffix}`;
  }
  return `暂无${suffix}`;
});

const titlePrefix = computed(() => {
  if (isUpdateSearchActive.value) return '搜索结果';
  if (activeTab.value === 'new') {
    if (updateFilter.value === 'thisWeek') return '本周';
    if (updateFilter.value === 'lastWeek') return '上周';
    if (updateFilter.value === 'older') return '更早';
  } else {
    if (updateFilter.value === 'today') return '今日';
    if (updateFilter.value === 'yesterday') return '昨日';
    if (updateFilter.value === '2daysAgo') return '前日';
  }
  return '应用';
});

const titleSuffix = computed(() => {
  if (isUpdateSearchActive.value) return '';
  return activeTab.value === 'new' ? '上新' : '更新';
});

const filterGliderPosition = computed(() => {
  if (activeTab.value === 'new') {
    if (updateFilter.value === 'thisWeek') return '0%';
    if (updateFilter.value === 'lastWeek') return '100%';
    if (updateFilter.value === 'older') return '200%';
  } else {
    if (updateFilter.value === 'today') return '0%';
    if (updateFilter.value === 'yesterday') return '100%';
    if (updateFilter.value === '2daysAgo') return '200%';
  }
  return '0%';
});

const normalizeFilterForTab = () => {
  if (activeTab.value === 'new') {
    if (updateFilter.value !== 'thisWeek' && updateFilter.value !== 'lastWeek' && updateFilter.value !== 'older') {
      updateFilter.value = 'thisWeek';
    }
  } else {
    if (updateFilter.value !== 'today' && updateFilter.value !== 'yesterday' && updateFilter.value !== '2daysAgo') {
      updateFilter.value = 'today';
    }
  }
};

const syncRouteQuery = () => {
  const nextQuery: any = { ...route.query };
  nextQuery.tab = activeTab.value;
  nextQuery.filter = updateFilter.value;
  nextQuery.page = String(page.value);
  nextQuery.title = activeTab.value === 'new' ? '今日上新' : '今日更新';

  const q = updateSearchQuery.value.trim();
  const shouldIncludeSearch = activeTab.value === 'update' && updateSearchPerformed.value && q;
  if (shouldIncludeSearch) {
    nextQuery.q = q;
    nextQuery.searched = '1';
  } else {
    delete nextQuery.q;
    delete nextQuery.searched;
  }

  const keys = new Set([...Object.keys(nextQuery), ...Object.keys(route.query)]);
  for (const k of keys) {
    const a = getQueryString((nextQuery as any)[k]);
    const b = getQueryString((route.query as any)[k]);
    if (a !== b) {
      router.replace({ query: nextQuery });
      return;
    }
  }
};

watch(activeTab, async (newTab) => {
  page.value = 1; // Reset page on tab switch
  if (newTab === 'new') {
    updateSearchOpen.value = false;
    updateSearchQuery.value = '';
    updateSearchPerformed.value = false;
    updateFilter.value = 'thisWeek';
    loadApps();
  } else {
    updateFilter.value = 'today';
    loadApps();
  }
});

watch([activeTab, updateFilter, page, updateSearchQuery, updateSearchPerformed], () => {
  syncRouteQuery();
});

const toggleUpdateSearch = async () => {
  updateSearchOpen.value = !updateSearchOpen.value;
  if (updateSearchOpen.value) {
    await nextTick();
    updateSearchInputRef.value?.focus?.();
  }
};

const runUpdateSearch = async () => {
  const q = updateSearchQuery.value.trim();
  if (!q) return;
  updateSearchQuery.value = q;
  updateSearchPerformed.value = true;
  page.value = 1;
  await loadApps();
};

const clearUpdateSearch = async () => {
  updateSearchQuery.value = '';
  updateSearchPerformed.value = false;
  page.value = 1;
  await loadApps();
};

const setUpdateFilter = async (filter: string) => {
  if (updateFilter.value === filter) return;
  updateFilter.value = filter;
  if (activeTab.value === 'update') {
    updateSearchPerformed.value = false;
    updateSearchQuery.value = '';
    updateSearchOpen.value = false;
  }
  page.value = 1; // Reset page on filter change
  await loadApps();
};

const getTargetDateStr = () => {
  const utc8Offset = 8 * 60 * 60 * 1000;
  const now = new Date();
  const nowUtc8 = new Date(now.getTime() + utc8Offset);
  let targetDate = new Date(nowUtc8);
  
  if (updateFilter.value === 'yesterday') {
    targetDate = new Date(targetDate.getTime() - (24 * 60 * 60 * 1000));
  } else if (updateFilter.value === '2daysAgo') {
    targetDate = new Date(targetDate.getTime() - (48 * 60 * 60 * 1000));
  }
  
  const y = targetDate.getUTCFullYear();
  const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getFilterRange = () => {
  const now = new Date();
  const nowLocal = new Date(now.getTime() + UTC8_OFFSET_MS);
  const todayStart = new Date(nowLocal);
  todayStart.setUTCHours(0, 0, 0, 0);

  const day = todayStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; 
  
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setUTCDate(todayStart.getUTCDate() + diff);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);
  
  return { todayStart, thisWeekStart, lastWeekStart };
};

const toMs = (rawTs: any) => {
  let dateVal: number;
  if (typeof rawTs === 'number') dateVal = rawTs;
  else if (typeof rawTs === 'string' && /^\d+$/.test(rawTs)) dateVal = parseInt(rawTs, 10);
  else dateVal = new Date(rawTs).getTime();
  if (!dateVal || isNaN(dateVal)) return 0;
  if (dateVal < 10000000000) dateVal *= 1000;
  return dateVal;
};

const getNewAppTimeMsUtc8 = (app: any) => {
  const rawTs = app?.listed_at || app?.release_date || app?.update_time || app?.created_at;
  const ms = toMs(rawTs);
  if (!ms) return 0;
  return ms + UTC8_OFFSET_MS;
};

const filterApps = (sourceList: any[]) => {
  if (activeTab.value === 'new') {
    const { thisWeekStart, lastWeekStart } = getFilterRange();
    
    return sourceList.filter((app: any) => {
      const appMsUtc8 = getNewAppTimeMsUtc8(app);
      if (!appMsUtc8) return false;
      
      if (updateFilter.value === 'thisWeek') {
        return appMsUtc8 >= thisWeekStart.getTime();
      } else if (updateFilter.value === 'lastWeek') {
        return appMsUtc8 >= lastWeekStart.getTime() && appMsUtc8 < thisWeekStart.getTime();
      } else if (updateFilter.value === 'older') {
        return appMsUtc8 < lastWeekStart.getTime();
      }
      return false;
    });
  } else {
    const targetDateStr = getTargetDateStr();
    return sourceList.filter((app: any) => {
      const rawTs = app.release_date || app.update_time || app.created_at;
      if (!rawTs) return false;
      
      let dateVal: number;
      if (typeof rawTs === 'number') dateVal = rawTs;
      else if (typeof rawTs === 'string' && /^\d+$/.test(rawTs)) dateVal = parseInt(rawTs, 10);
      else dateVal = new Date(rawTs).getTime();
      
      if (!dateVal || isNaN(dateVal)) return false;
      if (dateVal < 10000000000) dateVal *= 1000;
      
      const utc8Offset = 8 * 60 * 60 * 1000;
      const d = new Date(dateVal + utc8Offset);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const appDateStr = `${y}-${m}-${day}`;
      
      return appDateStr === targetDateStr;
    });
  }
};

const loadApps = async () => {
  const seq = (loadSeq.value += 1);
  loading.value = true;
  
  try {
    normalizeFilterForTab();
    if (activeTab.value === 'new') {
      const { thisWeekStart, lastWeekStart } = getFilterRange();
      const fetchSize = 50;
      const requiredEnd = page.value * pageSize.value;
      const start = (page.value - 1) * pageSize.value;
      const end = start + pageSize.value;

      if (updateFilter.value === 'older') {
        const boundaryMsUtc8 = lastWeekStart.getTime();

        const resolveOlderStartPage = async () => {
          if (olderAppsStartPage.value !== null && olderAppsTotalPages.value !== null) return;

          const first = await getNewApps(1, 1);
          const total = first.total || 0;
          const totalPages = Math.max(1, Math.ceil(total / fetchSize));
          olderAppsTotalPages.value = totalPages;

          if (total === 0) {
            olderAppsStartPage.value = 1;
            olderAppsHasMore.value = false;
            return;
          }

          let lo = 1;
          let hi = totalPages;
          let ans: number | null = null;

          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const resp = await getNewApps(mid, fetchSize);
            const items: any[] = (resp.data || []).map((item: any) => item.info || item);
            if (items.length === 0) {
              hi = mid - 1;
              continue;
            }

            const oldestMsUtc8 = getNewAppTimeMsUtc8(items[items.length - 1]);
            if (oldestMsUtc8 && oldestMsUtc8 < boundaryMsUtc8) {
              ans = mid;
              hi = mid - 1;
            } else {
              lo = mid + 1;
            }
          }

          olderAppsStartPage.value = ans;
          allOlderApps.value = [];
          olderAppsPage.value = null;
          olderAppsHasMore.value = true;
        };

        const ensureOlderEnough = async () => {
          await resolveOlderStartPage();
          if (olderAppsStartPage.value === null) {
            olderAppsHasMore.value = false;
            return;
          }

          if (olderAppsPage.value === null) {
            olderAppsPage.value = olderAppsStartPage.value - 1;
          }

          let loops = 0;
          while (olderAppsHasMore.value && loops < 30) {
            const filteredOlder = filterApps(allOlderApps.value);
            if (filteredOlder.length >= requiredEnd) break;

            const nextPage: number = (olderAppsPage.value ?? 0) + 1;
            const totalPages = olderAppsTotalPages.value ?? 0;
            if (totalPages > 0 && nextPage > totalPages) {
              olderAppsHasMore.value = false;
              break;
            }

            const resp = await getNewApps(nextPage, fetchSize);
            const items: any[] = (resp.data || []).map((item: any) => item.info || item);
            if (items.length === 0) {
              olderAppsHasMore.value = false;
              break;
            }

            allOlderApps.value = [...allOlderApps.value, ...items];
            olderAppsPage.value = nextPage;
            if (items.length < fetchSize) {
              olderAppsHasMore.value = false;
            }

            loops += 1;
          }
        };

        await ensureOlderEnough();

        const allForFilter = filterApps(allOlderApps.value);
        totalCount.value = allForFilter.length;
        apps.value = allForFilter.slice(start, end);
        hasMore.value = end < totalCount.value || olderAppsHasMore.value;
      } else {
        const boundaryMsUtc8 = updateFilter.value === 'thisWeek' ? thisWeekStart.getTime() : lastWeekStart.getTime();

        const ensureNewEnough = async () => {
          let loops = 0;
          while (newAppsHasMore.value && loops < 30) {
            const filtered = filterApps(allNewApps.value);
            if (filtered.length >= requiredEnd) break;

            const lastMsUtc8 = allNewApps.value.length ? getNewAppTimeMsUtc8(allNewApps.value[allNewApps.value.length - 1]) : 0;
            if (lastMsUtc8 && lastMsUtc8 < boundaryMsUtc8) break;

            const nextPage = newAppsPage.value + 1;
            const resp = await getNewApps(nextPage, fetchSize);
            const items: any[] = (resp.data || []).map((item: any) => item.info || item);
            if (items.length === 0) {
              newAppsHasMore.value = false;
              break;
            }

            allNewApps.value = [...allNewApps.value, ...items];
            newAppsPage.value = nextPage;
            if (items.length < fetchSize) {
              newAppsHasMore.value = false;
            }

            loops += 1;
          }
        };

        await ensureNewEnough();

        const allForFilter = filterApps(allNewApps.value);
        totalCount.value = allForFilter.length;
        apps.value = allForFilter.slice(start, end);

        const lastMsUtc8 = allNewApps.value.length ? getNewAppTimeMsUtc8(allNewApps.value[allNewApps.value.length - 1]) : 0;
        const passedRange = lastMsUtc8 && lastMsUtc8 < boundaryMsUtc8;
        hasMore.value = end < totalCount.value || (!passedRange && newAppsHasMore.value);
      }

    } else {
      if (isUpdateSearchActive.value) {
        const params: any = {
          page_size: pageSize.value,
          sort: 'download_count',
          desc: true,
          search_key: 'name',
          search_value: updateSearchQuery.value.trim(),
          search_exact: false
        };
        const response = await hmApi.get<any>(`/apps/list/${page.value}`, params);
        if (seq !== loadSeq.value) return;

        // API returns { success: true, data: { data: [...], total: ... } }
        const innerData = response.data || response;
        const list: any[] = Array.isArray(innerData.data) ? innerData.data : (Array.isArray(innerData) ? innerData : []);
        
        apps.value = list.map((item: any) => item?.info || item);
        totalCount.value = innerData.total_count || innerData.total || 0;
        
        if (totalCount.value > 0) {
          hasMore.value = page.value * pageSize.value < totalCount.value;
        } else {
          hasMore.value = list.length >= pageSize.value;
        }
        return;
      }

      const targetDateStr = getTargetDateStr();
      
      const checkAndFetch = async () => {
        const lastApp = allUpdateApps.value[allUpdateApps.value.length - 1];
        let lastAppDateStr = '';
        if (lastApp) {
          const rawTs = lastApp.release_date || lastApp.update_time || lastApp.created_at;
          if (rawTs) {
             let dateVal = typeof rawTs === 'number' ? rawTs : (typeof rawTs === 'string' && /^\d+$/.test(rawTs) ? parseInt(rawTs, 10) : new Date(rawTs).getTime());
             if (dateVal < 10000000000) dateVal *= 1000;
             const utc8Offset = 8 * 60 * 60 * 1000;
             const d = new Date(dateVal + utc8Offset);
             const y = d.getUTCFullYear();
             const m = String(d.getUTCMonth() + 1).padStart(2, '0');
             const day = String(d.getUTCDate()).padStart(2, '0');
             lastAppDateStr = `${y}-${m}-${day}`;
          }
        }

        const needMore = updateAppsHasMore.value && (
          allUpdateApps.value.length === 0 || 
          lastAppDateStr >= targetDateStr
        );

        if (needMore) {
          updateAppsPage.value += 1;
          const fetchSize = 50;
          const response = await getAppUpdates(updateAppsPage.value, fetchSize);
          
          let newItems: any[] = response.data || [];
          newItems = newItems.map((item: any) => item.info || item);
          
          if (newItems.length === 0) {
            updateAppsHasMore.value = false;
          } else {
            allUpdateApps.value = [...allUpdateApps.value, ...newItems];
            await checkAndFetch();
          }
        }
      };

      await checkAndFetch();
      if (seq !== loadSeq.value) return;
      
      const allForDate = filterApps(allUpdateApps.value);
      totalCount.value = allForDate.length;
      
      const start = (page.value - 1) * pageSize.value;
      const end = start + pageSize.value;
      apps.value = allForDate.slice(start, end);
      
      hasMore.value = end < totalCount.value;
    }
  } catch (error) {
    console.error('Failed to load apps:', error);
    if (activeTab.value === 'new') {
      apps.value = [];
      hasMore.value = false;
    }
  } finally {
    if (seq === loadSeq.value) {
      loading.value = false;
    }
  }
};

const changePage = (delta: number) => {
  const newPage = page.value + delta;
  if (newPage < 1) return;
  page.value = newPage;
  loadApps();
  // Scroll to top of grid
  const grid = document.querySelector('.apps-grid');
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const handleAppClick = (app: any) => {
  const appId = app?.app_id || app?.id;
  if (!appId) return;
  router.push({
    name: 'updates-app-detail',
    params: { id: appId },
    query: { from: route.fullPath, title: app.name }
  });
};

onMounted(() => {
  normalizeFilterForTab();
  loadApps();
});

// Gesture Handling
const touchStartX = ref(0);
const touchStartY = ref(0);

const handleTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX;
  touchStartY.value = e.touches[0].clientY;
};

const handleTouchEnd = (e: TouchEvent) => {
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  
  const diffX = touchEndX - touchStartX.value;
  const diffY = touchEndY - touchStartY.value;

  // Horizontal swipe detection (threshold 50px, and mostly horizontal)
  if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
    if (diffX < 0) {
      // Swipe Left -> Next Filter
      switchNextFilter();
    } else {
      // Swipe Right -> Prev Filter
      switchPrevFilter();
    }
  }
};

const switchNextFilter = () => {
  if (activeTab.value === 'new') {
    if (updateFilter.value === 'thisWeek') setUpdateFilter('lastWeek');
    else if (updateFilter.value === 'lastWeek') setUpdateFilter('older');
  } else {
    if (updateFilter.value === 'today') setUpdateFilter('yesterday');
    else if (updateFilter.value === 'yesterday') setUpdateFilter('2daysAgo');
  }
};

const switchPrevFilter = () => {
  if (activeTab.value === 'new') {
    if (updateFilter.value === 'older') setUpdateFilter('lastWeek');
    else if (updateFilter.value === 'lastWeek') setUpdateFilter('thisWeek');
  } else {
    if (updateFilter.value === '2daysAgo') setUpdateFilter('yesterday');
    else if (updateFilter.value === 'yesterday') setUpdateFilter('today');
  }
};
</script>

<style scoped>
.updates-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}

.tabs-container {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.device-tabs {
  display: flex;
  position: relative;
  background-color: var(--el-fill-color);
  border-radius: 50px;
  border: 4px solid var(--el-fill-color);
  padding: 0;
  width: 300px; /* Fixed width for the switch */
  height: 40px; /* Explicit height */
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

.page-subtitle {
  font-size: 16px;
  color: var(--el-text-color-secondary);
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

.loading-wrapper {
  height: 200px;
  width: 100%;
}

@media (max-width: 768px) {
  .updates-view {
    padding: 16px;
  }
  
  .page-title {
    font-size: 24px;
  }
}

.update-group {
  margin-bottom: 32px;
}

.group-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 16px;
  padding-left: 12px;
  position: relative;
  line-height: 1.2;
  height: 40px;
  display: flex;
  align-items: center;
}

.group-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.group-title-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  flex: 1 1 auto;
  max-width: 340px;
  min-width: 40px;
}

.group-title-left {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 0;
}

.group-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 3px;
  width: 4px;
  background-color: var(--el-color-primary);
  border-radius: 4px;
}

.update-filters {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  position: relative;
}

.title-search {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 40px;
  height: 40px;
  overflow: hidden;
  transition: width 0.3s linear;
  background-color: transparent;
  border-radius: 20px;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.title-search.expanded {
  width: 100%;
  max-width: 340px;
  background-color: var(--el-bg-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--el-border-color-lighter);
}

.search-trigger-wrapper {
  position: absolute;
  right: 0;
  top: 0;
  width: 40px;
  height: 40px;
  transition: opacity 0.2s;
  opacity: 1;
  pointer-events: auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.search-trigger-wrapper.is-hidden {
  opacity: 0;
  pointer-events: none;
}

.update-search-trigger {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
}

.search-expanded-panel {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 4px;
  gap: 8px;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
  min-width: 0;
}

.search-expanded-panel.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.search-reset-btn {
  flex: 0 0 auto;
  color: var(--el-text-color-secondary);
  margin-right: -6px; /* 拉近与输入框的距离 */
  margin-left: 2px;
  z-index: 1;
}

.search-reset-btn:hover {
  color: var(--el-text-color-primary);
  background-color: transparent;
}

.search-submit-btn {
  flex: 0 0 auto;
}

.search-input-field {
  flex: 1;
  min-width: 0;
}

.search-input-field :deep(.el-input-group__prepend) {
  background-color: transparent;
  padding: 0;
  box-shadow: none;
}

.search-input-field :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background-color: transparent;
  padding-left: 0;
}

.search-input-field :deep(.el-select .el-input__wrapper) {
  box-shadow: none !important;
}

.update-search-input {
  width: 240px;
}

/* Flip Animation */
.title-combo {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  backface-visibility: hidden;
  transform-style: preserve-3d;
}

.flip-up-enter-active,
.flip-up-leave-active,
.flip-down-enter-active,
.flip-down-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Flip Up (Next Item / Down List) */
.flip-up-enter-from {
  transform: rotateX(-90deg);
  opacity: 0;
}
.flip-up-leave-to {
  transform: rotateX(90deg);
  opacity: 0;
}
.flip-up-enter-to,
.flip-up-leave-from {
  transform: rotateX(0deg);
  opacity: 1;
}

/* Flip Down (Prev Item / Up List) */
.flip-down-enter-from {
  transform: rotateX(90deg);
  opacity: 0;
}
.flip-down-leave-to {
  transform: rotateX(-90deg);
  opacity: 0;
}
.flip-down-enter-to,
.flip-down-leave-from {
  transform: rotateX(0deg);
  opacity: 1;
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
