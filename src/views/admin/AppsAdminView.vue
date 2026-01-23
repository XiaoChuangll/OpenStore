<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 应用管理 </span>
      </template>
    </el-page-header>
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增应用</el-button>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="应用列表" name="apps">
        <el-table :data="items" stripe style="width: 100%">
          <el-table-column label="应用" min-width="140">
            <template #default="{ row }">
              <div class="app-info-cell">
                <img v-if="row.icon_url" :src="row.icon_url" class="app-icon" alt="icon" loading="lazy" />
                <el-icon v-else :size="32" class="app-icon-placeholder"><Monitor /></el-icon>
                <span class="app-name">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column label="管理" width="160">
            <template #default="{ row }">
              <div class="action-cell">
                <el-switch 
                  :model-value="row.enabled === 1" 
                  @update:model-value="(v: boolean) => toggleEnabled(row, v)" 
                  style="margin-right: 12px"
                />
                <el-button link type="primary" :icon="Edit" @click="editRow(row)" />
                <el-button link type="danger" :icon="Delete" @click="remove(row)" />
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="!isMobile" prop="provider" label="提供者" width="150" show-overflow-tooltip />
          <el-table-column v-if="!isMobile" prop="download_url" label="下载链接" show-overflow-tooltip />
          <el-table-column v-if="!isMobile" label="背景" width="160">
            <template #default="{ row }">
              <img v-if="row.bg_url" :src="row.bg_url" class="banner" alt="bg" loading="lazy" />
              <el-tag v-else type="info">无</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="待审核应用" name="pending">
        <el-table :data="pendingItems" stripe style="width: 100%">
          <el-table-column label="应用" min-width="160">
            <template #default="{ row }">
              <div class="app-info-cell">
                <img v-if="row.icon_url" :src="row.icon_url" class="app-icon" alt="icon" loading="lazy" />
                <el-icon v-else :size="32" class="app-icon-placeholder"><Monitor /></el-icon>
                <span class="app-name">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="getSubmissionStatusType(row.status)">{{ getSubmissionStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="!isMobile" prop="provider" label="提供者" width="160" show-overflow-tooltip />
          <el-table-column v-if="!isMobile" prop="download_url" label="下载链接" show-overflow-tooltip />
          <el-table-column v-if="!isMobile" prop="created_at" label="提交时间" width="180" />
          <el-table-column label="操作" width="260">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="editPending(row)" :disabled="row.loading">编辑</el-button>
              <el-button size="small" type="success" @click="approve(row)" :loading="row.loading">通过</el-button>
              <el-button size="small" type="danger" @click="reject(row)" :loading="row.loading">拒绝</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showDialog" :title="dialogTitle" :width="isMobile ? '90%' : '600px'">
      <el-form :model="form" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="提供者"><el-input v-model="form.provider" /></el-form-item>
        <el-form-item label="背景URL">
          <div class="upload-row">
            <el-input v-model="form.bg_url" placeholder="输入图片URL或上传" class="url-input" />
            <el-upload
              :auto-upload="true"
              :show-file-list="false"
              :http-request="onUploadBg"
              accept="image/*"
              :before-upload="beforeUpload"
            >
              <el-button>上传背景</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="图标URL">
          <div class="upload-row">
            <el-input v-model="form.icon_url" placeholder="输入图标URL或上传" class="url-input" />
            <el-upload
              :auto-upload="true"
              :show-file-list="false"
              :http-request="onUploadIcon"
              accept="image/*"
              :before-upload="beforeUpload"
            >
              <el-button>上传图标</el-button>
            </el-upload>
          </div>
        </el-form-item>
        <el-form-item label="下载链接"><el-input v-model="form.download_url" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabledSwitch" /></el-form-item>
        <el-form-item label="背景预览">
          <div class="preview-box">
            <el-image
              v-if="form.bg_url"
              class="preview-bg"
              :src="form.bg_url"
              :preview-src-list="[form.bg_url]"
              fit="cover"
              preview-teleported
            />
            <div v-else class="preview-placeholder">无背景</div>
          </div>
        </el-form-item>
        <el-form-item label="图标预览">
          <div class="preview-box">
            <el-image
              v-if="form.icon_url"
              class="preview-icon-img"
              :src="form.icon_url"
              :preview-src-list="[form.icon_url]"
              fit="cover"
              preview-teleported
            />
            <div v-else class="preview-placeholder icon-placeholder">无图标</div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessageBox, ElMessage } from 'element-plus';
import { Plus, Monitor, Edit, Delete } from '@element-plus/icons-vue';
import { getApps, createApp, updateApp, deleteApp, uploadFile, getAppSubmissions, approveAppSubmission, rejectAppSubmission, updateAppSubmission, type AppItem, type AppSubmission } from '../../services/admin';
import { useRouter } from 'vue-router';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;
const router = useRouter();
const items = ref<AppItem[]>([]);
const pendingItems = ref<Array<AppSubmission & { loading?: boolean }>>([]);
const activeTab = ref<'apps' | 'pending'>('apps');
const isMobile = ref(window.innerWidth < 768);

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
.banner { width: 120px; height: 60px; object-fit: cover; border-radius: 6px; }
.app-icon { width: 40px; height: 40px; object-fit: contain; border-radius: 4px; }
.upload-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.url-input { flex: 1; }

.app-info-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-icon-placeholder {
  width: 40px;
  height: 40px;
  background: #f0f2f5;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
.app-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-cell {
  display: flex;
  align-items: center;
}

.preview-box {
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  padding: 4px;
  display: inline-block;
  background-color: #fafafa;
}
.preview-bg {
  width: 160px;
  height: 80px;
  display: block;
  border-radius: 4px;
  cursor: pointer;
}
.preview-icon-img {
  width: 60px;
  height: 60px;
  display: block;
  border-radius: 12px;
  cursor: pointer;
}
.preview-placeholder {
  width: 160px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 12px;
}
.icon-placeholder {
  width: 60px;
  height: 60px;
}
</style>
