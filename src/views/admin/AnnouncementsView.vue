<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 公告管理 </span>
      </template>
    </el-page-header>

    <el-row :gutter="20">
      <el-col :md="8" :xs="24">
        <el-card class="mb-4">
          <div class="card-header"><h3>公告分类</h3><el-button size="small" @click="openCreateCategory">新增分类</el-button></div>
          <el-table :data="categories" :height="categoryTableHeight">
            <el-table-column prop="name" label="名称" />
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button size="small" @click="editCategory(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="removeCategory(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :md="16" :xs="24">
        <el-card class="mb-4">
          <div class="card-header"><h3>公告列表</h3><el-button type="primary" size="small" @click="openCreate">新增公告</el-button></div>
          <div class="toolbar">
            <el-select v-model="status" placeholder="状态过滤" style="width: 160px" @change="fetchList">
              <el-option label="全部" value="" />
              <el-option label="草稿" value="draft" />
              <el-option label="已发布" value="published" />
              <el-option label="已下线" value="offline" />
            </el-select>
          </div>
          <el-table :data="items" stripe>
            <el-table-column prop="title" label="标题" />
            <el-table-column prop="status" label="状态" width="100" />
            
            <!-- Mobile: Actions before Scheduled At -->
            <el-table-column v-if="isMobile" label="操作" width="260">
              <template #default="{ row }">
                <el-button size="small" @click="editRow(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
                <el-button size="small" type="success" v-if="row.status!=='published'" @click="publish(row)">发布</el-button>
                <el-button size="small" type="warning" v-if="row.status==='published'" @click="offline(row)">下线</el-button>
              </template>
            </el-table-column>
            
            <el-table-column prop="scheduled_at" label="定时发布" width="180" />
            
            <!-- Desktop: Actions after Scheduled At -->
            <el-table-column v-if="!isMobile" label="操作" width="260">
              <template #default="{ row }">
                <el-button size="small" @click="editRow(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
                <el-button size="small" type="success" v-if="row.status!=='published'" @click="publish(row)">发布</el-button>
                <el-button size="small" type="warning" v-if="row.status==='published'" @click="offline(row)">下线</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination">
            <el-pagination background layout="prev, pager, next" :page-size="pageSize" :total="total" :current-page="page" @current-change="onPageChange" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 公告编辑对话框 -->
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
          <el-col :span="24">
            <el-form-item label="标题">
              <el-input v-model="form.title" placeholder="请输入公告标题" />
            </el-form-item>
          </el-col>
          
          <el-col :md="12" :xs="24">
            <el-form-item label="分类">
              <el-select v-model="form.category_id" placeholder="选择分类" style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          
          <el-col :md="12" :xs="24">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
                <el-option label="已下线" value="offline" />
              </el-select>
            </el-form-item>
          </el-col>
          
          <el-col :span="24">
            <el-form-item label="定时发布">
              <el-date-picker 
                v-model="scheduled" 
                type="datetime" 
                value-format="YYYY-MM-DD HH:mm:ss" 
                placeholder="选择定时发布时间（可选）" 
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          
          <el-col :span="24">
            <el-form-item label="编辑模式">
              <el-radio-group v-model="markdownMode" @change="handleModeChange">
                <el-radio :label="false">富文本编辑器</el-radio>
                <el-radio :label="true">Markdown</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          
          <el-col :span="24">
            <div class="editor-container">
              <!-- 富文本编辑器 -->
              <div v-if="!markdownMode" class="editor-section">
                <div class="editor-label">公告内容</div>
                <div class="quill-wrapper">
                  <QuillEditor 
                    v-model:content="form.content_html" 
                    contentType="html" 
                    theme="snow" 
                    class="quill-editor"
                    :options="quillOptions"
                  />
                </div>
              </div>
              
              <!-- Markdown编辑器 -->
              <div v-else class="editor-section markdown-section">
                <div class="editor-label">Markdown编辑</div>
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

    <!-- 分类编辑对话框 -->
    <el-dialog v-model="showCatDialog" :title="catDialogTitle" :width="isMobile ? '90%' : '500px'">
      <el-form :model="catForm" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="名称"><el-input v-model="catForm.name" /></el-form-item>
        <el-form-item label="父分类">
          <el-select v-model="catForm.parent_id" clearable>
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCatDialog=false">取消</el-button>
        <el-button type="primary" @click="saveCategory">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter } from 'vue-router';
import { getAnnouncementCategories, createAnnouncementCategory, updateAnnouncementCategory, deleteAnnouncementCategory, getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, publishAnnouncement, offlineAnnouncement, type AnnouncementCategory, type Announcement } from '../../services/admin';
import MarkdownIt from 'markdown-it';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;

const router = useRouter();

const categories = ref<AnnouncementCategory[]>([]);
const items = ref<Announcement[]>([]);
const status = ref<string>('');
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const showDialog = ref(false);
const dialogTitle = ref('新增公告');
const editingId = ref<number | null>(null);
const scheduled = ref<string | null>(null);
const form = ref<Partial<Announcement>>({ title: '', content_html: '', status: 'draft', category_id: null, scheduled_at: null });
const markdownMode = ref<boolean>(false);
const md = new MarkdownIt({
  html: true, // 启用HTML标签
  linkify: true, // 自动将URL转换为链接
  typographer: true, // 启用一些语言中性的替换和引用美化
});
  const contentMarkdown = ref<string>('');
  const markdownPreview = computed(() => md.render(contentMarkdown.value || ''));
  // 移动端适配：检测窗口宽度
  const isMobile = ref(false);
  const updateIsMobile = () => { isMobile.value = window.innerWidth <= 768; };
  onMounted(() => { updateIsMobile(); window.addEventListener('resize', updateIsMobile); });
  onUnmounted(() => { window.removeEventListener('resize', updateIsMobile); });
  const categoryTableHeight = computed(() => {
    const cap = isMobile.value ? 240 : 360;
    const header = 48;
    const row = 48;
    const desired = header + categories.value.length * row;
    return Math.min(desired, cap);
  });

// Quill编辑器配置
const quillOptions = ref({
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ 'header': 1 }, { 'header': 2 }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'script': 'sub'}, { 'script': 'super' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      [{ 'direction': 'rtl' }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'font': [] }],
      [{ 'align': [] }],
      ['clean'],
      ['link', 'image', 'video']
    ]
  },
  placeholder: '请输入公告内容...',
  theme: 'snow'
});

const showCatDialog = ref(false);
const catDialogTitle = ref('新增分类');
const catEditingId = ref<number | null>(null);
const catForm = ref<Partial<AnnouncementCategory>>({ name: '', parent_id: null });

const fetchCategories = async () => { categories.value = await getAnnouncementCategories(); };
const fetchList = async () => {
  const { items: its, total: t } = await getAnnouncements({ status: status.value || undefined, page: page.value, pageSize: pageSize.value });
  items.value = its; total.value = t;
};

onMounted(async () => { await fetchCategories(); await fetchList(); });
watch(status, fetchList);

const openCreate = () => { 
  dialogTitle.value = '新增公告'; 
  editingId.value = null; 
  form.value = { 
    title: '', 
    content_html: '<p></p>', 
    status: 'draft', 
    category_id: null,
    scheduled_at: null 
  }; 
  contentMarkdown.value = ''; 
  markdownMode.value = false; 
  scheduled.value = null; 
  showDialog.value = true; 
};

const editRow = (row: Announcement) => { 
  dialogTitle.value = '编辑公告'; 
  editingId.value = row.id; 
  form.value = { 
    title: row.title, 
    content_html: row.content_html || '<p></p>', 
    status: row.status, 
    category_id: row.category_id, 
    scheduled_at: row.scheduled_at 
  }; 
  contentMarkdown.value = (row as any).content_markdown || ''; 
  markdownMode.value = !!(row as any).content_markdown; 
  scheduled.value = row.scheduled_at || null; 
  showDialog.value = true; 
};

const handleModeChange = (value: boolean) => {
  if (value) {
    // 切换到Markdown模式，如果有HTML内容，转换为Markdown
    if (form.value.content_html && !contentMarkdown.value) {
      // 这里可以添加HTML到Markdown的转换逻辑
      // 暂时简单处理
      contentMarkdown.value = form.value.content_html.replace(/<[^>]*>/g, '');
    }
  }
};

const save = async () => {
  try {
    form.value.scheduled_at = scheduled.value || null;
    if (markdownMode.value) {
      // 保存Markdown内容
      form.value.content_markdown = contentMarkdown.value;
      form.value.content_html = md.render(contentMarkdown.value || '');
    } else {
      // 确保HTML内容有基本结构
      if (!form.value.content_html || form.value.content_html.trim() === '') {
        form.value.content_html = '<p></p>';
      }
    }
    
    if (editingId.value) {
      await updateAnnouncement(editingId.value, form.value);
    } else {
      await createAnnouncement(form.value);
    }
    
    ElMessage.success('保存成功');
    showDialog.value = false; 
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  }
};

const remove = async (row: Announcement) => { await deleteAnnouncement(row.id); fetchList(); };
const publish = async (row: Announcement) => { await publishAnnouncement(row.id); fetchList(); };
const offline = async (row: Announcement) => { await offlineAnnouncement(row.id); fetchList(); };
const onPageChange = (p: number) => { page.value = p; fetchList(); };

const openCreateCategory = () => { catDialogTitle.value = '新增分类'; catEditingId.value = null; catForm.value = { name: '', parent_id: null }; showCatDialog.value = true; };
const editCategory = (row: AnnouncementCategory) => { catDialogTitle.value = '编辑分类'; catEditingId.value = row.id; catForm.value = { name: row.name, parent_id: row.parent_id || null }; showCatDialog.value = true; };
const saveCategory = async () => { if (catEditingId.value) await updateAnnouncementCategory(catEditingId.value, catForm.value); else await createAnnouncementCategory(catForm.value); showCatDialog.value = false; fetchCategories(); };
const removeCategory = async (row: AnnouncementCategory) => { await deleteAnnouncementCategory(row.id); fetchCategories(); };

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
.card-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.toolbar { 
  display: flex; 
  gap: 10px; 
  margin-bottom: 16px; 
}
.pagination { 
  display: flex; 
  justify-content: flex-end; 
  margin-top: 16px; 
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-light);
}

/* 对话框样式 */
.announcement-dialog :deep(.el-dialog__body) {
  padding-top: 20px;
  padding-bottom: 10px;
}

.announcement-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

/* 编辑器容器 */
.editor-container {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 16px;
  margin-top: 8px;
}

.editor-section {
  width: 100%;
}

.editor-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

/* 富文本编辑器样式 */
.quill-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  /* overflow: hidden; 去除overflow:hidden以允许弹出层显示 */
  background: var(--el-bg-color);
}

.quill-editor :deep(.ql-toolbar) {
  border: none;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-fill-color-lighter);
  border-top-left-radius: 5px;
  border-top-right-radius: 5px;
}

.quill-editor :deep(.ql-container) {
  border: none;
  min-height: 300px;
  font-size: 14px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
}

.quill-editor :deep(.ql-editor) {
  min-height: 280px;
  padding: 16px;
}

/* Markdown编辑器样式 */
.markdown-section {
  width: 100%;
}

.markdown-row {
  margin-bottom: 0;
}

.markdown-col {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.markdown-editor-wrapper,
.markdown-preview-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
}

.sub-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color);
}

.markdown-editor {
  flex: 1;
  border: none;
}

.markdown-editor :deep(.el-textarea__inner) {
  border: none;
  border-radius: 0;
  padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  min-height: 300px;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.md-preview {
  flex: 1;
  padding: 12px !important;
  overflow: auto;
  font-size: 14px;
  background-color: transparent !important;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .announcement-dialog {
    width: 95% !important;
    max-width: 100%;
  }
  .announcement-form :deep(.el-form-item__label) {
    padding-bottom: 4px;
  }
  .quill-editor :deep(.ql-toolbar) {
    overflow-x: auto;
  }
  .quill-editor :deep(.ql-container) {
    min-height: 220px;
  }
  .quill-editor :deep(.ql-editor) {
    min-height: 200px;
    padding: 12px;
  }
  
  .markdown-row {
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  
  .markdown-col {
    margin-bottom: 16px;
  }
  
  .markdown-col:last-child {
    margin-bottom: 0;
  }
  .markdown-editor :deep(.el-textarea__inner) {
    min-height: 220px;
  }
  .md-preview {
    min-height: 220px;
  }
}
</style>
