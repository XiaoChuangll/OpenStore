<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 首页卡片配置 </span>
      </template>
    </el-page-header>

    <el-card class="mb-4">
      <div class="card-header">
        <h3>卡片列表</h3>
        <el-button type="primary" size="small" @click="fetchList">刷新</el-button>
      </div>
      <el-table :data="items" stripe row-key="id">
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="key" label="标识 (Key)" width="150" />
        <el-table-column prop="sort_order" label="排序权重" width="120" sortable label-class-name="sort-icon-right" />
        <el-table-column label="启用状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabledBoolean"
              @change="toggleEnabled(row)"
              :loading="row.loading"
            />
          </template>
        </el-table-column>
        <el-table-column v-if="!isMobile" label="样式配置" min-width="200">
          <template #default="{ row }">
            <el-tag size="small" class="mr-2">宽度: {{ getStyle(row).span === 24 ? '全宽 (24)' : '半宽 (12)' }}</el-tag>
            <el-tag 
              size="small" 
              :type="getAccentType(getStyle(row).accent)"
              :class="{ 'tag-purple': getStyle(row).accent === 'bg-purple' }"
            >
              {{ getStyle(row).accent }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" @click="editRow(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDialog" title="编辑卡片" :width="isMobile ? '90%' : '500px'">
      <el-form :model="form" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="标题">
          <el-input v-model="form.title" />
        </el-form-item>
        <el-form-item label="排序权重">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabledBoolean" />
        </el-form-item>
        <el-form-item label="宽度 (Span)">
          <el-select v-model="formStyle.span">
            <el-option label="半宽 (12)" :value="12" />
            <el-option label="全宽 (24)" :value="24" />
          </el-select>
        </el-form-item>
        <el-form-item label="装饰色">
          <el-select v-model="formStyle.accent">
            <el-option label="黄色 (Yellow)" value="bg-yellow" />
            <el-option label="绿色 (Green)" value="bg-green" />
            <el-option label="蓝色 (Blue)" value="bg-blue" />
            <el-option label="红色 (Red)" value="bg-red" />
            <el-option label="紫色 (Purple)" value="bg-purple" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" @click="save" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { getSiteCards, updateSiteCard, type SiteCard } from '../../services/admin';
import { ElMessage } from 'element-plus';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<(SiteCard & { enabledBoolean: boolean; loading: boolean })[]>([]);
const showDialog = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);

const isMobile = ref(window.innerWidth < 768);
const checkMobile = () => { isMobile.value = window.innerWidth < 768; };
onMounted(() => {
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

const form = ref({
  title: '',
  sort_order: 0,
  enabledBoolean: true
});
const formStyle = ref({
  span: 24,
  accent: 'bg-yellow'
});

const fetchList = async () => {
  try {
    const data = await getSiteCards();
    items.value = data.map(i => ({
      ...i,
      enabledBoolean: i.enabled === 1,
      loading: false
    }));
  } catch (e: any) {
    ElMessage.error(e?.message || '加载失败');
  }
};

onMounted(fetchList);

const getStyle = (row: SiteCard) => {
  try {
    return JSON.parse(row.style || '{}');
  } catch {
    return {};
  }
};

const getAccentType = (accent: string) => {
  if (accent === 'bg-green') return 'success';
  if (accent === 'bg-red') return 'danger';
  if (accent === 'bg-yellow') return 'warning';
  if (accent === 'bg-blue') return ''; // Use default primary color (blue)
  return 'info';
};

const toggleEnabled = async (row: any) => {
  row.loading = true;
  try {
    await updateSiteCard(row.id, { enabled: row.enabledBoolean ? 1 : 0 });
    ElMessage.success('状态更新成功');
  } catch (e: any) {
    row.enabledBoolean = !row.enabledBoolean; // Revert
    ElMessage.error(e?.message || '更新失败');
  } finally {
    row.loading = false;
  }
};

const editRow = (row: SiteCard) => {
  editingId.value = row.id;
  form.value = {
    title: row.title,
    sort_order: row.sort_order,
    enabledBoolean: row.enabled === 1
  };
  const style = getStyle(row);
  formStyle.value = {
    span: style.span || 24,
    accent: style.accent || 'bg-yellow'
  };
  showDialog.value = true;
};

const save = async () => {
  if (!editingId.value) return;
  saving.value = true;
  try {
    const styleJson = JSON.stringify(formStyle.value);
    await updateSiteCard(editingId.value, {
      title: form.value.title,
      sort_order: form.value.sort_order,
      enabled: form.value.enabledBoolean ? 1 : 0,
      style: styleJson
    });
    ElMessage.success('保存成功');
    showDialog.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const goBack = () => router.push('/');
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
.mr-2 { margin-right: 8px; }

:deep(.sort-icon-right .cell) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tag-purple {
  background-color: #ede9fe;
  border-color: #ddd6fe;
  color: #7c3aed;
}

html.dark .tag-purple {
  background-color: #2e1065;
  border-color: #5b21b6;
  color: #a78bfa;
}
</style>
