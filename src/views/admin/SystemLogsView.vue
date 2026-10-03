<template>
  <div class="admin-view">
    <AdminPageHeader :embedded="embedded" title="系统日志" />

    <AdminSection title="操作日志">
      <template #meta>
        <span class="section-count">共 {{ total }} 条</span>
        <span class="meta-chip">今日 {{ todayCount }} 条</span>
      </template>
      <template #actions>
        <div class="head-right">
          <el-tooltip :content="realtime ? '新日志会自动插到列表顶部，点击暂停' : '已暂停接收，点击恢复'" placement="top">
            <button
              type="button"
              class="live-toggle"
              :class="{ 'is-on': realtime }"
              @click="realtime = !realtime"
            >
              <span class="live-dot"></span>
              {{ realtime ? '实时接收' : '已暂停' }}
            </button>
          </el-tooltip>
          <el-button size="small" :icon="Refresh" :loading="loading" @click="fetchList">刷新</el-button>
        </div>
      </template>

      <!-- 过滤条 -->
      <div class="filter-bar">
        <el-input
          v-model="searchKeyword"
          class="filter-search"
          size="small"
          clearable
          placeholder="搜索操作人 / 动作 / 对象 / 详情"
          @input="onSearchInput"
          @keyup.enter="applyFilter"
          @clear="applyFilter"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="actionFilter" size="small" class="filter-select" clearable placeholder="全部动作" @change="applyFilter">
          <el-option
            v-for="item in actionOptions"
            :key="item.action"
            :label="`${actionLabel(item.action)} (${item.count})`"
            :value="item.action"
          />
        </el-select>
        <el-select v-model="actorFilter" size="small" class="filter-select" clearable placeholder="全部操作人" @change="applyFilter">
          <el-option
            v-for="item in actorOptions"
            :key="item.actor"
            :label="`${item.actor || '未知'} (${item.count})`"
            :value="item.actor"
          />
        </el-select>

        <div class="filter-actions">
          <el-button
            type="danger"
            plain
            size="small"
            :icon="Delete"
            :disabled="selectedIds.length === 0"
            @click="handleDelete"
          >
            删除选中{{ selectedIds.length ? ` (${selectedIds.length})` : '' }}
          </el-button>
          <el-button type="danger" text size="small" @click="handleClearAll">清空全部</el-button>
        </div>
      </div>

      <!-- 宽屏：表格；中屏：隐藏「操作人 / 详情」两列，信息并入相邻格子 -->
      <el-table
        v-if="!isMobile"
        :data="items"
        style="width: 100%"
        v-loading="loading"
        row-key="id"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column type="expand" width="44">
          <template #default="{ row }">
            <div class="payload-box">
              <div class="payload-title">详情内容</div>
              <pre class="payload-body">{{ prettyPayload(row.payload) }}</pre>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="时间" min-width="124">
          <template #default="{ row }">
            <div class="time-cell">
              <span class="time-main">{{ formatTime(row.created_at) }}</span>
              <span class="time-sub">{{ timeSubLine(row) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="!isCompact" label="操作人" min-width="90">
          <template #default="{ row }">
            <span class="actor-chip">{{ row.actor || '未知' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="动作" min-width="96">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" effect="light" size="small">
              {{ actionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="对象" min-width="150">
          <template #default="{ row }">
            <div class="entity-cell">
              <span class="entity-name">{{ row.entity || '—' }}</span>
              <span v-if="row.entity_id" class="entity-id">#{{ row.entity_id }}</span>
            </div>
            <span v-if="isCompact" class="entity-sub" :title="prettyPayload(row.payload)">
              {{ payloadBrief(row.payload) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column v-if="!isCompact" label="详情" min-width="140">
          <template #default="{ row }">
            <span class="payload-brief" :title="prettyPayload(row.payload)">
              {{ payloadBrief(row.payload) }}
            </span>
          </template>
        </el-table-column>

        <template #empty>
          <div class="table-empty">
            <span>{{ hasFilter ? '没有符合条件的日志' : '暂无操作日志' }}</span>
          </div>
        </template>
      </el-table>

      <!-- 窄屏：一条日志一张卡片，点击展开完整详情 -->
      <div v-else class="log-cards" v-loading="loading">
        <div
          v-for="row in items"
          :key="row.id"
          class="log-card"
          :class="{ 'is-open': expandedIds.includes(row.id) }"
          @click="toggleExpand(row.id)"
        >
          <div class="log-card-top">
            <el-checkbox
              class="log-card-check"
              :model-value="selectedIds.includes(row.id)"
              @click.stop
              @change="(v: any) => toggleSelect(row.id, !!v)"
            />
            <el-tag :type="actionTagType(row.action)" effect="light" size="small">
              {{ actionLabel(row.action) }}
            </el-tag>
            <span class="log-card-relative">{{ relativeTime(row.created_at) }}</span>
            <span class="log-card-abs">{{ formatTime(row.created_at) }}</span>
          </div>

          <div class="log-card-entity">
            <span class="entity-name">{{ row.entity || '—' }}</span>
            <span v-if="row.entity_id" class="entity-id">#{{ row.entity_id }}</span>
          </div>

          <p class="log-card-payload">{{ payloadBrief(row.payload) }}</p>

          <pre v-if="expandedIds.includes(row.id)" class="payload-body">{{ prettyPayload(row.payload) }}</pre>

          <div class="log-card-foot">
            <span class="actor-chip">{{ row.actor || '未知' }}</span>
            <span class="log-card-toggle">{{ expandedIds.includes(row.id) ? '收起详情' : '查看详情' }}</span>
          </div>
        </div>

        <p v-if="!items.length" class="table-empty">
          {{ hasFilter ? '没有符合条件的日志' : '暂无操作日志' }}
        </p>
      </div>

      <div v-if="total > pageSize" class="pagination">
        <div v-if="isMobile" class="mobile-pagination-container">
          <div class="mobile-pagination-controls">
            <el-button size="small" :disabled="page <= 1" @click="onPageChange(1)">首页</el-button>
            <el-pagination
              small
              layout="prev, jumper, next"
              :page-size="pageSize"
              :total="total"
              :current-page="page"
              @current-change="onPageChange"
            />
            <el-button size="small" :disabled="page >= Math.ceil(total / pageSize)" @click="onPageChange(Math.ceil(total / pageSize))">尾页</el-button>
          </div>
        </div>
        <el-pagination
          v-else
          background
          layout="total, prev, pager, next"
          :page-size="pageSize"
          :total="total"
          :current-page="page"
          @current-change="onPageChange"
        />
      </div>
    </AdminSection>
  </div>
</template>

<script setup lang="ts">
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue';
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { getSystemLogs, deleteSystemLogs, type SystemLog } from '../../services/admin';
import { onWS } from '../../services/ws';
import { Delete, Refresh, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AdminSection from '../../components/admin/AdminSection.vue';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const items = ref<SystemLog[]>([]);
const total = ref(0);
const todayCount = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const selectedIds = ref<number[]>([]);
const realtime = ref(true);
const actionOptions = ref<Array<{ action: string; count: number }>>([]);
const actorOptions = ref<Array<{ actor: string; count: number }>>([]);

const searchKeyword = ref('');
const actionFilter = ref('');
const actorFilter = ref('');

const hasFilter = computed(() => !!(searchKeyword.value.trim() || actionFilter.value || actorFilter.value));

const isMobile = ref(window.innerWidth < 768);
/** 中屏（表格放不下全部列时）把「操作人 / 详情」并进相邻格子 */
const isCompact = ref(window.innerWidth < 1200);
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
  isCompact.value = window.innerWidth < 1200;
};

const expandedIds = ref<number[]>([]);
const toggleExpand = (id: number) => {
  const index = expandedIds.value.indexOf(id);
  if (index >= 0) expandedIds.value.splice(index, 1);
  else expandedIds.value.push(id);
};

/** 窄屏卡片没有表格的勾选框，这里自己维护选中状态 */
const toggleSelect = (id: number, checked: boolean) => {
  const index = selectedIds.value.indexOf(id);
  if (checked && index < 0) selectedIds.value.push(id);
  if (!checked && index >= 0) selectedIds.value.splice(index, 1);
};

let listRequestSeq = 0;
const fetchList = async () => {
  const seq = ++listRequestSeq;
  loading.value = true;
  try {
    const data = await getSystemLogs(page.value, pageSize.value, {
      search: searchKeyword.value.trim() || undefined,
      action: actionFilter.value || undefined,
      actor: actorFilter.value || undefined
    });
    if (seq !== listRequestSeq) return;
    items.value = data.items;
    total.value = data.total;
    todayCount.value = data.today_count ?? 0;
    if (data.actions) actionOptions.value = data.actions;
    if (data.actors) actorOptions.value = data.actors;
  } finally {
    if (seq === listRequestSeq) loading.value = false;
  }
};

/** 改筛选条件后回到第一页 */
const applyFilter = () => {
  page.value = 1;
  fetchList();
};

// 输入即搜：停顿 300ms 再查
let searchTimer: number | undefined;
const onSearchInput = () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(applyFilter, 300);
};

const handleSelectionChange = (selection: SystemLog[]) => {
  selectedIds.value = selection.map((item) => item.id);
};

const handleDelete = async () => {
  if (selectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 条日志吗？`, '警告', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    });
    await deleteSystemLogs(selectedIds.value);
    ElMessage.success('删除成功');
    selectedIds.value = [];
    fetchList();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败');
  }
};

const handleClearAll = async () => {
  try {
    await ElMessageBox.confirm('确定要清空所有系统日志吗？此操作不可恢复！', '严重警告', {
      type: 'warning',
      confirmButtonText: '确定清空',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    });
    await deleteSystemLogs([], true);
    ElMessage.success('已清空所有日志');
    fetchList();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('清空失败');
  }
};

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};

/** 动作文案：常见操作给出中文，其余原样显示 */
const ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  batch_delete: '批量删除',
  'batch-delete': '批量删除',
  batch_enable: '批量启用',
  'batch-status': '批量改状态',
  publish: '发布',
  offline: '下线',
  restore: '恢复',
  approve: '审核通过',
  submit: '提交',
  login: '登录',
  logout: '退出',
  clear_logs: '清空日志',
  replay: '请求重放',
  upload: '上传文件',
  env_set: '修改环境变量',
  env_set_plain: '修改环境变量',
  password_change: '修改密码',
  site_cards_reset: '重置卡片配置'
};

const actionLabel = (action?: string | null) => {
  const key = String(action || '').trim();
  if (!key) return '未知操作';
  return ACTION_LABELS[key] || key;
};

const actionTagType = (action?: string | null) => {
  const key = String(action || '').toLowerCase();
  if (key.includes('delete') || key.includes('clear') || key.includes('reject')) return 'danger';
  if (key.includes('create') || key.includes('publish') || key.includes('approve')) return 'success';
  if (key.includes('update') || key.includes('restore')) return 'primary';
  if (key.includes('offline') || key.includes('login') || key.includes('logout')) return 'warning';
  return 'info';
};

/** 后端存的是 UTC 秒级时间，这里换算成北京时间显示 */
const formatTime = (value?: string | null) => {
  if (!value) return '—';
  const raw = String(value);
  const iso = raw.includes('T') ? (raw.endsWith('Z') ? raw : `${raw}Z`) : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const relativeTime = (value?: string | null) => {
  if (!value) return '';
  const raw = String(value);
  const iso = raw.includes('T') ? (raw.endsWith('Z') ? raw : `${raw}Z`) : `${raw.replace(' ', 'T')}Z`;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return '';
};

/*
 * 时间下方那行：相对时间（超过 30 天为空）+ 窄屏时拼上操作人。
 * 用 join 拼接，避免相对时间为空时只剩一个孤零零的分隔点（· admin）。
 */
const timeSubLine = (row: SystemLog) => {
  const parts = [relativeTime(row?.created_at)];
  if (isCompact.value) parts.push(row?.actor || '未知');
  return parts.filter(Boolean).join(' · ');
};

const prettyPayload = (payload?: string | null) => {
  if (!payload) return '无附加信息';
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return String(payload);
  }
};

const payloadBrief = (payload?: string | null) => {
  if (!payload) return '—';
  const text = prettyPayload(payload).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
};


onMounted(() => {
  window.addEventListener('resize', checkMobile);
  fetchList();

  /*
   * onWS 的回调签名是 (type, payload) —— 这里以前按"整个消息对象"用（msg.type / msg.payload），
   * 于是第一个参数拿到的是字符串 'logs:new'，msg.type 恒为 undefined，
   * 每次都直接 return：界面永远收不到新日志，「实时接收」形同虚设。
   */
  onWS((type: string, payload: any) => {
    if (type !== 'logs:new' || !realtime.value) return;
    // 只在第一页且没有筛选时插入，避免和筛选结果对不上
    if (page.value === 1 && !hasFilter.value) {
      items.value.unshift(payload);
      total.value += 1;
      todayCount.value += 1;
      if (items.value.length > pageSize.value) items.value.pop();
    }
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
  window.clearTimeout(searchTimer);
});
</script>

<style scoped>

.section-count,
.meta-chip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.meta-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  overflow: hidden;
  text-overflow: ellipsis;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

/* 实时接收：小状态按钮（比开关更贴合这里的排版） */
.live-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background-color: transparent;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.live-toggle:hover {
  color: var(--el-text-color-primary);
  border-color: var(--el-border-color);
}

.live-toggle.is-on {
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-5);
  background-color: var(--el-color-success-light-9);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-text-color-placeholder);
}

.live-toggle.is-on .live-dot {
  background-color: var(--el-color-success);
  box-shadow: 0 0 0 3px var(--el-color-success-light-8);
}

.filter-search { width: 260px; max-width: 100%; }
.filter-select { width: 160px; }

.filter-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.time-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.time-main {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time-sub {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.actor-chip {
  display: inline-block;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-regular);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.entity-cell {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.entity-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.entity-id {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.payload-brief {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 中屏：对象格里的详情摘要 */
.entity-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ---------- 窄屏卡片列表 ---------- */
.log-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 80px;
}

.log-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.log-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.log-card.is-open {
  background-color: var(--el-fill-color-light);
}

.log-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-card-check {
  margin-right: -4px;
}

.log-card-relative {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.log-card-abs {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

.log-card-entity {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.log-card-payload {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.log-card.is-open .log-card-payload {
  display: none;
}

.log-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.log-card-toggle {
  font-size: 12px;
  color: var(--el-color-primary);
}

.payload-box {
  padding: 8px 12px 12px;
}

.payload-title {
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.payload-body {
  margin: 0;
  padding: 12px;
  max-height: 320px;
  overflow: auto;
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
  font-size: 12px;
  line-height: 1.6;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.mobile-pagination-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex-wrap: wrap;
}

.mobile-pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 768px) {
  .section-card { padding: 14px 12px; }
  .filter-search { width: 100%; }
  .filter-select { flex: 1 1 140px; width: auto; }
  .filter-actions { margin-left: 0; width: 100%; justify-content: flex-end; }
  .pagination { justify-content: center; padding: 10px 0; }
}
</style>
