<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 应用管理 </span>
      </template>
    </el-page-header>
    <!-- toolbar--tabs：窄屏时这排按钮会被摆到下面页签行的右侧（见 AdminDashboardView） -->
    <div class="toolbar toolbar--tabs">
      <!-- size=small：放进页签行后按行高收一号，跟表头/页签的尺寸匹配 -->
      <el-button type="primary" size="small" :icon="Plus" @click="openCreate">新增应用</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="应用列表" name="apps">
        <div class="filter-bar">
          <el-input
            v-model="appKeyword"
            class="filter-search"
            size="small"
            clearable
            placeholder="搜索应用名 / 提供者 / 下载链接"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="appStatus" size="small" class="filter-status" @change="() => {}">
            <el-option label="全部状态" value="all" />
            <el-option label="已启用" value="enabled" />
            <el-option label="已停用" value="disabled" />
          </el-select>
          <span class="filter-count">共 {{ filteredApps.length }} 个</span>
          <el-button size="small" text :icon="Refresh" @click="refreshAll">刷新</el-button>
        </div>

        <el-table :data="filteredApps" style="width: 100%" :row-key="(row: AppItem) => row.id">
          <el-table-column label="应用" min-width="150">
            <template #default="{ row }">
              <div class="app-info-cell">
                <img v-if="getAppIconUrl(row) && !failedIcons.has(row.id)" :src="getAppIconUrl(row)" class="app-icon" alt="icon" loading="lazy" @error="onIconError(row.id)" />
                <span v-else class="app-icon app-icon-fallback">{{ (row.name || '?').charAt(0) }}</span>
                <div class="app-text">
                  <span class="app-name">{{ row.name }}</span>
                  <span class="app-sub">{{ row.provider || '未填写提供者' }}</span>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="状态" min-width="96">
            <template #default="{ row }">
              <div class="status-cell">
                <el-switch
                  :model-value="row.enabled === 1"
                  size="small"
                  @update:model-value="(v: boolean) => toggleEnabled(row, v)"
                />
                <span class="status-text" :class="{ 'is-off': row.enabled !== 1 }">
                  {{ row.enabled === 1 ? '已启用' : '已停用' }}
                </span>
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" label="下载链接" min-width="130">
            <template #default="{ row }">
              <a v-if="row.download_url" class="link-text" :href="row.download_url" target="_blank" rel="noopener" :title="row.download_url">
                {{ row.download_url }}
              </a>
              <span v-else class="muted-text">未填写</span>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" label="背景" min-width="88">
            <template #default="{ row }">
              <img v-if="row.bg_url" :src="row.bg_url" class="banner" alt="bg" loading="lazy" />
              <span v-else class="muted-text">无</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" min-width="150" align="right">
            <template #default="{ row }">
              <div class="action-cell">
                <el-tooltip content="编辑" placement="top" :show-after="300">
                  <el-button link type="primary" :icon="Edit" @click="editRow(row)" />
                </el-tooltip>
                <el-tooltip content="删除" placement="top" :show-after="300">
                  <el-button link type="danger" :icon="Delete" @click="remove(row)" />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>

          <template #empty>
            <div class="table-empty">
              <span>{{ appKeyword || appStatus !== 'all' ? '没有符合条件的应用' : '还没有应用' }}</span>
              <el-button v-if="!appKeyword && appStatus === 'all'" size="small" type="primary" plain @click="openCreate">
                新增应用
              </el-button>
            </div>
          </template>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="待审核应用" name="pending">
        <div class="filter-bar">
          <el-input
            v-model="pendingKeyword"
            class="filter-search"
            size="small"
            clearable
            placeholder="搜索投稿应用名 / 提供者"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <span class="filter-count">共 {{ filteredPending.length }} 条</span>
          <el-button size="small" text :icon="Refresh" @click="refreshPending">刷新</el-button>
        </div>

        <el-table :data="filteredPending" style="width: 100%" :row-key="(row: any) => row.id">
          <el-table-column label="应用" min-width="150">
            <template #default="{ row }">
              <div class="app-info-cell">
                <img v-if="getAppIconUrl(row) && !failedIcons.has(row.id)" :src="getAppIconUrl(row)" class="app-icon" alt="icon" loading="lazy" @error="onIconError(row.id)" />
                <span v-else class="app-icon app-icon-fallback">{{ (row.name || '?').charAt(0) }}</span>
                <div class="app-text">
                  <span class="app-name">{{ row.name }}</span>
                  <span class="app-sub">{{ row.provider || '未填写提供者' }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" min-width="96">
            <template #default="{ row }">
              <el-tag :type="getSubmissionStatusType(row.status)" effect="light" size="small">
                {{ getSubmissionStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="下载链接" min-width="150">
            <template #default="{ row }">
              <a v-if="row.download_url" class="link-text" :href="row.download_url" target="_blank" rel="noopener" :title="row.download_url">
                {{ row.download_url }}
              </a>
              <span v-else class="muted-text">未填写</span>
            </template>
          </el-table-column>
          <el-table-column v-if="!isMobile" label="提交时间" min-width="120">
            <template #default="{ row }">
              <span class="muted-text">{{ formatDateTime(row.created_at) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="190" align="right">
            <template #default="{ row }">
              <div class="action-cell">
                <el-button size="small" text :disabled="row.loading" @click="editPending(row)">编辑</el-button>
                <el-button size="small" type="success" plain :loading="row.loading" @click="approve(row)">通过</el-button>
                <el-button size="small" type="danger" plain :loading="row.loading" @click="reject(row)">拒绝</el-button>
              </div>
            </template>
          </el-table-column>

          <template #empty>
            <div class="table-empty">
              <span>{{ pendingKeyword ? '没有符合条件的投稿' : '暂无待审核投稿' }}</span>
            </div>
          </template>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showDialog" :title="dialogTitle" :width="isMobile ? '92%' : '680px'">
      <p class="dialog-hint">
        {{ editingTargetType === 'submission'
          ? '修改投稿内容后仍会保留在待审核列表里。'
          : '图标与背景可以直接上传，也可以粘贴图片外链。' }}
      </p>

      <el-form label-position="top" :model="form" class="app-form">
        <div class="form-grid">
          <el-form-item label="名称" required>
            <el-input v-model="form.name" placeholder="应用名称" />
          </el-form-item>
          <el-form-item label="提供者">
            <el-input v-model="form.provider" placeholder="开发者 / 提供方" />
          </el-form-item>
        </div>

        <div class="form-grid">
          <el-form-item label="图标">
            <div class="media-field">
              <div class="media-preview is-icon">
                <el-image
                  v-if="form.icon_url"
                  :src="form.icon_url"
                  fit="cover"
                  :preview-src-list="[form.icon_url]"
                  preview-teleported
                />
                <span v-else class="media-empty">无</span>
              </div>
              <div class="media-input">
                <el-input v-model="form.icon_url" placeholder="图片 URL" />
                <el-upload
                  :auto-upload="true"
                  :show-file-list="false"
                  :http-request="onUploadIcon"
                  accept="image/*"
                  :before-upload="beforeUpload"
                >
                  <el-button size="small">上传</el-button>
                </el-upload>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="背景">
            <div class="media-field">
              <div class="media-preview is-bg">
                <el-image
                  v-if="form.bg_url"
                  :src="form.bg_url"
                  fit="cover"
                  :preview-src-list="[form.bg_url]"
                  preview-teleported
                />
                <span v-else class="media-empty">无</span>
              </div>
              <div class="media-input">
                <el-input v-model="form.bg_url" placeholder="图片 URL" />
                <el-upload
                  :auto-upload="true"
                  :show-file-list="false"
                  :http-request="onUploadBg"
                  accept="image/*"
                  :before-upload="beforeUpload"
                >
                  <el-button size="small">上传</el-button>
                </el-upload>
              </div>
            </div>
          </el-form-item>
        </div>

        <el-form-item label="下载链接">
          <el-input v-model="form.download_url" placeholder="https://example.com/app.hap" />
        </el-form-item>

        <el-form-item label="状态">
          <div class="switch-row">
            <el-switch v-model="form.enabledSwitch" />
            <span class="switch-text">{{ form.enabledSwitch ? '上架展示' : '暂不展示' }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { Plus, Edit, Delete, Search, Refresh } from '@element-plus/icons-vue';
import { getApps, createApp, updateApp, deleteApp, uploadFile, getAppSubmissions, approveAppSubmission, rejectAppSubmission, updateAppSubmission, type AppItem, type AppSubmission } from '../../services/admin';
import { useRouter } from 'vue-router';
import { getAppIconUrl } from '../../utils/app-info';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;
const router = useRouter();
const items = ref<AppItem[]>([]);
const pendingItems = ref<Array<AppSubmission & { loading?: boolean }>>([]);
const activeTab = ref<'apps' | 'pending'>('apps');
const isMobile = ref(window.innerWidth < 768);

/* 列表筛选：都走前端过滤，数据量不大 */
const appKeyword = ref('');
const appStatus = ref<'all' | 'enabled' | 'disabled'>('all');
const pendingKeyword = ref('');

const matchKeyword = (keyword: string, ...fields: Array<string | null | undefined>) => {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => String(field || '').toLowerCase().includes(q));
};

const filteredApps = computed(() =>
  items.value.filter((app) => {
    if (appStatus.value === 'enabled' && app.enabled !== 1) return false;
    if (appStatus.value === 'disabled' && app.enabled === 1) return false;
    return matchKeyword(appKeyword.value, app.name, app.provider, app.download_url);
  })
);

const filteredPending = computed(() =>
  pendingItems.value.filter((item) =>
    matchKeyword(pendingKeyword.value, item.name, item.provider, item.download_url)
  )
);

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const refreshAll = async () => {
  await Promise.all([fetchList(), fetchPending()]);
};

const refreshPending = async () => {
  await fetchPending();
};

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

onMounted(() => {
  fetchList();
  fetchPending();
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});
const showDialog = ref(false);
const dialogTitle = ref('新增应用');
const editingTargetId = ref<number | null>(null);
const editingTargetType = ref<'app' | 'submission'>('app');
const saving = ref(false);
const form = ref<{ name: string; provider?: string | null; bg_url?: string | null; icon_url?: string | null; download_url?: string | null; enabledSwitch: boolean }>({
  name: '',
  provider: '',
  bg_url: '',
  icon_url: '',
  download_url: '',
  enabledSwitch: true,
});

const failedIcons = ref(new Set<number | string>());
const onIconError = (id: number | string) => {
  failedIcons.value.add(id);
};

const fetchList = async () => {
  try {
    items.value = await getApps();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载应用列表失败');
  }
};

const fetchPending = async () => {
  try {
    pendingItems.value = await getAppSubmissions({ status: 'pending' });
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载待审核列表失败');
  }
};

const openCreate = () => {
  dialogTitle.value = '新增应用';
  editingTargetId.value = null;
  editingTargetType.value = 'app';
  form.value = { name: '', provider: '', bg_url: '', icon_url: '', download_url: '', enabledSwitch: true };
  showDialog.value = true;
};
const editRow = (row: AppItem) => {
  dialogTitle.value = '编辑应用';
  editingTargetId.value = row.id;
  editingTargetType.value = 'app';
  form.value = { name: row.name, provider: row.provider || '', bg_url: row.bg_url || '', icon_url: row.icon_url || '', download_url: row.download_url || '', enabledSwitch: row.enabled === 1 };
  showDialog.value = true;
};
const editPending = (row: AppSubmission) => {
  dialogTitle.value = '编辑投稿';
  editingTargetId.value = row.id;
  editingTargetType.value = 'submission';
  form.value = { name: row.name, provider: row.provider || '', bg_url: row.bg_url || '', icon_url: row.icon_url || '', download_url: row.download_url || '', enabledSwitch: true };
  showDialog.value = true;
};
const save = async () => {
  if (saving.value) return;
  const payload = {
    name: (form.value.name || '').trim(),
    provider: form.value.provider || null,
    bg_url: form.value.bg_url || null,
    icon_url: form.value.icon_url || null,
    download_url: form.value.download_url || null,
    enabled: form.value.enabledSwitch ? 1 : 0,
  };
  if (!payload.name) { ElMessage.error('请输入名称'); return; }
  saving.value = true;
  try {
    if (editingTargetType.value === 'submission') {
      if (!editingTargetId.value) { ElMessage.error('投稿不存在'); return; }
      await updateAppSubmission(editingTargetId.value, payload);
      ElMessage.success('保存成功');
      fetchPending();
    } else {
      if (editingTargetId.value) {
        await updateApp(editingTargetId.value, payload);
        ElMessage.success('保存成功');
      } else {
        await createApp(payload);
        ElMessage.success('创建成功');
      }
      fetchList();
    }
    showDialog.value = false;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
};
const remove = (row: AppItem) => {
  ElMessageBox.confirm('确认删除该应用？', '提示', { type: 'warning' })
    .then(async () => { await deleteApp(row.id); fetchList(); ElMessage.success('删除成功'); })
    .catch(() => {});
};
const toggleEnabled = async (row: AppItem, v: boolean) => {
  const prev = row.enabled;
  const next = v ? 1 : 0;
  row.enabled = next;
  try {
    await updateApp(row.id, { enabled: next });
    fetchList();
  } catch (e: any) {
    row.enabled = prev;
    ElMessage.error(e?.response?.data?.error || '切换失败');
  }
};

const getSubmissionStatusType = (status?: string | null) => {
  const s = String(status || '').trim();
  if (s === 'approved') return 'success';
  if (s === 'rejected') return 'danger';
  if (s === 'pending') return 'warning';
  return 'info';
};

const getSubmissionStatusText = (status?: string | null) => {
  const s = String(status || '').trim();
  if (s === 'approved') return '已通过';
  if (s === 'rejected') return '已拒绝';
  if (s === 'pending') return '待审核';
  return s || '待审核';
};

const approve = async (row: AppSubmission & { loading?: boolean }) => {
  try {
    await ElMessageBox.confirm('确认通过该投稿？', '提示', { type: 'warning' });
    row.loading = true;
    await approveAppSubmission(row.id);
    ElMessage.success('已通过');
    fetchList();
    fetchPending();
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.error || '操作失败');
    }
  } finally {
    row.loading = false;
  }
};

const reject = async (row: AppSubmission & { loading?: boolean }) => {
  try {
    await ElMessageBox.confirm('确认拒绝该投稿？', '提示', { type: 'warning' });
    row.loading = true;
    await rejectAppSubmission(row.id);
    ElMessage.success('已拒绝');
    fetchPending();
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.error || '操作失败');
    }
  } finally {
    row.loading = false;
  }
};
const onUploadBg = async (opts: any) => {
  const file: File = opts.file as File;
  const res = await uploadFile(file);
  form.value.bg_url = res.url;
  opts.onSuccess({}, file);
};

const onUploadIcon = async (opts: any) => {
  const file: File = opts.file as File;
  const res = await uploadFile(file);
  form.value.icon_url = res.url;
  opts.onSuccess({}, file);
};

const beforeUpload = (rawFile: File) => {
  if (rawFile.type !== 'image/jpeg' && rawFile.type !== 'image/png' && rawFile.type !== 'image/webp') {
    ElMessage.error('Picture must be JPG/PNG/WEBP format!');
    return false;
  } else if (rawFile.size / 1024 / 1024 > 5) {
    ElMessage.error('Picture size can not exceed 5MB!');
    return false;
  }
  return true;
};

const goBack = () => router.push('/');
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; }

/* ---------- 顶部过滤条 ---------- */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-search { width: 260px; max-width: 100%; }
.filter-status { width: 120px; }

.filter-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: auto;
}

/* ---------- 应用单元格 ---------- */
.admin-view :deep(.el-table .el-table__cell) {
  padding: 6px 0;
}

.app-info-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.app-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  object-fit: cover;
  border-radius: 9px;
  background-color: var(--el-fill-color-light);
}

.app-icon-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.app-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 状态 / 链接 / 背景 ---------- */
.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-text {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.status-text.is-off {
  color: var(--el-text-color-placeholder);
}

.link-text {
  display: inline-block;
  max-width: 100%;
  font-size: 13px;
  color: var(--el-color-primary);
  text-decoration: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
}

.link-text:hover {
  text-decoration: underline;
}

.muted-text {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.banner {
  width: 80px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
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

/* ---------- 弹窗表单 ---------- */
.dialog-hint {
  margin: 0 0 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.app-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.media-field {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.media-preview {
  flex: 0 0 auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background-color: var(--el-fill-color-lighter);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-preview.is-icon {
  width: 56px;
  height: 56px;
}

.media-preview.is-bg {
  width: 88px;
  height: 56px;
}

.media-preview :deep(.el-image) {
  width: 100%;
  height: 100%;
}

.media-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.media-input {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.media-input :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.switch-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .filter-search { width: 100%; }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .media-input {
    flex-wrap: wrap;
  }
}
</style>
