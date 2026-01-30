<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 系统日志 </span>
      </template>
    </el-page-header>

    <div class="filter-toolbar mb-4">
      <div style="flex: 1"></div>
      <el-button 
        type="danger" 
        :icon="Delete" 
        :disabled="selectedIds.length === 0" 
        @click="handleDelete"
      >
        批量删除
      </el-button>
      <el-button type="danger" plain @click="handleClearAll">清空所有日志</el-button>
    </div>

    <el-table 
      :data="items" 
      style="width: 100%" 
      stripe 
      v-loading="loading"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" />
      <el-table-column prop="created_at" label="时间" width="180" :formatter="formatTime" />
      <el-table-column prop="actor" label="操作人" width="120" />
      <el-table-column prop="action" label="动作" width="150" />
      <el-table-column prop="entity" label="对象" width="120" />
      <el-table-column prop="entity_id" label="对象ID" width="100" />
      <el-table-column prop="payload" label="详情" show-overflow-tooltip />
    </el-table>

    <div class="pagination">
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { getSystemLogs, deleteSystemLogs, type SystemLog } from '../../services/admin';
import { onWS } from '../../services/ws';
import { Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<SystemLog[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const selectedIds = ref<number[]>([]);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
onMounted(() => {
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

const fetchList = async () => {
  loading.value = true;
  try {
    const data = await getSystemLogs(page.value, pageSize.value);
    items.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
};

const handleSelectionChange = (selection: SystemLog[]) => {
  selectedIds.value = selection.map(item => item.id);
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
    fetchList();
    selectedIds.value = [];
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

const formatTime = (_: any, __: any, cellValue: string) => {
  try {
    // If string is already UTC/ISO, just format it
    // SQLite might store "2023-10-27 10:00:00" without Z.
    // If backend returns it as is, browser might treat as local or UTC.
    // Usually "YYYY-MM-DD HH:mm:ss" in SQLite is UTC if we use CURRENT_TIMESTAMP.
    // But let's assume it's UTC.
    const s = cellValue;
    const iso = s.includes('T') ? (s.endsWith('Z') ? s : s + 'Z') : s.replace(' ', 'T') + 'Z';
    const date = new Date(iso);
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch {
    return cellValue;
  }
};

const goBack = () => {
  router.push('/admin');
};

onMounted(() => {
  fetchList();
  onWS((msg: any) => {
    if (msg.type === 'logs:new') {
      // If we are on the first page, prepend the new log or refresh
      // Prepending is smoother
      if (page.value === 1) {
        items.value.unshift(msg.payload);
        total.value++;
        if (items.value.length > pageSize.value) {
          items.value.pop();
        }
      } else {
        // Just increment total so user knows there are new logs? 
        // Or do nothing, or maybe show a "New logs available" badge.
        // For simplicity, let's just update total if we could, but fetching total requires API.
        // We can just set a flag or let it be.
        // If user navigates to page 1, fetchList will run.
      }
    }
  });
});
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.pagination { margin-top: 20px; display: flex; justify-content: flex-end; }
.filter-toolbar { display: flex; gap: 10px; }
.filter-toolbar.is-mobile { flex-wrap: wrap; }
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
  .pagination {
    justify-content: center;
    padding: 10px 0;
  }
}
</style>
