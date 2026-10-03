<template>
  <div class="feedback-admin-view">
    <AdminPageHeader :embedded="embedded" title="用户反馈" />

    <el-card>
      <!-- 限频配置并进列表卡片的头部，用表单形态 -->
      <div class="card-head">
        <div class="head-left">
          <span class="head-title">反馈列表</span>
          <span class="head-count">共 {{ total }} 条</span>
        </div>
        <div class="head-right">
          <el-button size="small" text :icon="Refresh" :loading="loading" @click="fetchList">刷新</el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :icon="Delete"
            :disabled="selectedIds.length === 0"
            @click="batchDelete"
          >
            批量删除{{ selectedIds.length ? ` (${selectedIds.length})` : '' }}
          </el-button>
        </div>
      </div>

      <div class="limit-strip">
        <el-form class="limit-form" label-position="left" @submit.prevent>
          <el-form-item label="提交限频" class="limit-form-item">
            <el-input-number
              v-model="rateLimit"
              :min="0"
              :max="999"
              size="small"
              controls-position="right"
              class="limit-input"
            />
            <span class="limit-unit">次 / IP / 分钟</span>
            <el-button size="small" type="primary" plain :loading="savingLimit" @click="saveLimit">保存</el-button>
            <el-tooltip content="0 表示不限制提交频率" placement="top">
              <span class="limit-hint">0 = 不限制</span>
            </el-tooltip>
          </el-form-item>
        </el-form>
      </div>
      <!-- 宽屏：完整表格；中屏：隐藏哈希/角色/环境，信息并入相邻格子 -->
      <el-table
        v-if="!isMobile"
        :data="items"
        v-loading="loading"
        @selection-change="onSelectionChange"
        @cell-click="onCellClick"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column v-if="!isCompact" prop="id" label="ID" min-width="56" />

        <el-table-column label="类型" min-width="104">
          <template #default="{ row }">
            <div class="stack-cell">
              <el-tag size="small" effect="light">{{ typeLabel(row.type) }}</el-tag>
              <span class="cell-sub">{{ row.user_role || 'guest' }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="标题 / 详情" min-width="150">
          <template #default="{ row }">
            <div class="stack-cell">
              <span class="title-text">{{ row.title || '未填写标题' }}</span>
              <span class="cell-sub single-line" :title="row.description || ''">
                {{ row.description || '（无详细描述）' }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="status" label="进度" min-width="80">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="时间" min-width="124">
          <template #default="{ row }">
            <div class="stack-cell">
              <span class="time-text">{{ formatTime(row.created_at) }}</span>
              <span class="cell-sub">{{ relativeTime(row.created_at) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="IP / 环境" min-width="120">
          <template #default="{ row }">
            <div class="stack-cell">
              <span class="mono-line single-line" :title="row.ip || ''">
                {{ row.ip || '未知 IP' }}<template v-if="row.email"> · {{ row.email }}</template>
              </span>
              <span class="cell-sub single-line" :title="envSummary(row)">{{ envSummary(row) }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 窄屏：一条反馈一张卡片，点击打开详情 -->
      <div v-else class="feedback-cards" v-loading="loading">
        <div
          v-for="row in items"
          :key="row.id"
          class="feedback-card"
          @click="onCellClick(row)"
        >
          <div class="feedback-card-top">
            <el-checkbox
              class="card-check"
              :model-value="selectedIds.includes(row.id)"
              @click.stop
              @change="(v: any) => toggleSelect(row.id, !!v)"
            />
            <el-tag size="small" effect="light">{{ typeLabel(row.type) }}</el-tag>
            <el-tag :type="statusTagType(row.status)" effect="light" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
            <span class="card-relative">{{ relativeTime(row.created_at) }}</span>
          </div>

          <div class="feedback-card-title">{{ row.title || '未填写标题' }}</div>
          <p class="feedback-card-desc">{{ row.description || '（无详细描述）' }}</p>

          <div class="feedback-card-meta">
            <span class="meta-item">#{{ row.id }}</span>
            <span class="meta-item">{{ row.user_role || 'guest' }}</span>
            <span class="meta-item">{{ row.ip || '未知 IP' }}</span>
            <span v-if="row.email" class="meta-item">{{ row.email }}</span>
          </div>
          <div class="feedback-card-meta">
            <span class="meta-item">{{ envSummary(row) }}</span>
            <span class="meta-item card-time">{{ formatTime(row.created_at) }}</span>
          </div>
        </div>

        <p v-if="!items.length" class="table-empty">暂无反馈记录</p>
      </div>
      <el-dialog v-model="detailDialogVisible" title="反馈详情" :width="isMobile ? '95%' : '700px'">
        <div class="dialog-section">
          <div class="dialog-grid">
            <div class="dialog-row"><span class="label">ID</span><span class="value">{{ detailItem?.id }}</span></div>
            <div class="dialog-row"><span class="label">类型</span><span class="value">{{ typeLabel(detailItem?.type) }}</span></div>
            <div class="dialog-row"><span class="label">时间</span><span class="value">{{ formatTime(detailItem?.created_at) }}</span></div>
            <div class="dialog-row">
              <span class="label">提交限频</span>
              <span class="value">{{ rateLimit > 0 ? `每 IP 每分钟最多 ${rateLimit} 次` : '不限制' }}</span>
            </div>
            <div class="dialog-row is-full"><span class="label">哈希</span><span class="value single-line">{{ detailItem?.hash }}</span></div>
          </div>
        </div>
        <el-form label-position="top" class="mt-2">
          <el-form-item label="标题">
            <el-input v-model="detailTitle" />
          </el-form-item>
          <el-form-item label="详情">
            <el-input v-model="detailDescription" type="textarea" :rows="5" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="detailStatus" placeholder="请选择">
              <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="detailDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="saveDetail">保存</el-button>
        </template>
      </el-dialog>
      
      <div class="mt-3 pagination-bar">
        <div v-if="isMobile" class="mobile-pagination-container">
          <div class="mobile-pagination-controls">
            <el-button size="small" :disabled="page <= 1" @click="onPageChange(1)">首页</el-button>
            <el-pagination
              small
              layout="prev, jumper, next"
              :current-page="page"
              :page-size="pageSize"
              :total="total"
              @current-change="onPageChange"
            />
            <el-button size="small" :disabled="page >= Math.ceil(total / pageSize)" @click="onPageChange(Math.ceil(total / pageSize))">尾页</el-button>
          </div>
        </div>
        <template v-else>
          <el-pagination
            background
            layout="total, prev, pager, next"
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            @current-change="onPageChange"
          />
        </template>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue';
import { ref, onMounted, onUnmounted } from 'vue';
import { getFeedbacks, deleteFeedbacks, updateFeedback, type Feedback } from '../../services/admin';
import { getEnvVars, setEnvVar } from '../../services/api';
import { ElMessageBox, ElMessage } from 'element-plus';
import { Refresh, Delete } from '@element-plus/icons-vue';

defineProps<{ embedded?: boolean }>();

const items = ref<Feedback[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const selectedIds = ref<number[]>([]);
const isMobile = ref(window.innerWidth < 768);
/** 中屏（表格放不下全部列时）把哈希/角色/环境并进相邻格子 */
const isCompact = ref(window.innerWidth < 1080);
const updateIsMobile = () => {
  isMobile.value = window.innerWidth < 768;
  isCompact.value = window.innerWidth < 1080;
};

const formatTime = (time?: string) => {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

/** 库里存的是 UTC 秒级时间，补上 Z 再算差值 */
const parseUtc = (time?: string) => {
  if (!time) return NaN;
  const raw = String(time);
  const iso = raw.includes('T') ? (raw.endsWith('Z') ? raw : `${raw}Z`) : `${raw.replace(' ', 'T')}Z`;
  return new Date(iso).getTime();
};

/** 相对时间：窄屏卡片上比绝对时间更好读 */
const relativeTime = (time?: string) => {
  const ts = parseUtc(time);
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return '';
};

/** 环境信息压成一行，供中屏与窄屏复用 */
const envSummary = (row: Feedback) => {
  const parts = [
    row.device_type ? `设备: ${row.device_type}` : '',
    row.os ? `系统: ${row.os}` : '',
    row.browser ? `浏览器: ${row.browser}` : '',
    row.network ? `网络: ${row.network}` : ''
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '无环境信息';
};

const statusTagType = (status?: string | null) => {
  const key = String(status || '').trim();
  if (key === 'completed') return 'success';
  if (key === 'accepted') return 'primary';
  if (key === 'rejected') return 'info';
  return 'warning';
};

/** 窄屏卡片没有表格勾选框，这里自己维护选中状态 */
const toggleSelect = (id: number, checked: boolean) => {
  const index = selectedIds.value.indexOf(id);
  if (checked && index < 0) selectedIds.value.push(id);
  if (!checked && index >= 0) selectedIds.value.splice(index, 1);
};

const rateLimit = ref(0);
const savingLimit = ref(false);
const fetchLimit = async () => {
  try {
    const envMap = await getEnvVars();
    const lists = Object.values(envMap || {});
    for (const list of lists) {
      const item = (list || []).find((it: any) => it.key === 'FEEDBACK_RATE_LIMIT_PER_MINUTE');
      if (item) {
        rateLimit.value = Number(item.value) || 0;
        break;
      }
    }
  } catch {}
};
const saveLimit = async () => {
  savingLimit.value = true;
  try {
    await setEnvVar({ key: 'FEEDBACK_RATE_LIMIT_PER_MINUTE', value: String(rateLimit.value || 0), secure: true, category: 'other' });
    ElMessage.success('限频配置已保存');
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  } finally {
    savingLimit.value = false;
  }
};


const detailDialogVisible = ref(false);
const detailItem = ref<Feedback | null>(null);
const statusOptions = [
  { value: 'pending', label: '待优化' },
  { value: 'accepted', label: '已接纳' },
  { value: 'rejected', label: '不接纳' },
  { value: 'completed', label: '已完成' },
] as const;
type StatusValue = (typeof statusOptions)[number]['value'];
const statusLabel = (s?: string | null) => {
  const opt = statusOptions.find(o => o.value === (s || '').trim());
  return opt ? opt.label : '待优化';
};
const feedbackTypes = [
  { value: 'bug', label: 'Bug / 错误报告' },
  { value: 'feature', label: '功能建议' },
  { value: 'ux', label: '体验问题' },
  { value: 'content', label: '内容反馈' },
  { value: 'other', label: '其他' },
] as const;
const typeLabel = (v?: string | null) => {
  const opt = feedbackTypes.find(o => o.value === (v || '').trim());
  return opt ? opt.label : (v || '');
};
const detailStatus = ref<StatusValue>('pending');
const detailTitle = ref('');
const detailDescription = ref('');
const saving = ref(false);
const onCellClick = (row: Feedback) => {
  detailItem.value = row;
  detailStatus.value = ((row.status || '') as StatusValue) || 'pending';
  detailTitle.value = row.title || '';
  detailDescription.value = row.description || '';
  detailDialogVisible.value = true;
};
const saveDetail = async () => {
  if (!detailItem.value) return;
  saving.value = true;
  try {
    await updateFeedback(detailItem.value.id, {
      status: detailStatus.value,
      title: detailTitle.value,
      description: detailDescription.value
    });
    ElMessage.success('反馈详情已更新');
    detailDialogVisible.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '更新失败');
  } finally {
    saving.value = false;
  }
};
const fetchList = async () => {
  loading.value = true;
  try {
    const data = await getFeedbacks(page.value, pageSize.value);
    items.value = data.items || [];
    total.value = data.total || 0;
  } finally {
    loading.value = false;
  }
};

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};

const onSelectionChange = (rows: Feedback[]) => {
  selectedIds.value = rows.map(r => r.id);
};

const batchDelete = async () => {
  if (selectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${selectedIds.value.length} 条反馈？`, '提示', { type: 'warning' });
    const res = await deleteFeedbacks(selectedIds.value);
    ElMessage.success(`已删除 ${res.deleted} 条`);
    selectedIds.value = [];
    fetchList();
  } catch (e) {
  }
};

onMounted(() => {
  fetchList();
  fetchLimit();
  window.addEventListener('resize', updateIsMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
});
</script>

<style scoped>
.mb-2 { margin-bottom: 8px; }
.mt-3 { margin-top: 12px; }
.mt-2 { margin-top: 8px; }

/* ---------- 列表卡片头部：标题 + 限频表单 ---------- */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  /* 标题与右侧按钮必须同一行：空间不够时压缩左侧信息，不换行 */
  flex-wrap: nowrap;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.head-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.head-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 限频设置做成一条设置带，而不是孤立的一行表单 */
.limit-strip {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 8px;
  background-color: var(--el-fill-color-lighter);
}

.limit-form {
  display: flex;
  align-items: center;
}

.limit-form-item {
  margin-bottom: 0;
}

.limit-form-item :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--el-text-color-regular);
  padding-right: 8px;
  line-height: 28px;
}

.limit-form-item :deep(.el-form-item__content) {
  display: flex;
  align-items: center;
  gap: 8px;
}

.limit-input {
  width: 110px;
}

.limit-unit {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.limit-hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  cursor: default;
}

/* ---------- 详情子页面 ---------- */
.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 16px;
}

/* 中屏：单元格里的第二行小字 */
.stack-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.title-text {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.time-text {
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.mono-line {
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
}

/* ---------- 窄屏反馈卡片 ---------- */
.feedback-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 80px;
}

.feedback-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.feedback-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.feedback-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-check {
  margin-right: -4px;
}

.card-relative {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.feedback-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.feedback-card-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.feedback-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.meta-item {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 100%;
}

.card-time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.table-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.dialog-row.is-full {
  grid-column: 1 / -1;
}

@media (max-width: 768px) {
  .card-head {
    align-items: flex-start;
  }

  .card-head { gap: 10px; }

  .head-title { font-size: 14px; }

  .limit-form,
  .limit-form :deep(.el-form-item),
  .limit-form-item :deep(.el-form-item__content) {
    width: 100%;
  }

  .limit-form-item :deep(.el-form-item__label) {
    display: none;
  }

  .dialog-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.pagination-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: nowrap; }
.pagination-bar :deep(.el-pagination) { display: inline-flex; }
.env { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--el-text-color-secondary); }
.single-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detail .env { margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--el-text-color-secondary); }
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
  .pagination-bar {
    justify-content: center;
    padding: 10px 0;
  }
}
.clickable { cursor: pointer; }
.dialog-section { font-size: 14px; line-height: 1.8; }
.dialog-row { display: flex; margin-bottom: 8px; }
.dialog-row .label { 
  color: var(--el-text-color-regular); 
  width: 80px; 
  text-align: left; 
  padding-right: 12px; 
  box-sizing: border-box; 
  flex-shrink: 0;
}
.dialog-row .value { flex: 1; word-break: break-word; color: var(--el-text-color-primary); }
</style>
