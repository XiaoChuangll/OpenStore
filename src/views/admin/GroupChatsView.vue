<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 群聊自定义管理 </span>
      </template>
    </el-page-header>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增群聊</el-button>
    </div>

    <el-table :data="items" style="width: 100%" stripe>
      <el-table-column prop="name" label="名称" />
      <el-table-column v-if="!isMobile" prop="link" label="群聊链接" />
      <el-table-column label="头像" width="80">
        <template #default="{ row }">
          <img v-if="row.avatar_url" :src="row.avatar_url" class="avatar" alt="avatar" />
          <el-tag v-else type="info" size="small">无</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="70">
        <template #default="{ row }">
          <el-switch :model-value="row.enabled === 1" @update:model-value="(v: boolean) => toggleEnabled(row, v)" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="操作" :width="isMobile ? 120 : 220">
        <template #default="{ row }">
          <div :style="isMobile ? 'display: flex; flex-direction: column; gap: 4px;' : ''">
            <el-button size="small" @click="editRow(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)" :style="isMobile ? 'margin-left: 0' : ''">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showDialog" :title="dialogTitle" :width="isMobile ? '90%' : '500px'">
      <el-form :model="form" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="群聊链接"><el-input v-model="form.link" /></el-form-item>
        <el-form-item label="群聊头像">
          <div class="upload-row">
            <img v-if="form.avatar_url" :src="form.avatar_url" class="avatar" alt="avatar" />
            <el-input
              v-model="form.avatar_url"
              placeholder="输入头像URL或使用上传"
              clearable
              class="avatar-url-input"
            />
            <el-upload
              :auto-upload="true"
              :show-file-list="false"
              :http-request="onUpload"
              accept="image/*"
              :before-upload="beforeAvatarUpload"
            >
              <el-button>上传头像</el-button>
            </el-upload>
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
import { useRouter } from 'vue-router';
import { Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { getGroupChats, createGroupChat, updateGroupChat, deleteGroupChat, uploadFile, type GroupChat } from '../../services/admin';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<GroupChat[]>([]);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
onMounted(() => {
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

const showDialog = ref(false);
const dialogTitle = ref('新增群聊');
const editingId = ref<number | null>(null);
const form = ref<Partial<GroupChat>>({ name: '', link: '', avatar_url: '' });

const fetchList = async () => {
  items.value = await getGroupChats();
};
onMounted(fetchList);

const openCreate = () => {
  dialogTitle.value = '新增群聊';
  editingId.value = null;
  form.value = { name: '', link: '', avatar_url: '' };
  showDialog.value = true;
};
const editRow = (row: GroupChat) => {
  dialogTitle.value = '编辑群聊';
  editingId.value = row.id;
  form.value = { name: row.name, link: row.link, avatar_url: row.avatar_url };
  showDialog.value = true;
};
const save = async () => {
  if (!form.value.name) return;
  if (editingId.value) {
    await updateGroupChat(editingId.value, form.value);
  } else {
    await createGroupChat(form.value);
  }
  showDialog.value = false;
  fetchList();
};
const remove = async (row: GroupChat) => {
  await deleteGroupChat(row.id);
  fetchList();
};

const toggleEnabled = async (row: GroupChat, v: boolean) => {
  const prev = row.enabled;
  const next = v ? 1 : 0;
  row.enabled = next;
  try {
    await updateGroupChat(row.id, { enabled: next });
    fetchList();
  } catch (e: any) {
    row.enabled = prev;
    ElMessage.error(e?.response?.data?.error || '切换失败');
  }
};

const onUpload = async (opts: any) => {
  const file: File = opts.file as File;
  const res = await uploadFile(file);
  form.value.avatar_url = res.url;
  opts.onSuccess({}, file);
};

const beforeAvatarUpload = (rawFile: File) => {
  if (rawFile.type !== 'image/jpeg' && rawFile.type !== 'image/png' && rawFile.type !== 'image/webp') {
    ElMessage.error('Avatar picture must be JPG/PNG/WEBP format!');
    return false;
  } else if (rawFile.size / 1024 / 1024 > 2) {
    ElMessage.error('Avatar picture size can not exceed 2MB!');
    return false;
  }
  return true;
};

const goBack = () => router.push('/');
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.upload-row { display: flex; align-items: center; gap: 12px; }
.avatar-url-input { max-width: 280px; }
</style>
