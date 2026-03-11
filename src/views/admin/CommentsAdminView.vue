<template>
  <div class="comments-admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 评论管理 </span>
      </template>
    </el-page-header>

    <el-card>
      <div class="toolbar mb-3">
        <el-select v-model="statusFilter" placeholder="状态筛选" clearable style="width: 140px" @change="fetchList">
          <el-option label="全部" value="" />
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="垃圾评论" value="spam" />
          <el-option label="回收站" value="trash" />
        </el-select>
        <el-select v-model="blogFilter" placeholder="所属文章" clearable filterable style="width: 200px" @change="fetchList">
          <el-option v-for="b in blogs" :key="b.id" :label="b.title" :value="b.id" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="fetchList">刷新</el-button>
        <el-button type="danger" :disabled="selectedIds.length === 0" @click="batchDelete">批量删除</el-button>
        <el-dropdown split-button type="primary" @click="handleBatchStatus('approved')" @button-click="handleBatchStatusDropdown">
          批量审核
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleBatchStatus('approved')">通过</el-dropdown-item>
              <el-dropdown-item @click="handleBatchStatus('pending')">待审核</el-dropdown-item>
              <el-dropdown-item @click="handleBatchStatus('spam')">标记垃圾</el-dropdown-item>
              <el-dropdown-item @click="handleBatchStatus('trash')">移至回收站</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <el-table :data="items" v-loading="loading" stripe @selection-change="onSelectionChange" @cell-click="onCellClick">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="nickname" label="昵称" width="120">
          <template #default="{ row }">
            <div class="single-line">{{ row.nickname }}</div>
          </template>
        </el-table-column>
        <el-table-column label="邮箱" width="160">
          <template #default="{ row }">
            <div class="single-line">{{ row.email || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="200">
          <template #default="{ row }">
            <div class="comment-content single-line">{{ row.content }}</div>
          </template>
        </el-table-column>
        <el-table-column label="所属文章" min-width="150">
          <template #default="{ row }">
            <div class="single-line" v-if="row.blog_title">{{ row.blog_title }}</div>
            <div class="single-line text-muted" v-else>ID: {{ row.blog_id }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip_address" label="IP" width="130">
          <template #default="{ row }">
            <div class="single-line">{{ row.ip_address || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" @click.stop="editRow(row)">编辑</el-button>
            <el-button size="small" type="danger" @click.stop="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="dialogVisible" :title="dialogTitle" :width="isMobile ? '95%' : '600px'">
        <el-form :model="form" label-width="80px">
          <el-form-item label="昵称">
            <el-input v-model="form.nickname" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="form.status" placeholder="请选择">
              <el-option label="待审核" value="pending" />
              <el-option label="已通过" value="approved" />
              <el-option label="垃圾评论" value="spam" />
              <el-option label="回收站" value="trash" />
            </el-select>
          </el-form-item>
          <el-form-item label="内容">
            <el-input v-model="form.content" type="textarea" :rows="4" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
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
import { ElMessageBox, ElMessage } from 'element-plus';
import { getComments, updateComment, deleteComment, deleteComments, updateCommentsStatus, getCommentBlogs, type Comment } from '../../services/admin';

defineProps<{ embedded?: boolean }>();
const router = useRouter();
const goBack = () => router.push('/admin');

const items = ref<Comment[]>([]);
const blogs = ref<{ id: number; title: string }[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const selectedIds = ref<number[]>([]);
const isMobile = ref(window.innerWidth < 768);
const updateIsMobile = () => { isMobile.value = window.innerWidth < 768; };

const statusFilter = ref('');
const blogFilter = ref<number | undefined>(undefined);

const formatTime = (time?: string) => {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

const statusTagType = (status?: string) => {
  switch (status) {
    case 'approved': return 'success';
    case 'pending': return 'warning';
    case 'spam': return 'danger';
    case 'trash': return 'info';
    default: return '';
  }
};

const statusLabel = (status?: string) => {
  switch (status) {
    case 'approved': return '已通过';
    case 'pending': return '待审核';
    case 'spam': return '垃圾评论';
    case 'trash': return '回收站';
    default: return status || '';
  }
};

const fetchBlogs = async () => {
  try {
    blogs.value = await getCommentBlogs();
  } catch (e) {
    console.error('Failed to fetch blogs:', e);
  }
};

const fetchList = async () => {
  loading.value = true;
  try {
    const query: Record<string, any> = {};
    if (statusFilter.value) query.status = statusFilter.value;
    if (blogFilter.value) query.blog_id = blogFilter.value;
    const data = await getComments(page.value, pageSize.value, query);
    items.value = data.items || [];
    total.value = data.total || 0;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '获取评论列表失败');
  } finally {
    loading.value = false;
  }
};

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};

const onSelectionChange = (rows: Comment[]) => {
  selectedIds.value = rows.map(r => r.id);
};

const dialogVisible = ref(false);
const dialogTitle = ref('编辑评论');
const saving = ref(false);
const editingId = ref<number | null>(null);
const form = ref({
  nickname: '',
  email: '',
  status: 'pending',
  content: ''
});

const onCellClick = (row: Comment) => {
  editRow(row);
};

const editRow = (row: Comment) => {
  editingId.value = row.id;
  form.value = {
    nickname: row.nickname || '',
    email: row.email || '',
    status: row.status || 'pending',
    content: row.content || ''
  };
  dialogTitle.value = '编辑评论';
  dialogVisible.value = true;
};

const save = async () => {
  if (!editingId.value) return;
  saving.value = true;
  try {
    await updateComment(editingId.value, {
      nickname: form.value.nickname,
      email: form.value.email || undefined,
      status: form.value.status,
      content: form.value.content
    });
    ElMessage.success('评论已更新');
    dialogVisible.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '更新失败');
  } finally {
    saving.value = false;
  }
};

const remove = async (row: Comment) => {
  try {
    await ElMessageBox.confirm(`确认删除该评论吗？`, '提示', { type: 'warning' });
    await deleteComment(row.id);
    ElMessage.success('评论已删除');
    fetchList();
  } catch (e) {
  }
};

const batchDelete = async () => {
  if (selectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(`确认删除选中的 ${selectedIds.value.length} 条评论？`, '提示', { type: 'warning' });
    const res = await deleteComments(selectedIds.value);
    ElMessage.success(`已删除 ${res.deleted} 条`);
    selectedIds.value = [];
    fetchList();
  } catch (e) {
  }
};

const handleBatchStatus = async (status: string) => {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先选择要操作的评论');
    return;
  }
  try {
    const res = await updateCommentsStatus(selectedIds.value, status);
    ElMessage.success(`已更新 ${res.updated} 条评论状态`);
    selectedIds.value = [];
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '操作失败');
  }
};

const handleBatchStatusDropdown = () => {
};

onMounted(() => {
  fetchList();
  fetchBlogs();
  window.addEventListener('resize', updateIsMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile);
});
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mb-3 { margin-bottom: 12px; }
.mt-3 { margin-top: 12px; }
.pagination-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: nowrap; }
.single-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.comment-content { max-width: 300px; }
.text-muted { color: var(--el-text-color-secondary); }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mobile-pagination-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 12px;
}
.mobile-pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
