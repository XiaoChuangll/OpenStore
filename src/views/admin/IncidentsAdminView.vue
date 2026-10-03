<template>
  <div class="admin-view">
    <AdminPageHeader :embedded="embedded" title="故障与维护管理" />

    <AdminSection title="故障、维护与提示">
      <template #meta>
        <span class="section-count">共 {{ items.length }} 条</span>
        <span v-if="ongoingCount" class="meta-chip is-alert">进行中 {{ ongoingCount }}</span>
        <span v-if="scheduledCount" class="meta-chip">计划维护 {{ scheduledCount }}</span>
        <span v-if="noticeCount" class="meta-chip">提示 {{ noticeCount }}</span>
      </template>
      <template #actions>
        <el-button type="primary" size="small" :icon="Plus" @click="handleCreate">发布</el-button>
      </template>

      <!-- 过滤条 -->
      <div class="filter-bar">
        <el-input
          v-model="searchKeyword"
          class="filter-search"
          size="small"
          clearable
          placeholder="搜索标题 / 说明"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="typeFilter" size="small" class="filter-select" placeholder="全部类型">
          <el-option label="全部类型" value="" />
          <el-option label="故障" value="incident" />
          <el-option label="维护" value="maintenance" />
          <el-option label="提示" value="notice" />
        </el-select>
        <el-select v-model="statusFilter" size="small" class="filter-select" placeholder="全部状态">
          <el-option label="全部状态" value="" />
          <el-option v-for="opt in statusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-button size="small" text :icon="Refresh" :loading="loading" @click="fetchList">刷新</el-button>
      </div>

      <!-- 宽屏：表格；列全部可伸缩，不会横向截断 -->
      <el-table v-if="!isMobile" :data="filteredItems" style="width: 100%" v-loading="loading">
        <el-table-column label="标题" min-width="150">
          <template #default="{ row }">
            <div class="stack-cell">
              <span class="title-text">{{ row.title }}</span>
              <span v-if="row.content" class="cell-sub single-line" :title="row.content">
                {{ row.content }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类型" min-width="96">
          <template #default="{ row }">
            <el-tag :type="typeTagMeta(row.type).tag" effect="light" size="small">
              {{ typeTagMeta(row.type).label }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="状态" min-width="104">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" effect="light" size="small">
              {{ getStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="时间" min-width="140">
          <template #default="{ row }">
            <div class="stack-cell">
              <span class="time-text">{{ formatTime(row.start_time) }}</span>
              <span class="cell-sub">{{ timeRangeText(row) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" min-width="110" align="right">
          <template #default="{ row }">
            <div class="action-cell">
              <el-tooltip content="编辑" placement="top" :show-after="300">
                <el-button link type="primary" :icon="Edit" @click="handleEdit(row)" />
              </el-tooltip>
              <el-tooltip content="删除" placement="top" :show-after="300">
                <el-button link type="danger" :icon="Delete" @click="handleDelete(row)" />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <div class="table-empty">
            <span>{{ hasFilter ? '没有符合条件的记录' : '暂无故障、维护或提示记录' }}</span>
            <el-button v-if="!hasFilter" size="small" type="primary" plain @click="handleCreate">
              发布
            </el-button>
          </div>
        </template>
      </el-table>

      <!-- 窄屏：卡片列表 -->
      <div v-else class="incident-cards" v-loading="loading">
        <div v-for="row in filteredItems" :key="row.id" class="incident-card" @click="handleEdit(row)">
          <div class="incident-top">
            <el-tag :type="typeTagMeta(row.type).tag" effect="light" size="small">
              {{ typeTagMeta(row.type).label }}
            </el-tag>
            <el-tag :type="getStatusType(row.status)" effect="light" size="small">
              {{ getStatusText(row) }}
            </el-tag>
            <span class="incident-range">{{ timeRangeText(row) }}</span>
          </div>
          <div class="incident-title">{{ row.title }}</div>
          <p v-if="row.content" class="incident-content">{{ row.content }}</p>
          <div class="incident-meta">
            <span>开始 {{ formatTime(row.start_time) }}</span>
            <span v-if="row.end_time">结束 {{ formatTime(row.end_time) }}</span>
          </div>
        </div>

        <p v-if="!filteredItems.length" class="table-empty">
          {{ hasFilter ? '没有符合条件的记录' : '暂无故障或维护记录' }}
        </p>
      </div>
    </AdminSection>

    <!-- 发布 / 编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑故障 / 维护 / 提示' : '发布故障 / 维护 / 提示'"
      :width="isMobile ? '92%' : '620px'"
      :fullscreen="isMobile"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <p class="dialog-hint">
        {{
          isEdit
            ? '修改后前台首页会立即更新。'
            : form.type === 'notice'
              ? '发布后前台首页会出现一条轻量提示（不显示为故障）。'
              : '发布后前台首页会立刻显示这条记录。'
        }}
      </p>
      <el-form label-position="top" ref="formRef" :model="form" :rules="rules">
        <div class="form-grid">
          <el-form-item label="类型" prop="type">
            <el-radio-group v-model="form.type" :size="isMobile ? 'small' : 'default'">
              <el-radio-button value="incident">故障</el-radio-button>
              <el-radio-button value="maintenance">维护</el-radio-button>
              <el-radio-button value="notice">提示</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="状态" prop="status">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-for="opt in statusOptionsForType" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" :placeholder="titlePlaceholder" />
        </el-form-item>

        <!-- 图标：前台卡片标题前那个 SVG，管理员可自选；不选就按类型取默认 -->
        <el-form-item label="图标">
          <div class="icon-picker">
            <button
              type="button"
              class="icon-option is-auto"
              :class="{ 'is-active': !form.icon }"
              title="按类型自动（故障 警告 / 维护 工具 / 提示 信息）"
              :aria-pressed="!form.icon"
              @click="form.icon = ''"
            >
              <el-icon><component :is="typeIcon" /></el-icon>
            </button>
            <button
              v-for="opt in ICON_OPTIONS"
              :key="opt.name"
              type="button"
              class="icon-option"
              :class="{ 'is-active': form.icon === opt.name }"
              :title="opt.label"
              :aria-label="opt.label"
              :aria-pressed="form.icon === opt.name"
              @click="form.icon = opt.name"
            >
              <el-icon><component :is="opt.icon" /></el-icon>
            </button>
          </div>
          <span class="icon-picker-hint">
            {{ form.icon ? `当前选用：${ICON_LABELS[form.icon] || form.icon}` : '当前：按类型自动' }}
          </span>
        </el-form-item>

        <div class="form-grid">
          <el-form-item label="开始时间" prop="start_time">
            <el-date-picker
              v-model="form.start_time"
              type="datetime"
              placeholder="选择开始时间"
              value-format="X"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item v-if="form.type !== 'incident'" label="结束时间" prop="end_time">
            <el-date-picker
              v-model="form.end_time"
              type="datetime"
              :placeholder="form.type === 'notice' ? '到期后自动隐藏（可不填）' : '预计结束时间'"
              value-format="X"
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <el-form-item label="详细说明" prop="content">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="4"
            :placeholder="form.type === 'notice' ? '支持 Markdown，例如：加群链接、使用提示（可选）' : '支持 Markdown（可选）'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ isEdit ? '保存' : '发布' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue';
import { ref, computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import { getIncidents, createIncident, updateIncident, deleteIncident, type Incident } from '../../services/admin';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Plus, Edit, Delete, Search, Refresh,
  WarningFilled, Tools, InfoFilled, BellFilled, Promotion, ChatDotRound,
  Link, Download, Clock, CircleCheckFilled, Star, Trophy, Setting, Monitor
} from '@element-plus/icons-vue';
import AdminSection from '../../components/admin/AdminSection.vue';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const items = ref<Incident[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const isEdit = ref(false);
const formRef = ref();

const searchKeyword = ref('');
const typeFilter = ref('');
const statusFilter = ref('');

const statusOptions = [
  { value: 'investigating', label: '正在调查' },
  { value: 'identified', label: '已确认' },
  { value: 'monitoring', label: '正在观察' },
  { value: 'resolved', label: '已解决' },
  { value: 'scheduled', label: '已计划' }
] as const;

/** 「提示」是轻量说明，只有展示中 / 已结束两种状态 */
const noticeStatusOptions = [
  { value: 'investigating', label: '展示中' },
  { value: 'resolved', label: '已结束' }
] as const;

/** 类型徽标：故障红 / 维护灰 / 提示蓝 */
const typeTagMeta = (type?: string) => {
  if (type === 'maintenance') return { tag: 'info' as const, label: '维护' };
  if (type === 'notice') return { tag: 'primary' as const, label: '提示' };
  return { tag: 'danger' as const, label: '故障' };
};

const form = reactive({
  id: 0,
  title: '',
  content: '',
  status: 'investigating' as string,
  type: 'incident' as string,
  icon: '' as string,
  start_time: Math.floor(Date.now() / 1000),
  end_time: undefined as number | undefined
});

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
};

const isMobile = ref(window.innerWidth < 768);
const updateIsMobile = () => { isMobile.value = window.innerWidth < 768; };

/** 当前类型可选的状态 / 标题占位文案 */
const statusOptionsForType = computed(() =>
  form.type === 'notice' ? noticeStatusOptions : statusOptions
);
const titlePlaceholder = computed(() =>
  form.type === 'notice' ? '例如：加群方式 / 使用提示' : '例如：数据库连接异常'
);

/** 标题前的图标：跟前台事故卡片用的是同一套（故障 警告 / 维护 工具 / 提示 信息） */
const typeIcon = computed(() => {
  if (form.type === 'maintenance') return Tools;
  if (form.type === 'notice') return InfoFilled;
  return WarningFilled;
});

/** 管理员可选的卡片图标（存图标名，前台按名字取同一个 SVG） */
const ICON_OPTIONS = [
  { name: 'WarningFilled', label: '警告 / 故障', icon: WarningFilled },
  { name: 'Tools', label: '工具 / 维护', icon: Tools },
  { name: 'InfoFilled', label: '信息 / 提示', icon: InfoFilled },
  { name: 'BellFilled', label: '通知', icon: BellFilled },
  { name: 'Promotion', label: '公告 / 推广', icon: Promotion },
  { name: 'ChatDotRound', label: '交流 / 群聊', icon: ChatDotRound },
  { name: 'Link', label: '链接', icon: Link },
  { name: 'Download', label: '下载', icon: Download },
  { name: 'Clock', label: '时间 / 稍后', icon: Clock },
  { name: 'CircleCheckFilled', label: '正常 / 完成', icon: CircleCheckFilled },
  { name: 'Star', label: '推荐 / 精选', icon: Star },
  { name: 'Trophy', label: '活动 / 榜单', icon: Trophy },
  { name: 'Setting', label: '设置 / 配置', icon: Setting },
  { name: 'Monitor', label: '系统 / 屏幕', icon: Monitor }
] as const;

const ICON_LABELS: Record<string, string> = ICON_OPTIONS.reduce(
  (acc, opt) => ({ ...acc, [opt.name]: opt.label }),
  {} as Record<string, string>
);

// 切到「提示」时，把不适合的状态换成「展示中」
watch(
  () => form.type,
  (type) => {
    if (type === 'notice' && !noticeStatusOptions.some((opt) => opt.value === form.status)) {
      form.status = 'investigating';
    } else if (type !== 'notice' && statusOptions.every((opt) => opt.value !== form.status)) {
      form.status = 'investigating';
    }
  }
);

const hasFilter = computed(() => !!(searchKeyword.value.trim() || typeFilter.value || statusFilter.value));

const filteredItems = computed(() =>
  items.value.filter((row) => {
    if (typeFilter.value && row.type !== typeFilter.value) return false;
    if (statusFilter.value && row.status !== statusFilter.value) return false;
    const q = searchKeyword.value.trim().toLowerCase();
    if (!q) return true;
    return `${row.title || ''} ${row.content || ''}`.toLowerCase().includes(q);
  })
);

/** 进行中：故障未解决；计划维护：状态为 scheduled */
const ongoingCount = computed(
  () => items.value.filter((row) => row.type === 'incident' && row.status !== 'resolved').length
);
const scheduledCount = computed(() => items.value.filter((row) => row.type === 'maintenance').length);
/** 提示：还没结束的都算「在线提示」 */
const noticeCount = computed(
  () => items.value.filter((row) => row.type === 'notice' && row.status !== 'resolved').length
);

const fetchList = async () => {
  loading.value = true;
  try {
    items.value = await getIncidents();
  } finally {
    loading.value = false;
  }
};

const getStatusType = (status: string) => {
  switch (status) {
    case 'resolved': return 'success';
    case 'monitoring': return 'primary';
    case 'identified': return 'warning';
    case 'investigating': return 'danger';
    case 'scheduled': return 'info';
    default: return 'info';
  }
};

/** 状态文案：提示类型用「展示中 / 已结束」，其它类型沿用故障流程的说法 */
const getStatusText = (row: Pick<Incident, 'status' | 'type'>) => {
  if (row.type === 'notice') {
    return row.status === 'resolved' ? '已结束' : '展示中';
  }
  return statusOptions.find((opt) => opt.value === row.status)?.label || row.status;
};

/** 时间戳是秒级（UTC 基准），这里换算成北京时间 */
const formatTime = (value?: number | null) => {
  if (!value) return '—';
  return new Date(value * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
};

/** 时间列第二行：维护显示起止区间，故障显示已持续/已恢复 */
const timeRangeText = (row: Incident) => {
  if (row.end_time) {
    return `${formatTime(row.start_time)} → ${formatTime(row.end_time)}`;
  }
  if (row.status === 'resolved') return '已解决（未记录结束时间）';
  const start = row.start_time ? row.start_time * 1000 : 0;
  if (!start) return '未记录开始时间';
  const diff = Date.now() - start;
  if (diff < 60_000) return '刚刚开始';
  if (diff < 3_600_000) return `已持续 ${Math.floor(diff / 60_000)} 分钟`;
  if (diff < 86_400_000) return `已持续 ${Math.floor(diff / 3_600_000)} 小时`;
  return `已持续 ${Math.floor(diff / 86_400_000)} 天`;
};


const handleCreate = () => {
  isEdit.value = false;
  form.id = 0;
  form.title = '';
  form.content = '';
  form.status = 'investigating';
  form.type = 'incident';
  form.icon = '';
  form.start_time = Math.floor(Date.now() / 1000);
  form.end_time = undefined;
  dialogVisible.value = true;
};

const handleEdit = (row: Incident) => {
  isEdit.value = true;
  form.id = row.id;
  form.title = row.title;
  form.content = row.content || '';
  form.status = row.status;
  form.type = row.type;
  form.icon = row.icon || '';
  form.start_time = row.start_time || Math.floor(Date.now() / 1000);
  form.end_time = row.end_time || undefined;
  dialogVisible.value = true;
};

const handleDelete = async (row: Incident) => {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」吗？`, '警告', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
    await deleteIncident(row.id);
    ElMessage.success('删除成功');
    fetchList();
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败');
  }
};

const submitForm = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const payload = {
        title: form.title,
        content: form.content,
        status: form.status as any,
        type: form.type as any,
        icon: form.icon || null,
        start_time: form.start_time,
        end_time: form.end_time
      };
      if (isEdit.value) await updateIncident(form.id, payload);
      else await createIncident(payload);
      ElMessage.success(isEdit.value ? '更新成功' : '发布成功');
      dialogVisible.value = false;
      fetchList();
    } catch (e) {
      ElMessage.error('操作失败');
    } finally {
      submitting.value = false;
    }
  });
};

onMounted(() => {
  window.addEventListener('resize', updateIsMobile);
  fetchList();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
});
</script>

<style scoped>

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  flex: 0 0 auto;
}

.section-head > .el-button {
  flex: 0 0 auto;
}

.meta-chip.is-alert {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-search { width: 240px; max-width: 100%; }
.filter-select { width: 140px; }

.stack-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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

.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.single-line {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.action-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

/* ---------- 窄屏卡片 ---------- */
.incident-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 80px;
}

.incident-card {
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

.incident-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.incident-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.incident-range {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.incident-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.incident-content {
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

.incident-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* ---------- 弹窗 ---------- */
.dialog-hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* 图标选择器：一排小圆钮，选中的高亮 */
.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.icon-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  font-size: 16px;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.icon-option:hover {
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}

.icon-option.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

/* 第一个是「按类型自动」，用虚线区分 */
.icon-option.is-auto {
  border-style: dashed;
}

.icon-picker-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

@media (max-width: 768px) {
  .section-card { padding: 14px 12px; }
  .filter-search { width: 100%; }
  .filter-select { flex: 1 1 140px; width: auto; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
