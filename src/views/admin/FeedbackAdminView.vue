<template>
  <div class="feedback-admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 用户反馈 </span>
      </template>
    </el-page-header>

    <el-card class="mb-2">
      <div class="card-header"><h3>限频配置</h3></div>
      <el-form :inline="isMobile" label-width="140px">
        <el-form-item label="每IP每分钟次数">
          <el-input-number v-model="rateLimit" :min="0" :max="999" />
          <el-button type="primary" :loading="savingLimit" @click="saveLimit" style="margin-left: 8px;">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <div class="table-actions mb-2">
        <el-button type="primary" :loading="loading" @click="fetchList">刷新</el-button>
        <el-button type="danger" :disabled="selectedIds.length === 0" @click="batchDelete">批量删除</el-button>
      </div>
      <el-table :data="items" v-loading="loading" stripe @selection-change="onSelectionChange" @cell-click="onCellClick">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="{ row }">
            <span class="single-line">{{ typeLabel(row.type) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="hash" label="哈希" min-width="260">
          <template #default="{ row }">
            <div class="single-line">{{ row.hash }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题/概要" min-width="220">
          <template #default="{ row }">
            <div class="single-line">{{ row.title }}</div>
          </template>
        </el-table-column>
        <el-table-column label="详情" min-width="260">
          <template #default="{ row }">
            <div class="detail">
              <div class="desc single-line">{{ row.description }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="进度" width="120">
          <template #default="{ row }">
            {{ statusLabel(row.status) }}
          </template>
        </el-table-column>
        <el-table-column prop="user_role" label="角色" width="100" />
        <el-table-column prop="created_at" label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="IP" width="140">
          <template #default="{ row }">
            <div class="env">
              <span class="env-item">{{ row.ip }}</span>
              <span class="env-item contact" v-if="row.email">{{ row.email }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="环境" min-width="260">
          <template #default="{ row }">
            <div class="env">
              <span class="env-item" v-if="row.device_type">设备: {{ row.device_type }}</span>
              <span class="env-item" v-if="row.os">系统: {{ row.os }}</span>
              <span class="env-item" v-if="row.browser">浏览器: {{ row.browser }}</span>
              <span class="env-item" v-if="row.network">网络: {{ row.network }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-dialog v-model="detailDialogVisible" title="反馈详情" :width="isMobile ? '95%' : '700px'">
        <div class="dialog-section">
          <div class="dialog-row"><span class="label">ID</span><span class="value">{{ detailItem?.id }}</span></div>
          <div class="dialog-row"><span class="label">哈希</span><span class="value single-line">{{ detailItem?.hash }}</span></div>
          <div class="dialog-row"><span class="label">类型</span><span class="value">{{ typeLabel(detailItem?.type) }}</span></div>
          <div class="dialog-row"><span class="label">时间</span><span class="value">{{ formatTime(detailItem?.created_at) }}</span></div>
        </div>
        <el-form label-width="80px" label-position="left" class="mt-2">
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
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { getFeedbacks, deleteFeedbacks, updateFeedback, type Feedback } from '../../services/admin';
import { getEnvVars, setEnvVar } from '../../services/api';
import { ElMessageBox, ElMessage } from 'element-plus';

defineProps<{ embedded?: boolean }>();
const router = useRouter();
const goBack = () => router.push('/admin');

const items = ref<Feedback[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const selectedIds = ref<number[]>([]);
const isMobile = ref(window.innerWidth < 768);
const updateIsMobile = () => { isMobile.value = window.innerWidth < 768; };

const formatTime = (time?: string) => {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
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
.mb-4 { margin-bottom: 16px; }
.mb-2 { margin-bottom: 8px; }
.mt-3 { margin-top: 12px; }
.mt-2 { margin-top: 8px; }
.pagination-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: nowrap; }
.page-total { white-space: nowrap; }
.pagination-bar :deep(.el-pagination) { display: inline-flex; }
.env { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--el-text-color-secondary); }
.single-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.contact { font-size: 12px; color: var(--el-text-color-secondary); }
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
.dialog-text { white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.6; }
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
