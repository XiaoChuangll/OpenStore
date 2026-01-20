<template>
  <div class="music-apis-admin">
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="importMonitors">导入接口</el-button>
      <el-button type="primary" @click="checkAll" :loading="checking">一键检测</el-button>
      <el-button type="success" @click="openDialog()">添加接口</el-button>
    </div>

    <el-table :data="apis" style="width: 100%" stripe v-loading="loading">
      <el-table-column prop="name" label="名称" :width="isMobile ? '' : 150" :min-width="isMobile ? 120 : ''" />
      <el-table-column v-if="!isMobile" prop="url" label="API URL" min-width="250">
        <template #default="{ row }">
          <a :href="row.url" target="_blank" class="link">{{ row.url }}</a>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" :width="isMobile ? 80 : 100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="latency" label="延迟" :width="isMobile ? 80 : 100">
        <template #default="{ row }">
          <span :class="getLatencyClass(row.latency)">{{ row.latency }}ms</span>
        </template>
      </el-table-column>
      <el-table-column prop="enabled" label="启用" :width="isMobile ? 70 : 80">
        <template #default="{ row }">
          <el-switch
            v-model="row.enabled"
            :active-value="1"
            :inactive-value="0"
            @change="handleStatusChange(row)"
            :size="isMobile ? 'small' : 'default'"
          />
        </template>
      </el-table-column>
      <el-table-column v-if="!isMobile" label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="checkApi(row)" :loading="row.checking" class="action-btn">{{ row.checking ? '' : '检测' }}</el-button>
          <el-button size="small" type="primary" @click="openDialog(row)" class="action-btn">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)" class="action-btn">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑接口' : '添加接口'"
      width="500px"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="例如：自建 API 1" />
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="form.url" placeholder="http://example.com:3000" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type">
            <el-option label="NeteaseCloudMusicApi" value="netease" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.enabled"
            :active-value="1"
            :inactive-value="0"
            active-text="启用"
            inactive-text="禁用"
          />
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
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import {
  getAdminMusicApis,
  createMusicApi,
  updateMusicApi,
  deleteMusicApi,
  checkMusicApi,
} from "../../services/admin";
import { getMonitors } from "../../services/api";

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };

onMounted(() => {
  window.addEventListener('resize', checkMobile);
  loadData();
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

const apis = ref<any[]>([]);
const loading = ref(false);
const checking = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);

const form = ref({
  id: 0,
  name: '',
  url: '',
  type: 'netease',
  enabled: 1
});

const loadData = async () => {
  loading.value = true;
  try {
    apis.value = await getAdminMusicApis();
  } catch (error) {
    ElMessage.error('加载失败');
  } finally {
    loading.value = false;
  }
};

const getStatusType = (status: string) => {
  if (status === 'active') return 'success';
  if (status === 'error') return 'danger';
  return 'info';
};

const getLatencyClass = (latency: number) => {
  if (latency === 0) return 'text-gray';
  if (latency < 200) return 'text-success';
  if (latency < 500) return 'text-warning';
  return 'text-danger';
};

const openDialog = (row?: any) => {
  if (row) {
    isEdit.value = true;
    form.value = { ...row };
  } else {
    isEdit.value = false;
    form.value = {
      id: 0,
      name: '',
      url: '',
      type: 'netease',
      enabled: 1
    };
  }
  dialogVisible.value = true;
};

const submitForm = async () => {
  if (!form.value.name || !form.value.url) {
    ElMessage.warning('请填写完整信息');
    return;
  }

  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateMusicApi(form.value.id, form.value);
      ElMessage.success('更新成功');
    } else {
      await createMusicApi(form.value);
      ElMessage.success('添加成功');
    }
    dialogVisible.value = false;
    loadData();
  } catch (error) {
    ElMessage.error('操作失败');
  } finally {
    submitting.value = false;
  }
};

const handleDelete = (row: any) => {
  ElMessageBox.confirm('确定要删除该接口吗？', '警告', {
    type: 'warning'
  }).then(async () => {
    try {
      await deleteMusicApi(row.id);
      ElMessage.success('删除成功');
      loadData();
    } catch (error) {
      ElMessage.error('删除失败');
    }
  });
};

const handleStatusChange = async (row: any) => {
  try {
    await updateMusicApi(row.id, { enabled: row.enabled });
    ElMessage.success('状态已更新');
  } catch (error) {
    row.enabled = row.enabled === 1 ? 0 : 1; // revert
    ElMessage.error('更新失败');
  }
};

const checkApi = async (row: any) => {
  row.checking = true;
  try {
    const result = await checkMusicApi(row.id);
    row.status = result.status;
    row.latency = result.latency;
    ElMessage.success('检测完成');
  } catch (error) {
    ElMessage.error('检测失败');
  } finally {
    row.checking = false;
  }
};

const checkAll = async () => {
  checking.value = true;
  try {
    const res = await checkMusicApi();
    // Update local data
    if (res && res.results) {
        res.results.forEach((r: any) => {
        const item = apis.value.find(a => a.id === r.id);
        if (item) {
            item.status = r.status;
            item.latency = r.latency;
        }
        });
    }
    ElMessage.success('批量检测完成');
  } catch (error) {
    ElMessage.error('检测失败');
  } finally {
    checking.value = false;
  }
};

const importMonitors = async () => {
  try {
    const monitors = await getMonitors();
    if (!monitors || monitors.length === 0) {
      ElMessage.warning('未找到监测接口');
      return;
    }

    let count = 0;
    for (const monitor of monitors) {
      // Check for duplicates based on URL
      const exists = apis.value.some(api => api.url === monitor.url);
      if (!exists) {
        await createMusicApi({
          name: monitor.friendly_name,
          url: monitor.url,
          type: 'netease',
          enabled: 1
        });
        count++;
      }
    }
    
    if (count > 0) {
      ElMessage.success(`成功导入 ${count} 个接口`);
      loadData();
    } else {
      ElMessage.info('所有接口已存在，无新接口导入');
    }
  } catch (error) {
    console.error(error);
    ElMessage.error('导入失败，请检查网络或配置');
  }
};


</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.text-gray { color: #909399; }
.text-success { color: #67c23a; }
.text-warning { color: #e6a23c; }
.text-danger { color: #f56c6c; }
.action-btn { width: 50px; padding: 5px 0; text-align: center; }
</style>
