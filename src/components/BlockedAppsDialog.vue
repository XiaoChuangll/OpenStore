<template>
  <el-dialog
    :model-value="modelValue"
    :title="'异常应用'"
    :width="isMobile ? '92%' : '760px'"
    :fullscreen="isMobile"
    append-to-body
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @open="handleOpen"
  >
    <div class="blocked-dialog">
      <p class="blocked-hint">
        加进来的应用不会出现在首页 / 应用列表里（搜索时仍然能搜到）；用于屏蔽上游拉回来的脏数据。
      </p>

      <div class="blocked-search">
        <el-input
          v-model="keyword"
          placeholder="搜索应用名称，或直接粘贴包名（如 com.leisu.yuan）"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" :loading="searching" @click="handleSearch">搜索</el-button>
        <el-button v-if="keywordLooksLikePackage" type="danger" plain @click="blockByKeyword">
          直接屏蔽 {{ keyword.trim() }}
        </el-button>
      </div>

      <section class="panel">
        <div class="panel-head">
          <span>搜索结果</span>
          <span v-if="searched" class="panel-count">{{ results.length }} 条</span>
        </div>

        <div class="panel-body panel-body--results">
          <!-- 搜索中：先用骨架占位（待屏蔽应用的样子） -->
          <template v-if="searching">
            <div v-for="i in 4" :key="`search-sk-${i}`" class="list-row list-row--skeleton">
              <span class="app-icon app-icon--empty"></span>
              <div class="app-meta">
                <el-skeleton-item variant="text" style="width: 104px" />
                <el-skeleton-item variant="text" style="width: 168px" />
              </div>
            </div>
          </template>
          <template v-else>
            <p v-if="searched && !results.length" class="panel-empty">没有搜到匹配的应用，可以直接粘贴包名屏蔽</p>
            <div v-for="row in results" :key="row.pkg_name" class="list-row">
              <img v-if="row.icon_url" :src="row.icon_url" class="app-icon" alt="" loading="lazy" />
              <div v-else class="app-icon app-icon--empty"></div>
              <div class="app-meta">
                <span class="app-name">{{ row.name || '未命名' }}</span>
                <span class="app-pkg">{{ row.pkg_name }}</span>
              </div>
              <el-tag v-if="isBlocked(row.pkg_name)" type="danger" size="small" effect="plain">已屏蔽</el-tag>
              <el-button v-else link type="danger" @click="blockRow(row)">屏蔽</el-button>
            </div>
            <!-- 剩下的位置用骨架垫满，不留一块空白 -->
            <div v-for="i in resultSkeletonCount" :key="`idle-sk-${i}`" class="list-row list-row--skeleton is-idle">
              <span class="app-icon app-icon--empty"></span>
              <div class="app-meta">
                <el-skeleton-item variant="text" style="width: 104px" />
                <el-skeleton-item variant="text" style="width: 168px" />
              </div>
            </div>
          </template>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <span>已屏蔽 {{ items.length }} 个</span>
          <el-button link size="small" :loading="loading" @click="loadItems">刷新</el-button>
        </div>

        <div class="panel-body panel-body--blocked">
          <!-- 加载时先占几行骨架，避免高度跳动 -->
          <template v-if="loading && !items.length">
            <div v-for="i in 4" :key="`sk-${i}`" class="list-row list-row--skeleton">
              <span class="app-icon app-icon--empty"></span>
              <div class="app-meta">
                <el-skeleton-item variant="text" style="width: 96px" />
                <el-skeleton-item variant="text" style="width: 150px" />
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="item in items" :key="item.package" class="list-row">
              <img v-if="item.icon_url" :src="item.icon_url" class="app-icon" alt="" loading="lazy" />
              <div v-else class="app-icon app-icon--empty"></div>
              <div class="app-meta">
                <span class="app-name">{{ item.name || item.package }}</span>
                <span class="app-pkg">{{ item.package }}</span>
              </div>
              <el-button link type="primary" @click="unblock(item.package)">取消屏蔽</el-button>
            </div>
            <div v-for="i in blockedSkeletonCount" :key="`blocked-idle-${i}`" class="list-row list-row--skeleton is-idle">
              <span class="app-icon app-icon--empty"></span>
              <div class="app-meta">
                <el-skeleton-item variant="text" style="width: 104px" />
                <el-skeleton-item variant="text" style="width: 168px" />
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { blockApp, getBlockedApps, unblockApp, type BlockedApp } from '../services/admin';
import { hmApi } from '../services/hm-api';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();

interface SearchResult {
  name?: string;
  pkg_name?: string;
  icon_url?: string;
}

const items = ref<BlockedApp[]>([]);
const results = ref<SearchResult[]>([]);
const keyword = ref('');
const searched = ref(false);
const loading = ref(false);
const searching = ref(false);
const isMobile = ref(window.innerWidth <= 768);

/** 输入即搜：防抖 350ms，快速改关键词只发最后一次 */
const SEARCH_DEBOUNCE_MS = 350;
let searchTimer: number | null = null;
let searchSeq = 0;

const syncIsMobile = () => {
  isMobile.value = window.innerWidth <= 768;
};

const blockedSet = computed(() => new Set(items.value.map((item) => item.package.toLowerCase())));
const isBlocked = (pkg?: string) => !!pkg && blockedSet.value.has(String(pkg).toLowerCase());
/** 每块面板固定铺满 4 行：真实数据不足的位置用骨架补齐 */
const PANEL_SLOTS = 4;
const resultSkeletonCount = computed(() => {
  if (searching.value) return 0;
  // 「没有搜到」的提示文案占掉一行位置
  const slots = searched.value && !results.value.length ? PANEL_SLOTS - 1 : PANEL_SLOTS;
  return Math.max(0, slots - results.value.length);
});
const blockedSkeletonCount = computed(() => Math.max(0, PANEL_SLOTS - items.value.length));
/** 形如包名（含点、没有空格）时，允许直接按包名屏蔽 */
const keywordLooksLikePackage = computed(() => /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(keyword.value.trim()));

const loadItems = async () => {
  loading.value = true;
  try {
    items.value = await getBlockedApps();
  } catch {
    ElMessage.error('读取屏蔽列表失败');
  } finally {
    loading.value = false;
  }
};

const handleSearch = async () => {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
    searchTimer = null;
  }
  await runSearch();
};

/** 实际的搜索请求：只把最后一次的结果写回，避免快速输入时旧响应覆盖新结果 */
const runSearch = async () => {
  const value = keyword.value.trim();
  if (!value) {
    results.value = [];
    searched.value = false;
    return;
  }

  const seq = ++searchSeq;
  searching.value = true;
  try {
    const body = await hmApi.get<any>('/apps/list/1', {
      page_size: 20,
      sort: 'download_count',
      desc: true,
      search_key: 'name',
      search_value: value,
      search_exact: false
    });
    if (seq !== searchSeq) return;
    results.value = (body?.data?.data || []) as SearchResult[];
    searched.value = true;
  } catch {
    if (seq === searchSeq) ElMessage.error('搜索失败，可以直接粘贴包名屏蔽');
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
};

const blockRow = async (row: SearchResult) => {
  if (!row.pkg_name) return;
  await submitBlock({ package: row.pkg_name, name: row.name, icon_url: row.icon_url });
};

const blockByKeyword = async () => {
  await submitBlock({ package: keyword.value.trim() });
};

const submitBlock = async (payload: { package: string; name?: string; icon_url?: string }) => {
  try {
    await blockApp(payload);
    ElMessage.success(`已屏蔽 ${payload.package}`);
    await loadItems();
  } catch {
    ElMessage.error('屏蔽失败');
  }
};

const unblock = async (pkg: string) => {
  try {
    await unblockApp(pkg);
    ElMessage.success(`已取消屏蔽 ${pkg}`);
    await loadItems();
  } catch {
    ElMessage.error('取消屏蔽失败');
  }
};

const handleOpen = () => {
  // 每次打开都是干净状态：清掉上次的关键词和搜索结果
  keyword.value = '';
  loadItems();
};

// 输入即搜；清空输入（点 ✕ 或手动删空）时把上一次的搜索结果也清掉
watch(keyword, (value) => {
  if (searchTimer) {
    window.clearTimeout(searchTimer);
    searchTimer = null;
  }

  if (!value.trim()) {
    searchSeq++;
    results.value = [];
    searched.value = false;
    searching.value = false;
    return;
  }

  searchTimer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
});

onMounted(() => {
  window.addEventListener('resize', syncIsMobile);
  if (props.modelValue) loadItems();
});

onUnmounted(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
  window.removeEventListener('resize', syncIsMobile);
});
</script>

<style scoped>
.blocked-dialog {
  /* 固定最小高度：屏蔽列表为空时弹窗也不会缩成一条 */
  min-height: 452px;
}

.blocked-hint {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.blocked-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.blocked-search .el-input {
  flex: 1;
  min-width: 220px;
}

/* 两个固定高度的面板：弹窗高度不会随内容多少跳来跳去 */
.panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-blank);
  overflow: hidden;
}

.panel + .panel {
  margin-top: 12px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-fill-color-light);
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.panel-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.panel-body {
  box-sizing: border-box;
  overflow-y: auto;
  padding: 6px 12px;
}

.panel-body--results {
  /* 正好放下 4 行（4×46 行高 + 3 条分隔线 + 上下内边距 12） */
  height: 200px;
}

.panel-body--blocked {
  height: 200px;
}

.panel-body::-webkit-scrollbar {
  width: 6px;
}

.panel-body::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color);
  border-radius: 3px;
}

.panel-empty {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
}

.list-row + .list-row {
  border-top: 1px solid var(--el-border-color-lighter);
}

.list-row--skeleton .app-meta {
  gap: 6px;
}

/* 骨架行固定和真实行等高，4 行正好铺满面板 */
.list-row--skeleton {
  box-sizing: border-box;
  height: 46px;
}

.list-row--skeleton :deep(.el-skeleton__item) {
  height: 12px;
  border-radius: 6px;
  background-color: var(--el-border-color);
}

/* 未搜索时的占位骨架：只做“这里会有应用”的暗示，弱化处理 */
.list-row--skeleton.is-idle {
  opacity: 0.6;
}

.app-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background-color: var(--el-fill-color-light);
}

.app-icon--empty {
  border: 1px dashed var(--el-border-color);
}

.app-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.app-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-pkg {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
