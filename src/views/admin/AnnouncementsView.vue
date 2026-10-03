<template>
  <div class="admin-view">
    <AdminPageHeader :embedded="embedded" title="公告管理" />

    <!-- 公告分类：数量少，用紧凑的行列表代替表格 -->
    <AdminSection title="公告分类" variant="plain">
      <template #meta>
        <span class="section-count">{{ categories.length }} 个</span>
      </template>
      <template #actions>
        <el-button size="small" :icon="Plus" @click="openCreateCategory">新增分类</el-button>
      </template>
      <div v-if="categories.length" class="category-list">
        <div v-for="row in categories" :key="row.id" class="category-item">
          <span class="category-name">{{ row.name }}</span>
          <span v-if="parentName(row)" class="category-parent">父级：{{ parentName(row) }}</span>
          <div class="category-actions">
            <el-button link type="primary" :icon="Edit" @click="editCategory(row)" />
            <el-button link type="danger" :icon="Delete" @click="removeCategory(row)" />
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">还没有分类，先建一个分类再发布公告。</p>
    </AdminSection>

    <!-- 公告列表 -->
    <AdminSection title="公告列表" variant="plain">
      <template #meta>
        <span class="section-count">共 {{ total }} 条</span>
      </template>
      <template #actions>
        <el-button type="primary" size="small" :icon="Plus" @click="openCreate">新增公告</el-button>
      </template>

      <div class="filter-bar">
        <el-input
          v-model="searchKeyword"
          class="filter-search"
          size="small"
          clearable
          placeholder="搜索公告标题"
          @keyup.enter="applyFilter"
          @clear="applyFilter"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="categoryFilter" size="small" class="filter-select" clearable placeholder="全部分类" @change="applyFilter">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="status" size="small" class="filter-select" placeholder="全部状态">
          <el-option label="全部状态" value="" />
          <el-option label="草稿" value="draft" />
          <el-option label="已发布" value="published" />
          <el-option label="已下线" value="offline" />
        </el-select>
        <el-button size="small" text :icon="Refresh" @click="fetchList">刷新</el-button>
      </div>

      <el-table :data="items" style="width: 100%">
        <el-table-column label="标题" min-width="150">
          <template #default="{ row }">
            <div class="title-cell">
              <span class="title-text">{{ row.title || '未命名公告' }}</span>
              <span class="title-sub">
                {{ categoryName(row.category_id) || '未分类' }}
                <template v-if="row.scheduled_at"> · 定时 {{ formatDateTime(row.scheduled_at) }}</template>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="状态" min-width="96">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column v-if="!isMobile" label="定时发布" min-width="150">
          <template #default="{ row }">
            <span :class="{ 'muted-text': !row.scheduled_at }">
              {{ row.scheduled_at ? formatDateTime(row.scheduled_at) : '未设置' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" min-width="160" align="right">
          <template #default="{ row }">
            <div class="action-cell">
              <el-button link type="primary" :icon="Edit" @click="editRow(row)" />
              <el-button
                v-if="row.status !== 'published'"
                size="small"
                type="success"
                plain
                @click="publish(row)"
              >发布</el-button>
              <el-button
                v-else
                size="small"
                type="warning"
                plain
                @click="offline(row)"
              >下线</el-button>
              <el-button link type="danger" :icon="Delete" @click="remove(row)" />
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <div class="table-empty">
            <span>{{ hasFilter ? '没有符合条件的公告' : '还没有公告' }}</span>
            <el-button v-if="!hasFilter" size="small" type="primary" plain @click="openCreate">新增公告</el-button>
          </div>
        </template>
      </el-table>

      <div v-if="total > pageSize" class="pagination">
        <el-pagination
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="total"
          :current-page="page"
          @current-change="onPageChange"
        />
      </div>
    </AdminSection>

    <!-- 公告编辑对话框 -->
    <el-dialog
      v-model="showDialog"
      :title="dialogTitle"
      :width="isMobile ? '100%' : '900px'"
      :fullscreen="isMobile"
      class="announcement-dialog"
    >
      <el-form label-position="top"
        :model="form"
        class="announcement-form"
      >
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="标题" required>
              <el-input v-model="form.title" placeholder="一句话说明这条公告" />
            </el-form-item>
          </el-col>

          <el-col :md="8" :xs="24">
            <el-form-item label="分类">
              <el-select v-model="form.category_id" placeholder="选择分类" style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :md="8" :xs="24">
            <el-form-item label="状态">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="草稿" value="draft" />
                <el-option label="已发布" value="published" />
                <el-option label="已下线" value="offline" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :md="8" :xs="24">
            <el-form-item label="定时发布">
              <el-date-picker 
                v-model="scheduled" 
                type="datetime" 
                value-format="YYYY-MM-DD HH:mm:ss" 
                placeholder="不设置则立即生效" 
                style="width: 100%"
              />
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <div class="editor-container">
              <div class="editor-head">
                <span class="editor-label">公告内容</span>
                <el-radio-group v-model="markdownMode" size="small" @change="handleModeChange">
                  <el-radio-button :value="false">富文本</el-radio-button>
                  <el-radio-button :value="true">Markdown</el-radio-button>
                </el-radio-group>
              </div>
              <p class="editor-hint">发布后前台公告页会直接渲染这里的内容；Markdown 支持表格、代码块与公式。</p>

              <!-- 富文本编辑器 -->
              <div v-if="!markdownMode" class="editor-section">
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
                <el-row :gutter="16" class="markdown-row">
                  <el-col :xs="24" :md="12" class="markdown-col">
                    <div class="markdown-editor-wrapper">
                      <div class="sub-label">编辑区域</div>
                      <el-input 
                        type="textarea" 
                        v-model="contentMarkdown" 
                        class="markdown-editor"
                        placeholder="在此编写 Markdown 内容"
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
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分类编辑对话框 -->
    <el-dialog v-model="showCatDialog" :title="catDialogTitle" :width="isMobile ? '90%' : '500px'">
      <p class="dialog-hint">分类用来给公告分组；父分类可以留空表示顶级分类。</p>
      <el-form label-position="top" :model="catForm">
        <el-form-item label="名称" required>
          <el-input v-model="catForm.name" placeholder="例如：系统维护" />
        </el-form-item>
        <el-form-item label="父分类">
          <el-select v-model="catForm.parent_id" clearable placeholder="不选则为顶级分类" style="width: 100%">
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
import AdminPageHeader from '../../components/admin/AdminPageHeader.vue';
import { ref, onMounted, watch, computed, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Search, Refresh } from '@element-plus/icons-vue';
import { getAnnouncementCategories, createAnnouncementCategory, updateAnnouncementCategory, deleteAnnouncementCategory, getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, publishAnnouncement, offlineAnnouncement, type AnnouncementCategory, type Announcement } from '../../services/admin';
import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import 'github-markdown-css/github-markdown-light.css';
import 'highlight.js/styles/atom-one-light.css';
import 'katex/dist/katex.min.css';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import AdminSection from '../../components/admin/AdminSection.vue';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;


const categories = ref<AnnouncementCategory[]>([]);
const items = ref<Announcement[]>([]);
const status = ref<string>('');
const searchKeyword = ref('');
const categoryFilter = ref<number | null>(null);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const saving = ref(false);

const showDialog = ref(false);
const dialogTitle = ref('新增公告');
const editingId = ref<number | null>(null);
const scheduled = ref<string | null>(null);
const form = ref<Partial<Announcement>>({ title: '', content_html: '', status: 'draft', category_id: null, scheduled_at: null });
const markdownMode = ref<boolean>(false);
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (__) {}
    }
    return ''; // use external default escaping
  }
});
md.use(markdownItKatex);
  const contentMarkdown = ref<string>('');
  const markdownPreview = computed(() => md.render(contentMarkdown.value || ''));
  // 移动端适配：检测窗口宽度
  const isMobile = ref(false);
  const updateIsMobile = () => { isMobile.value = window.innerWidth <= 768; };
  onMounted(() => { updateIsMobile(); window.addEventListener('resize', updateIsMobile); });
  onUnmounted(() => { window.removeEventListener('resize', updateIsMobile); });
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
// 连续改筛选条件时，只认最后一次请求的结果，避免旧响应覆盖新结果
let listRequestSeq = 0;
const fetchList = async () => {
  const seq = ++listRequestSeq;
  const { items: its, total: t } = await getAnnouncements({
    status: status.value || undefined,
    search: searchKeyword.value.trim() || undefined,
    category_id: categoryFilter.value ?? undefined,
    page: page.value,
    pageSize: pageSize.value
  });
  if (seq !== listRequestSeq) return;
  items.value = its; total.value = t;
};

onMounted(async () => { await fetchCategories(); await fetchList(); });
watch(status, applyFilter);

// 输入即搜：停顿 300ms 再查，避免每敲一个字都打一次接口
let searchTimer: number | undefined;
watch(searchKeyword, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => applyFilter(), 300);
});
onUnmounted(() => window.clearTimeout(searchTimer));

/** 改筛选条件后回到第一页再查 */
function applyFilter() {
  page.value = 1;
  fetchList();
}

const hasFilter = computed(
  () => !!(searchKeyword.value.trim() || status.value || categoryFilter.value)
);

const categoryName = (id?: number | null) => {
  if (!id) return '';
  return categories.value.find((c) => c.id === id)?.name || '';
};

const parentName = (row: AnnouncementCategory) => (row.parent_id ? categoryName(row.parent_id) : '');

const statusLabel = (value?: string | null) => {
  if (value === 'published') return '已发布';
  if (value === 'offline') return '已下线';
  return '草稿';
};

const statusTagType = (value?: string | null) => {
  if (value === 'published') return 'success';
  if (value === 'offline') return 'info';
  return 'warning';
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

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
      contentMarkdown.value = form.value.content_html.replace(/<[^>]*>/g, '');
    }
  }
};

const save = async () => {
  if (saving.value) return;
  if (!(form.value.title || '').trim()) {
    ElMessage.error('请输入公告标题');
    return;
  }
  saving.value = true;
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
  } finally {
    saving.value = false;
  }
};

const remove = (row: Announcement) => {
  ElMessageBox.confirm(`确认删除公告「${row.title || '未命名'}」？`, '提示', { type: 'warning' })
    .then(async () => {
      await deleteAnnouncement(row.id);
      ElMessage.success('已删除');
      fetchList();
    })
    .catch(() => {});
};
const publish = async (row: Announcement) => { await publishAnnouncement(row.id); fetchList(); };
const offline = async (row: Announcement) => { await offlineAnnouncement(row.id); fetchList(); };
const onPageChange = (p: number) => { page.value = p; fetchList(); };

const openCreateCategory = () => { catDialogTitle.value = '新增分类'; catEditingId.value = null; catForm.value = { name: '', parent_id: null }; showCatDialog.value = true; };
const editCategory = (row: AnnouncementCategory) => { catDialogTitle.value = '编辑分类'; catEditingId.value = row.id; catForm.value = { name: row.name, parent_id: row.parent_id || null }; showCatDialog.value = true; };
const saveCategory = async () => {
  if (!(catForm.value.name || '').trim()) {
    ElMessage.error('请输入分类名称');
    return;
  }
  if (catEditingId.value) await updateAnnouncementCategory(catEditingId.value, catForm.value);
  else await createAnnouncementCategory(catForm.value);
  showCatDialog.value = false;
  ElMessage.success('保存成功');
  fetchCategories();
};

const removeCategory = (row: AnnouncementCategory) => {
  ElMessageBox.confirm(`确认删除分类「${row.name}」？`, '提示', { type: 'warning' })
    .then(async () => {
      await deleteAnnouncementCategory(row.id);
      ElMessage.success('已删除');
      fetchCategories();
    })
    .catch(() => {});
};

</script>

<style scoped>

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ---------- 分类列表 ---------- */
.category-list {
  display: flex;
  flex-direction: column;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.category-item:hover {
  background-color: var(--el-fill-color-light);
}

.category-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.category-parent {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.category-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ---------- 过滤条 ---------- */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-search { width: 240px; max-width: 100%; }
.filter-select { width: 140px; }

/* ---------- 表格单元格 ---------- */
.title-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.title-text {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.title-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.muted-text {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.action-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.empty-hint {
  margin: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.dialog-hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .section-card { padding: 14px 12px; }
  .filter-search { width: 100%; }
  .filter-select { flex: 1 1 140px; width: auto; }
}

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
  padding-top: 12px;
  padding-bottom: 8px;
  /* 内容高时对话框内部滚动，底部按钮始终可见 */
  max-height: 72vh;
  overflow-y: auto;
}

.announcement-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

/* 编辑器容器 */
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.editor-container {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 14px;
  margin-top: 8px;
}

.editor-section {
  width: 100%;
}

.editor-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.editor-hint {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* 富文本编辑器样式 */
.quill-wrapper {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  overflow: hidden;
}

.quill-editor :deep(.ql-toolbar) {
  border: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  padding: 6px 8px;
}

.quill-editor :deep(.ql-toolbar .ql-formats) {
  margin-right: 10px;
}

.quill-editor :deep(.ql-toolbar button) {
  width: 26px;
  height: 24px;
  padding: 2px;
}

.quill-editor :deep(.ql-toolbar .ql-picker) {
  height: 24px;
}

.quill-editor :deep(.ql-toolbar .ql-picker-label) {
  padding: 2px 6px;
}

.quill-editor :deep(.ql-container) {
  border: none;
  font-size: 14px;
  /* 窗口不高时编辑器内部滚动，避免整个弹窗被撑出屏幕 */
  max-height: 42vh;
  overflow-y: auto;
}

.quill-editor :deep(.ql-editor) {
  min-height: 200px;
  line-height: 1.8;
  padding: 16px;
}

/* ---------- Markdown 预览配色：跟着主题走 ---------- */
.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3),
.md-preview :deep(h4),
.md-preview :deep(h5),
.md-preview :deep(h6) {
  color: var(--el-text-color-primary);
  border-bottom-color: var(--el-border-color-lighter);
}

.md-preview :deep(p),
.md-preview :deep(li),
.md-preview :deep(td) {
  color: var(--el-text-color-regular);
}

.md-preview :deep(a) {
  color: var(--el-color-primary);
}

.md-preview :deep(code) {
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color);
}

.md-preview :deep(pre) {
  background-color: var(--el-fill-color-light);
}

.md-preview :deep(blockquote) {
  color: var(--el-text-color-secondary);
  border-left-color: var(--el-border-color);
}

.md-preview :deep(hr) {
  background-color: var(--el-border-color-lighter);
}

.md-preview :deep(table tr) {
  background-color: transparent;
  border-top-color: var(--el-border-color-lighter);
}

.md-preview :deep(table tr:nth-child(2n)) {
  background-color: var(--el-fill-color-lighter);
}

.md-preview :deep(table th),
.md-preview :deep(table td) {
  border-color: var(--el-border-color-lighter);
}

/* ---------- 富文本编辑器：文字与工具栏图标跟随主题 ---------- */
.quill-editor :deep(.ql-editor) {
  color: var(--el-text-color-primary);
}

.quill-editor :deep(.ql-editor.ql-blank::before) {
  color: var(--el-text-color-placeholder);
  font-style: normal;
}

.quill-editor :deep(.ql-snow .ql-stroke) {
  stroke: var(--el-text-color-regular);
}

.quill-editor :deep(.ql-snow .ql-fill),
.quill-editor :deep(.ql-snow .ql-stroke.ql-fill) {
  fill: var(--el-text-color-regular);
}

.quill-editor :deep(.ql-snow .ql-picker),
.quill-editor :deep(.ql-snow .ql-picker-label) {
  color: var(--el-text-color-regular);
}

.quill-editor :deep(.ql-snow .ql-picker-options) {
  background-color: var(--el-bg-color-overlay);
  border-color: var(--el-border-color-lighter);
}

@media (max-width: 768px) {
  .markdown-editor-wrapper,
  .markdown-preview-wrapper {
    height: 260px;
  }
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

/* ------------------------------------------------------------------
 * Markdown 双栏等高
 * 放在样式表最后：覆盖前面 `.markdown-*-wrapper { height:100% }`
 * 和编辑框 `min-height:300px` 带来的高度差（左栏被文字撑高、右栏按内容缩）。
 * ------------------------------------------------------------------ */
.markdown-col {
  height: auto;
}

.markdown-editor-wrapper,
.markdown-preview-wrapper {
  height: 300px;
  overflow: hidden;
}

.markdown-editor,
.markdown-editor :deep(.el-textarea),
.markdown-editor :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 0;
}

.markdown-editor :deep(.el-textarea__inner) {
  overflow-y: auto;
}

.markdown-preview-wrapper .md-preview {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .markdown-editor-wrapper,
  .markdown-preview-wrapper {
    height: 240px;
  }

  .markdown-editor :deep(.el-textarea__inner),
  .md-preview {
    min-height: 0;
  }
}
</style>
