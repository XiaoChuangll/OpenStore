<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 故障与维护管理 </span>
      </template>
      <template #extra>
        <el-button type="primary" @click="handleCreate">发布新故障/维护</el-button>
      </template>
    </el-page-header>

    <div v-else class="mb-4 text-right">
       <el-button type="primary" @click="handleCreate">发布新故障/维护</el-button>
    </div>

    <el-table :data="items" style="width: 100%" stripe v-loading="loading">
      <el-table-column prop="title" label="标题" min-width="200" />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.type === 'maintenance' ? 'info' : 'danger'">
            {{ row.type === 'maintenance' ? '维护' : '故障' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="start_time" label="开始时间" width="170">
        <template #default="{ row }">
          {{ row.start_time ? new Date(row.start_time * 1000).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="end_time" label="结束时间" width="170">
        <template #default="{ row }">
          {{ row.end_time ? new Date(row.end_time * 1000).toLocaleString() : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑' : '发布'"
      :width="isMobile ? '90%' : '600px'"
      :fullscreen="isMobile"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="类型" prop="type">
          <el-radio-group v-model="form.type" :size="isMobile ? 'small' : 'default'">
            <el-radio-button label="incident">故障报告</el-radio-button>
            <el-radio-button label="maintenance">计划维护</el-radio-button>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="例如：数据库连接异常" />
        </el-form-item>
        
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="正在调查 (Investigating)" value="investigating" />
            <el-option label="已确认 (Identified)" value="identified" />
            <el-option label="正在观察 (Monitoring)" value="monitoring" />
            <el-option label="已解决 (Resolved)" value="resolved" />
            <el-option label="已计划 (Scheduled)" value="scheduled" />
          </el-select>
        </el-form-item>

        <el-form-item label="开始时间" prop="start_time">
          <el-date-picker v-model="form.start_time" type="datetime" placeholder="选择开始时间" value-format="X" style="width: 100%" />
        </el-form-item>

        <el-form-item label="结束时间" prop="end_time" v-if="form.type === 'maintenance'">
          <el-date-picker v-model="form.end_time" type="datetime" placeholder="预计结束时间" value-format="X" style="width: 100%" />
        </el-form-item>

        <el-form-item label="详细说明" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="支持 Markdown (可选)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm" :loading="submitting">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getIncidents, createIncident, updateIncident, deleteIncident, type Incident } from '../../services/admin';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useWindowSize } from '@vueuse/core';

const { width } = useWindowSize();
const isMobile = computed(() => width.value < 768);

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;
const router = useRouter();

const items = ref<Incident[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const submitting = ref(false);
const isEdit = ref(false);
const formRef = ref();

const form = reactive({
  id: 0,
  title: '',
  content: '',
  status: 'investigating',
  type: 'incident',
  start_time: Math.floor(Date.now() / 1000),
  end_time: undefined as number | undefined
});

const rules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }]
};

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

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    investigating: '正在调查',
    identified: '已确认',
    monitoring: '正在观察',
    resolved: '已解决',
    scheduled: '已计划'
  };
  return map[status] || status;
};

const goBack = () => {
  router.push('/admin');
};

const handleCreate = () => {
  isEdit.value = false;
  form.id = 0;
  form.title = '';
  form.content = '';
  form.status = 'investigating';
  form.type = 'incident';
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
  form.start_time = row.start_time || Math.floor(Date.now() / 1000);
  form.end_time = row.end_time;
  dialogVisible.value = true;
};

const handleDelete = async (row: Incident) => {
  try {
    await ElMessageBox.confirm('确定要删除这条记录吗？', '警告', {
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
    if (valid) {
      submitting.value = true;
      try {
        const payload = {
          title: form.title,
          content: form.content,
          status: form.status as any,
          type: form.type as any,
          start_time: form.start_time,
          end_time: form.end_time
        };
        if (isEdit.value) {
          await updateIncident(form.id, payload);
        } else {
          await createIncident(payload);
        }
        ElMessage.success(isEdit.value ? '更新成功' : '发布成功');
        dialogVisible.value = false;
        fetchList();
      } catch (e) {
        ElMessage.error('操作失败');
      } finally {
        submitting.value = false;
      }
    }
  });
};

onMounted(() => {
  fetchList();
});
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.text-right { text-align: right; }
</style>