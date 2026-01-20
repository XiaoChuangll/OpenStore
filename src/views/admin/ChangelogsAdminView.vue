<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 更新日志管理 </span>
      </template>
    </el-page-header>

    <el-card class="mb-4">
      <div class="card-header"><h3>日志列表</h3><el-button type="primary" size="small" @click="openCreate">新增日志</el-button></div>
      <el-table :data="items" stripe>
        <el-table-column prop="version" label="版本" :width="isMobile ? 100 : 150" />
        <el-table-column prop="release_date" label="发布日期" :width="isMobile ? 160 : 180">
          <template #default="{ row }">
            {{ formatTime(row.release_date) }}
          </template>
        </el-table-column>
        
        <el-table-column v-if="isMobile" label="操作" min-width="140">
          <template #default="{ row }">
            <div style="display: flex; gap: 8px;">
              <el-button size="small" @click="editRow(row)">编辑</el-button>
              <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column v-if="!isMobile" prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        
        <el-table-column v-if="!isMobile" label="操作">
          <template #default="{ row }">
            <el-button size="small" @click="editRow(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="showDialog"
      :title="dialogTitle"
      :width="isMobile ? '100%' : '900px'"
      :fullscreen="isMobile"
      class="announcement-dialog"
    >
      <el-form
        :model="form"
        :label-position="isMobile ? 'top' : 'right'"
        :label-width="isMobile ? 'auto' : '100px'"
        class="announcement-form"
      >
        <el-row :gutter="20">
          <el-col :md="12" :xs="24">
            <el-form-item label="版本号">
              <el-input v-model="form.version" placeholder="例如: v1.0.0" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="发布日期">
              <el-date-picker 
                v-model="form.release_date" 
                type="datetime" 
                value-format="YYYY-MM-DD HH:mm:ss" 
                placeholder="选择发布时间" 
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          
          <el-col :span="24">
            <div class="editor-container">
              <div class="editor-section markdown-section">
                <div class="editor-label">内容编辑 (Markdown)</div>
                <el-row :gutter="16" class="markdown-row">
                  <el-col :xs="24" :md="12" class="markdown-col">
                    <div class="markdown-editor-wrapper">
                      <div class="sub-label">编辑区域</div>
                      <el-input 
                        type="textarea" 
                        v-model="contentMarkdown" 
                        class="markdown-editor"
                        placeholder="在此编写 Markdown 内容"
                        :autosize="{ minRows: 20, maxRows: 30 }"
                        resize="none"
                      />
                    </div>
                  </el-col>
                  <el-col :xs="24" :md="12" class="markdown-col">
                    <div class="markdown-preview-wrapper">
                      <div class="sub-label">预览区域</div>
                      <div class="md-preview markdown-body" v-html="markdownPreview" />
                    </div>
                  </el-col>
                </el-row>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showDialog=false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import { getChangelogs, createChangelog, updateChangelog, deleteChangelog } from '../../services/admin';
import { onWS } from '../../services/ws';
import type { Changelog } from '../../services/api';
import MarkdownIt from 'markdown-it';
import 'github-markdown-css';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();
const items = ref<Changelog[]>([]);
const showDialog = ref(false);
const dialogTitle = ref('新增日志');
const editingId = ref<number | null>(null);
const form = ref<Partial<Changelog>>({ version: '', release_date: '', content_html: '' });
const contentMarkdown = ref<string>('');

const getNowLocalString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true, // Support GFM line breaks
});

const markdownPreview = computed(() => md.render(contentMarkdown.value || ''));

const isMobile = ref(false);
const updateIsMobile = () => { isMobile.value = window.innerWidth <= 768; };
onMounted(() => { 
  updateIsMobile(); 
  window.addEventListener('resize', updateIsMobile);
  
  onWS((type, payload) => {
    if (type === 'changelogs:update') {
      items.value = payload;
    }
  });
});
onUnmounted(() => { window.removeEventListener('resize', updateIsMobile); });

const fetchList = async () => {
  items.value = await getChangelogs();
};

onMounted(fetchList);

const openCreate = () => {
  dialogTitle.value = '新增日志';
  editingId.value = null;
  form.value = { version: '', release_date: getNowLocalString(), content_html: '' };
  contentMarkdown.value = '';
  showDialog.value = true;
};

const editRow = (row: Changelog) => {
  dialogTitle.value = '编辑日志';
  editingId.value = row.id;
  form.value = { version: row.version, release_date: row.release_date || getNowLocalString() };
  contentMarkdown.value = row.content_markdown || '';
  showDialog.value = true;
};

const save = async () => {
  if (!form.value.version) { ElMessage.error('请输入版本号'); return; }
  try {
    form.value.content_markdown = contentMarkdown.value;
    form.value.content_html = md.render(contentMarkdown.value || '');
    
    if (editingId.value) {
      await updateChangelog(editingId.value, form.value);
      ElMessage.success('保存成功');
    } else {
      await createChangelog(form.value);
      ElMessage.success('创建成功');
    }
    showDialog.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  }
};

const remove = (row: Changelog) => {
  ElMessageBox.confirm('确认删除该日志？', '提示', { type: 'warning' })
    .then(async () => { await deleteChangelog(row.id); fetchList(); ElMessage.success('删除成功'); })
    .catch(() => {});
};

const formatTime = (time: string) => {
  if (!time) return '';
  return new Date(time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
};

const goBack = () => router.push('/');
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.card-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 16px; 
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 600; }

/* 复用 AnnouncementView 的编辑器样式 */
.announcement-dialog :deep(.el-dialog__body) { padding-top: 20px; padding-bottom: 10px; }
.announcement-form :deep(.el-form-item) { margin-bottom: 20px; }
.editor-container { background: var(--el-fill-color-light); border-radius: 6px; padding: 16px; margin-top: 8px; }
.editor-section { width: 100%; }
.editor-label { font-size: 14px; font-weight: 500; color: var(--el-text-color-primary); margin-bottom: 12px; }
.markdown-section { width: 100%; }
.markdown-row { margin-bottom: 0; }
.markdown-col { display: flex; flex-direction: column; height: 100%; }
.markdown-editor-wrapper, .markdown-preview-wrapper {
  display: flex; flex-direction: column; height: 100%;
  background: var(--el-bg-color); border-radius: 6px; overflow: hidden;
  border: 1px solid var(--el-border-color);
}
.sub-label {
  font-size: 12px; color: var(--el-text-color-secondary); padding: 8px 12px;
  background: var(--el-fill-color-lighter); border-bottom: 1px solid var(--el-border-color);
}
.markdown-editor { flex: 1; border: none; }
.markdown-editor :deep(.el-textarea__inner) {
  border: none; border-radius: 0; padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  font-size: 14px; line-height: 1.5; resize: none; min-height: 300px;
  background-color: var(--el-bg-color); color: var(--el-text-color-primary);
}
.md-preview {
  flex: 1; padding: 12px !important; overflow: auto; font-size: 14px;
  background-color: transparent !important;
}
@media (max-width: 768px) {
  .announcement-dialog { width: 95% !important; max-width: 100%; }
  .markdown-row { margin-left: 0 !important; margin-right: 0 !important; }
  .markdown-col { margin-bottom: 16px; }
  .markdown-col:last-child { margin-bottom: 0; }
  .markdown-editor :deep(.el-textarea__inner) { min-height: 220px; }
  .md-preview { min-height: 220px; }
}

/* Adapt GitHub Markdown to Element Plus Theme for Preview */
.markdown-body {
  background-color: transparent !important;
  color: var(--el-text-color-primary) !important;
  font-family: var(--el-font-family);
  font-size: 14px;
  line-height: 1.6;
}
:deep(.markdown-body a) { color: var(--el-color-primary); }
:deep(.markdown-body pre) { background-color: var(--el-fill-color) !important; }
:deep(.markdown-body code) { background-color: var(--el-fill-color-darker) !important; }
</style>
