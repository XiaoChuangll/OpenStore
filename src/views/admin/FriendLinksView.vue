<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 友情链接管理 </span>
      </template>
    </el-page-header>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增链接</el-button>
      <el-button :disabled="selectedIds.length===0" @click="batchEnable(true)">批量启用</el-button>
      <el-button :disabled="selectedIds.length===0" @click="batchEnable(false)">批量禁用</el-button>
      <el-button type="danger" :disabled="selectedIds.length===0" @click="batchDelete">批量删除</el-button>
    </div>

    <el-table :data="items" @selection-change="onSelectionChange" style="width: 100%" stripe>
      <el-table-column type="selection" width="55" />
      <el-table-column label="图标" :width="isMobile ? 60 : 80">
        <template #default="{ row }">
          <img :src="linkIcon(row)" class="icon-preview" alt="icon" loading="lazy" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" />
      <el-table-column v-if="!isMobile" prop="url" label="URL" show-overflow-tooltip />
      <el-table-column v-if="!isMobile" prop="weight" label="排序权重" width="120" />
      <el-table-column label="状态" :width="isMobile ? 80 : 120">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" :width="isMobile ? 140 : 220">
        <template #default="{ row }">
          <el-button size="small" @click="editRow(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        background
        layout="prev, pager, next"
        :page-size="pageSize"
        :total="total"
        :current-page="page"
        @current-change="onPageChange"
      />
    </div>

    <el-dialog v-model="showDialog" :title="dialogTitle" :width="isMobile ? '90%' : '500px'">
      <el-form :model="form" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="form.url" /></el-form-item>
        <el-form-item label="图标URL">
          <el-input v-model="form.icon_url" />
        </el-form-item>
        <el-form-item v-if="form.icon_url && form.icon_url.trim()" label="预览">
          <img :src="form.icon_url" class="icon-preview" alt="preview" loading="lazy" />
        </el-form-item>
        <el-form-item label="排序权重"><el-input-number v-model="form.weight" :min="0" /></el-form-item>
        <el-form-item label="显示状态">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
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
import { useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { getFriendLinks, createFriendLink, updateFriendLink, deleteFriendLink, batchFriendLinks, type FriendLink } from '../../services/admin';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<FriendLink[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const selectedIds = ref<number[]>([]);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
onMounted(() => {
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

const showDialog = ref(false);
const dialogTitle = ref('新增链接');
const editingId = ref<number | null>(null);
const form = ref<{ name: string; url: string; icon_url: string; weight: number; enabled: number }>({ name: '', url: '', icon_url: '', weight: 0, enabled: 1 });

const fetchList = async () => {
  const data = await getFriendLinks(page.value, pageSize.value);
  items.value = data.items;
  total.value = data.total;
};

onMounted(fetchList);

const favicon = (url: string) => {
  try { const u = new URL(url); return `${u.origin}/favicon.ico`; } catch { return '/favicon.ico'; }
};

const linkIcon = (row: FriendLink) => {
  const u = typeof row.icon_url === 'string' ? row.icon_url.trim() : '';
  return u || favicon(row.url);
};

const onSelectionChange = (rows: FriendLink[]) => {
  selectedIds.value = rows.map(r => r.id);
};

const openCreate = () => {
  dialogTitle.value = '新增链接';
  editingId.value = null;
  form.value = { name: '', url: '', icon_url: '', weight: 0, enabled: 1 };
  showDialog.value = true;
};
const editRow = (row: FriendLink) => {
  dialogTitle.value = '编辑链接';
  editingId.value = row.id;
  form.value = { name: row.name, url: row.url, icon_url: row.icon_url || '', weight: row.weight, enabled: row.enabled };
  showDialog.value = true;
};
const save = async () => {
  if (!form.value.name || !form.value.url) return;
  if (editingId.value) {
    await updateFriendLink(editingId.value, form.value);
  } else {
    await createFriendLink(form.value);
  }
  showDialog.value = false;
  fetchList();
};
const remove = async (row: FriendLink) => {
  await deleteFriendLink(row.id);
  fetchList();
};
const batchEnable = async (enable: boolean) => {
  if (selectedIds.value.length === 0) return;
  await batchFriendLinks(selectedIds.value, enable ? 'enable' : 'disable');
  fetchList();
};
const batchDelete = async () => {
  if (selectedIds.value.length === 0) return;
  await batchFriendLinks(selectedIds.value, 'delete');
  fetchList();
};
const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};
const goBack = () => router.push('/');
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.pagination { display: flex; justify-content: flex-end; margin-top: 12px; }
.icon-preview { width: 24px; height: 24px; border-radius: 6px; object-fit: contain; }
</style>
