<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 文章管理 </span>
      </template>
    </el-page-header>

    <el-row :gutter="20">
      <el-col :md="8" :xs="24">
        <el-card class="mb-4">
          <div class="card-header">
            <h3>文章分类</h3>
            <el-button size="small" @click="openCreateCategory">新增分类</el-button>
          </div>
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

        <el-card class="mb-4">
          <div class="card-header">
            <h3>标签管理</h3>
            <el-button size="small" @click="openCreateTag">新增标签</el-button>
          </div>
          <el-table :data="tags" :height="tagTableHeight">
            <el-table-column prop="name" label="名称" />
            <el-table-column label="颜色" width="90">
              <template #default="{ row }">
                <div class="tag-color" :style="{ backgroundColor: row.color || 'var(--el-fill-color-light)' }"></div>
              </template>
            </el-table-column>
            <el-table-column prop="group_name" label="分组" width="120" />
            <el-table-column prop="usage_count" label="热度" width="80" />
            <el-table-column label="操作" width="180">
              <template #default="{ row }">
                <el-button size="small" @click="editTag(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="removeTag(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :md="16" :xs="24">
        <el-card class="mb-4">
          <div class="card-header">
            <h3>文章列表</h3>
            <el-button type="primary" size="small" @click="openCreate">新增文章</el-button>
          </div>
          <div class="toolbar">
            <el-select v-model="status" placeholder="状态过滤" style="width: 160px" @change="fetchList">
              <el-option label="全部" value="" />
              <el-option label="草稿" value="draft" />
              <el-option label="已发布" value="published" />
              <el-option label="已下线" value="offline" />
            </el-select>
            <el-select v-model="categoryFilter" placeholder="分类" clearable style="width: 160px" @change="fetchList">
              <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-select v-model="tagFilter" placeholder="标签" clearable style="width: 160px" @change="fetchList">
              <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </div>
          <el-table :data="items" stripe>
            <el-table-column prop="title" label="标题" min-width="200" />
            <el-table-column prop="category_name" label="分类" width="120" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column prop="published_at" label="发布时间" width="180" />
            <el-table-column label="操作" width="300">
              <template #default="{ row }">
                <el-button size="small" @click="editRow(row)">编辑</el-button>
                <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
                <el-button size="small" type="success" v-if="row.status !== 'published'" @click="publish(row)">发布</el-button>
                <el-button size="small" type="warning" v-if="row.status === 'published'" @click="offline(row)">下线</el-button>
                <el-button size="small" @click="openVersions(row)">版本</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination">
            <el-pagination background layout="prev, pager, next" :page-size="pageSize" :total="total" :current-page="page" @current-change="onPageChange" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="showDialog" :title="dialogTitle" :width="isMobile ? '100%' : '980px'" :fullscreen="isMobile || fullScreen" :class="['article-dialog', { 'is-editor-fullscreen': fullScreen || isMobile }]">
      <el-form :model="form" :label-position="isMobile ? 'top' : 'right'" :label-width="isMobile ? 'auto' : '110px'" class="article-form">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="标题">
              <el-input v-model="form.title" placeholder="请输入文章标题">
                <template #suffix>{{ titleCount }}</template>
              </el-input>
            </el-form-item>
          </el-col>

          <el-col :md="12" :xs="24">
            <el-form-item label="别名">
              <el-input v-model="form.slug" placeholder="URL Slug" @input="slugEdited = true" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="作者">
              <el-select v-model="authorList" multiple filterable allow-create default-first-option placeholder="输入或选择作者" style="width: 100%">
                <el-option v-for="a in authorOptions" :key="a" :label="a" :value="a" />
              </el-select>
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
            <el-form-item label="标签">
              <el-select v-model="selectedTags" multiple filterable allow-create default-first-option placeholder="选择或输入标签" style="width: 100%">
                <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <el-form-item label="摘要">
              <el-input v-model="form.summary" type="textarea" :autosize="{ minRows: 3, maxRows: 5 }" placeholder="请输入摘要">
                <template #suffix>{{ summaryCount }}/150</template>
              </el-input>
              <div class="summary-actions">
                <el-button size="small" @click="fillSummaryFromContent">自动截取</el-button>
              </div>
            </el-form-item>
          </el-col>

          <el-col :md="16" :xs="24">
            <el-form-item label="封面图">
              <el-input v-model="form.cover_url" placeholder="封面图链接">
                <template #append>
                  <el-upload :show-file-list="false" :http-request="handleCoverUpload" accept="image/*">
                    <el-button>上传</el-button>
                  </el-upload>
                </template>
              </el-input>
              <div v-if="form.cover_url" class="cover-preview">
                <el-image :src="form.cover_url" fit="cover" style="width: 120px; height: 68px; border-radius: 8px;" />
              </div>
            </el-form-item>
          </el-col>
          <el-col :md="8" :xs="24">
            <el-form-item label="封面焦点">
              <el-select v-model="form.cover_focus" placeholder="选择焦点" style="width: 100%">
                <el-option label="居中" value="center" />
                <el-option label="顶部" value="top" />
                <el-option label="底部" value="bottom" />
                <el-option label="左侧" value="left" />
                <el-option label="右侧" value="right" />
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <el-form-item label="关联应用">
              <el-select
                v-model="selectedApps"
                multiple
                filterable
                remote
                reserve-keyword
                placeholder="搜索应用并关联"
                :remote-method="searchAppOptions"
                :loading="appSearchLoading"
                style="width: 100%"
              >
                <el-option
                  v-for="item in appOptions"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                >
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center;">
                      <el-image v-if="item.icon_url" :src="item.icon_url" style="width: 20px; height: 20px; margin-right: 8px; border-radius: 4px;" />
                      <span>{{ item.name }}</span>
                    </div>
                    <span v-if="(item as any).kind_name" style="color: var(--el-text-color-secondary); font-size: 12px;">{{ (item as any).kind_name }}</span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <el-form-item label="SEO 标题">
              <el-input v-model="form.seo_title" placeholder="Meta 标题" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="SEO 描述">
              <el-input v-model="form.seo_description" type="textarea" :autosize="{ minRows: 2, maxRows: 3 }" placeholder="Meta 描述" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="SEO 关键词">
              <el-input v-model="form.seo_keywords" placeholder="关键词（逗号分隔）" />
            </el-form-item>
          </el-col>

          <el-col :md="12" :xs="24">
            <el-form-item label="评论开关">
              <el-switch v-model="allowComments" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="密码保护">
              <el-input v-model="form.password" placeholder="可选，留空为公开" show-password />
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
            <div class="dialog-footer">
              <div class="autosave-tip" v-if="autoSaveTip">{{ autoSaveTip }}</div>
              <div class="footer-actions">
                <el-button @click="showDialog=false">取消</el-button>
                <el-button @click="saveSnapshot" :disabled="!editingId">保存快照</el-button>
                <el-button type="primary" @click="save">保存</el-button>
              </div>
            </div>
          </el-col>

          <el-col :span="24">
            <div class="editor-container" :class="{ 'is-fullscreen': fullScreen }">
              <div class="editor-tools">
                <el-upload :show-file-list="false" :http-request="handleImageUpload" accept="image/*">
                  <el-button size="small">插入图片</el-button>
                </el-upload>
                <el-upload :show-file-list="false" :http-request="handleVideoUpload" accept="video/*">
                  <el-button size="small">插入视频</el-button>
                </el-upload>
                <el-upload :show-file-list="false" :http-request="handleAudioUpload" accept="audio/*">
                  <el-button size="small">插入音频</el-button>
                </el-upload>
                <el-upload :show-file-list="false" :http-request="handleFileUpload">
                  <el-button size="small">插入附件</el-button>
                </el-upload>
                <el-button size="small" @click="insertTable">插入表格</el-button>
                <el-button size="small" @click="insertDivider">插入分割线</el-button>
                <el-button size="small" @click="clearFormat">清除格式</el-button>
                <el-button size="small" @click="toggleFullScreen">{{ fullScreen ? '退出全屏' : '全屏编辑' }}</el-button>
              </div>

              <div class="recent-uploads" v-if="recentUploads.length">
                <div class="recent-title">媒体库</div>
                <div class="recent-list">
                  <el-tag v-for="item in recentUploads" :key="item.url" class="recent-item" @click="insertUpload(item)">
                    {{ item.name }}
                  </el-tag>
                </div>
              </div>

              <div v-if="!markdownMode" class="editor-section">
                <div class="editor-label">文章内容</div>
                <div class="quill-wrapper">
                  <QuillEditor ref="quillRef" v-model:content="form.content_html" contentType="html" theme="snow" class="quill-editor" :options="quillOptions" />
                </div>
              </div>

              <div v-else class="editor-section markdown-section">
                <div class="editor-label">Markdown编辑</div>
                <el-row :gutter="16" class="markdown-row">
                  <el-col :xs="24" :md="12" class="markdown-col">
                    <div class="markdown-editor-wrapper">
                      <div class="sub-label">编辑区域</div>
                      <el-input ref="markdownInputRef" type="textarea" v-model="contentMarkdown" class="markdown-editor" placeholder="在此编写 Markdown 内容" :autosize="{ minRows: 20, maxRows: 32 }" resize="none" />
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
    </el-dialog>

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

    <el-dialog v-model="showTagDialog" :title="tagDialogTitle" :width="isMobile ? '90%' : '500px'">
      <el-form :model="tagForm" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="名称"><el-input v-model="tagForm.name" /></el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="tagForm.color" />
        </el-form-item>
        <el-form-item label="分组"><el-input v-model="tagForm.group_name" placeholder="可选" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTagDialog=false">取消</el-button>
        <el-button type="primary" @click="saveTag">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showVersionDialog" title="版本管理" :width="isMobile ? '100%' : '820px'">
      <el-table :data="versions" height="360">
        <el-table-column prop="created_at" label="时间" width="200" />
        <el-table-column prop="title" label="标题" />
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button size="small" @click="restoreVersion(row)">恢复</el-button>
            <el-button size="small" @click="selectCompare(row)">加入对比</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="version-compare-actions">
        <el-select v-model="compareLeft" placeholder="左侧版本" style="width: 180px">
          <el-option v-for="v in versions" :key="v.id" :label="versionLabel(v)" :value="v.id" />
        </el-select>
        <el-select v-model="compareRight" placeholder="右侧版本" style="width: 180px">
          <el-option v-for="v in versions" :key="v.id" :label="versionLabel(v)" :value="v.id" />
        </el-select>
        <el-button @click="openCompare">对比查看</el-button>
      </div>
      <template #footer>
        <el-button @click="showVersionDialog=false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showCompareDialog" title="版本对比" :width="isMobile ? '100%' : '980px'">
      <div class="compare-container">
        <div class="compare-panel">
          <div class="compare-title">{{ compareTitleLeft }}</div>
          <div class="compare-body markdown-body" v-html="compareHtmlLeft" />
        </div>
        <div class="compare-panel">
          <div class="compare-title">{{ compareTitleRight }}</div>
          <div class="compare-body markdown-body" v-html="compareHtmlRight" />
        </div>
      </div>
      <template #footer>
        <el-button @click="showCompareDialog=false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { getBlogCategories, createBlogCategory, updateBlogCategory, deleteBlogCategory, getBlogTags, createBlogTag, updateBlogTag, deleteBlogTag, getBlogs, createBlog, updateBlog, deleteBlog, publishBlog, offlineBlog, getBlogVersions, createBlogVersion, restoreBlogVersion, uploadFile, createApp, getApps, type BlogCategory, type BlogTag, type Blog, type BlogVersion, type AppItem } from '../../services/admin';
import { searchApps as searchNextApps } from '../../services/next-api';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import 'github-markdown-css/github-markdown.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import { useAuthStore } from '../../stores/auth';

const props = defineProps<{ embedded?: boolean }>();
const embedded = props.embedded === true;
const router = useRouter();
const goBack = () => router.push('/admin');

const authStore = useAuthStore();
const isMobile = ref(false);
const updateIsMobile = () => { isMobile.value = window.innerWidth <= 768; };
onMounted(() => { updateIsMobile(); window.addEventListener('resize', updateIsMobile); });
onUnmounted(() => { window.removeEventListener('resize', updateIsMobile); });

const categories = ref<BlogCategory[]>([]);
const tags = ref<BlogTag[]>([]);
const items = ref<Blog[]>([]);
const status = ref<string>('');
const categoryFilter = ref<number | null>(null);
const tagFilter = ref<number | null>(null);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);

const showDialog = ref(false);
const dialogTitle = ref('新增文章');
const editingId = ref<number | null>(null);
const scheduled = ref<string | null>(null);
const markdownMode = ref(false);
const contentMarkdown = ref('');
const fullScreen = ref(false);
const slugEdited = ref(false);
const allowComments = ref(true);
const authorList = ref<string[]>([]);
const selectedTags = ref<(number | string)[]>([]);
const authorOptions = ref<string[]>([]);
const selectedApps = ref<number[]>([]);
const appOptions = ref<AppItem[]>([]);
const appSearchLoading = ref(false);

const showCatDialog = ref(false);
const catDialogTitle = ref('新增分类');
const catEditingId = ref<number | null>(null);
const catForm = ref<Partial<BlogCategory>>({ name: '', parent_id: null });

const showTagDialog = ref(false);
const tagDialogTitle = ref('新增标签');
const tagEditingId = ref<number | null>(null);
const tagForm = ref<Partial<BlogTag>>({ name: '', color: '', group_name: '' });

const showVersionDialog = ref(false);
const versions = ref<BlogVersion[]>([]);
const compareLeft = ref<number | null>(null);
const compareRight = ref<number | null>(null);
const showCompareDialog = ref(false);
const compareHtmlLeft = ref('');
const compareHtmlRight = ref('');
const compareTitleLeft = ref('');
const compareTitleRight = ref('');

const quillRef = ref();
const markdownInputRef = ref();

const recentUploads = ref<{ url: string; name: string; type: string }[]>([]);
const autoSaveTip = ref('');
let autoSaveTimer: number | null = null;
let lastSnapshotKey = '';

const form = ref<Partial<Blog>>({
  title: '',
  slug: '',
  content_html: '<p></p>',
  status: 'draft',
  category_id: null,
  summary: '',
  cover_url: '',
  cover_focus: 'center',
  seo_title: '',
  seo_description: '',
  seo_keywords: '',
  password: ''
});

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
});
md.set({
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  }
});
md.use(markdownItKatex);

const markdownPreview = computed(() => md.render(contentMarkdown.value || ''));
const titleCount = computed(() => (form.value.title ? String(form.value.title).length : 0));
const summaryCount = computed(() => (form.value.summary ? String(form.value.summary).length : 0));
const categoryTableHeight = computed(() => {
  const cap = isMobile.value ? 240 : 360;
  const header = 48;
  const row = 48;
  const desired = header + categories.value.length * row;
  return Math.min(desired, cap);
});
const tagTableHeight = computed(() => {
  const cap = isMobile.value ? 260 : 360;
  const header = 48;
  const row = 48;
  const desired = header + tags.value.length * row;
  return Math.min(desired, cap);
});

const quillOptions = ref({
  modules: {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ header: 1 }, { header: 2 }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      [{ size: ['small', false, 'large', 'huge'] }],
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      ['clean'],
      ['link', 'image', 'video']
    ]
  },
  placeholder: '请输入文章内容...',
  theme: 'snow'
});

const fetchCategories = async () => { categories.value = await getBlogCategories(); };
const fetchTags = async () => { tags.value = await getBlogTags(); };
// const appLabel = (app: AppItem) => app.provider ? `${app.name} · ${app.provider}` : app.name;
const mergeAppOptions = (list: AppItem[]) => {
  const map = new Map<number, AppItem>();
  appOptions.value.forEach(item => map.set(item.id, item));
  list.forEach(item => map.set(item.id, item));
  appOptions.value = Array.from(map.values());
};
const searchAppOptions = async (query: string) => {
  const keyword = String(query || '').trim();
  if (!keyword) return;
  appSearchLoading.value = true;
  try {
    // 1. Search local apps
    const localApps = await getApps();
    const localMatches = localApps.filter(app => app.name.toLowerCase().includes(keyword.toLowerCase()));
    
    // 2. Search remote apps
    const remoteResult = await searchNextApps(keyword);
    const remoteApps = (remoteResult.data || remoteResult.items || []).map((app: any) => ({
      id: app.app_id || app.id, // Use app_id from remote API if available
      name: app.name,
      icon_url: app.icon || app.icon_url,
      provider: app.developer_name || app.provider,
      kind_name: app.kind_name,
      average_rating: app.average_rating,
      download_count: app.download_count || app.down_count,
      download_count_str: app.download_count_str || app.down_count_desc,
      enabled: 1
    }));

    // Merge: prioritize local, avoid duplicates by ID? 
    // Since IDs are different types (number vs string), we can keep both.
    // Ideally, we should check if a remote app is already imported (by original_id match), 
    // but client doesn't know original_id of local apps easily without fetching detail.
    // For simplicity, show both. User should prefer local if exact match.
    
    // To fix selection bug: ensure we keep already selected items in appOptions
    // Otherwise, when we search, the selected items might disappear from options, causing display issues or selection bugs
    const existingSelected = appOptions.value.filter(opt => selectedApps.value.includes(opt.id));
    
    // Combine new search results with existing selected items, removing duplicates
    const newOptions = [...localMatches, ...remoteApps];
    const map = new Map();
    existingSelected.forEach(opt => map.set(opt.id, opt));
    newOptions.forEach(opt => map.set(opt.id, opt));
    
    appOptions.value = Array.from(map.values());
  } catch (e) {
    console.error(e);
  } finally {
    appSearchLoading.value = false;
  }
};
const fetchAppsByIds = async (ids: number[]) => {
  if (!ids.length) return;
  // searchApps is local API, getApps is better if searchApps not available
  // But we need to filter by IDs.
  // Actually we can just fetch all local apps and filter.
  // Or if searchApps exists in admin.ts (it does not currently), use it.
  // admin.ts has getApps(), which returns all.
  const allApps = await getApps();
  const matches = allApps.filter(a => ids.includes(a.id));
  mergeAppOptions(matches);
};
const fetchList = async () => {
  const { items: its, total: t } = await getBlogs({
    status: status.value || undefined,
    page: page.value,
    pageSize: pageSize.value,
    category_id: categoryFilter.value || undefined,
    tag_id: tagFilter.value || undefined
  });
  items.value = its;
  total.value = t;
};

onMounted(async () => {
  await fetchCategories();
  await fetchTags();
  await fetchList();
  loadRecentUploads();
});

watch(status, fetchList);
watch([categoryFilter, tagFilter], fetchList);

const slugify = (input: string) => {
  const cleaned = input
    .toLowerCase()
    .trim()
    .replace(/[\s\W]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || `article-${Date.now()}`;
};

watch(() => form.value.title, (val) => {
  if (!slugEdited.value && val) {
    form.value.slug = slugify(String(val));
  }
});

const openCreate = () => {
  dialogTitle.value = '新增文章';
  editingId.value = null;
  form.value = {
    title: '',
    slug: '',
    content_html: '<p></p>',
    status: 'draft',
    category_id: null,
    summary: '',
    cover_url: '',
    cover_focus: 'center',
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    password: ''
  };
  scheduled.value = null;
  markdownMode.value = false;
  contentMarkdown.value = '';
  slugEdited.value = false;
  allowComments.value = true;
  authorList.value = authStore.username ? [authStore.username] : [];
  selectedTags.value = [];
  selectedApps.value = [];
  appOptions.value = [];
  autoSaveTip.value = '';
  fullScreen.value = true;
  restoreDraftIfAny();
  showDialog.value = true;
  startAutoSave();
};

const editRow = (row: Blog) => {
  dialogTitle.value = '编辑文章';
  editingId.value = row.id;
  form.value = {
    title: row.title,
    slug: row.slug,
    content_html: row.content_html || '<p></p>',
    status: row.status,
    category_id: row.category_id || null,
    summary: row.summary || '',
    cover_url: row.cover_url || '',
    cover_focus: row.cover_focus || 'center',
    seo_title: row.seo_title || '',
    seo_description: row.seo_description || '',
    seo_keywords: row.seo_keywords || '',
    password: row.password || ''
  };
  scheduled.value = row.scheduled_at || null;
  contentMarkdown.value = row.content_markdown || '';
  markdownMode.value = !!row.content_markdown;
  allowComments.value = row.allow_comments ? Number(row.allow_comments) === 1 : true;
  authorList.value = row.author_names ? row.author_names.split(',').map(s => s.trim()).filter(Boolean) : [];
  const tagIds = Array.isArray(row.tag_ids)
    ? row.tag_ids
    : (row.tag_ids ? row.tag_ids.split(',').map((s: string) => Number(s)) : []);
  selectedTags.value = tagIds;
  
  const appIds = Array.isArray((row as any).app_ids) 
    ? (row as any).app_ids
    : ((row as any).app_ids ? (row as any).app_ids.split(',').map((s: string) => Number(s)) : []);
  selectedApps.value = appIds;
  // If editing, we need to load the selected apps into options so they display correctly
  if (appIds.length > 0) {
    // Fetch apps details
    fetchAppsByIds(appIds);
  }

  fullScreen.value = true;
  slugEdited.value = true;
  autoSaveTip.value = '';
  showDialog.value = true;
  startAutoSave();
};

const handleModeChange = (value: boolean) => {
  if (value && form.value.content_html && !contentMarkdown.value) {
    contentMarkdown.value = String(form.value.content_html).replace(/<[^>]*>/g, '');
  }
};

const onPageChange = (p: number) => {
  page.value = p;
  fetchList();
};

const openCreateCategory = () => {
  catDialogTitle.value = '新增分类';
  catEditingId.value = null;
  catForm.value = { name: '', parent_id: null };
  showCatDialog.value = true;
};
const editCategory = (row: BlogCategory) => {
  catDialogTitle.value = '编辑分类';
  catEditingId.value = row.id;
  catForm.value = { name: row.name, parent_id: row.parent_id || null };
  showCatDialog.value = true;
};
const saveCategory = async () => {
  if (!catForm.value.name) return;
  if (catEditingId.value) {
    await updateBlogCategory(catEditingId.value, catForm.value);
  } else {
    await createBlogCategory(catForm.value);
  }
  showCatDialog.value = false;
  fetchCategories();
};
const removeCategory = async (row: BlogCategory) => {
  await deleteBlogCategory(row.id);
  fetchCategories();
};

const openCreateTag = () => {
  tagDialogTitle.value = '新增标签';
  tagEditingId.value = null;
  tagForm.value = { name: '', color: '', group_name: '' };
  showTagDialog.value = true;
};
const editTag = (row: BlogTag) => {
  tagDialogTitle.value = '编辑标签';
  tagEditingId.value = row.id;
  tagForm.value = { name: row.name, color: row.color || '', group_name: row.group_name || '' };
  showTagDialog.value = true;
};
const saveTag = async () => {
  if (!tagForm.value.name) return;
  if (tagEditingId.value) {
    await updateBlogTag(tagEditingId.value, tagForm.value);
  } else {
    await createBlogTag(tagForm.value);
  }
  showTagDialog.value = false;
  fetchTags();
};
const removeTag = async (row: BlogTag) => {
  await deleteBlogTag(row.id);
  fetchTags();
};

const resolveTagIds = async () => {
  const ids: number[] = [];
  for (const tag of selectedTags.value) {
    if (typeof tag === 'number') {
      ids.push(tag);
    } else {
      const name = String(tag).trim();
      if (!name) continue;
      const existing = tags.value.find(t => t.name === name);
      if (existing) {
        ids.push(existing.id);
      } else {
        const id = await createBlogTag({ name, color: '', group_name: '' });
        ids.push(id);
      }
    }
  }
  await fetchTags();
  selectedTags.value = ids;
  return ids;
};

const save = async () => {
  try {
    if (!form.value.title) {
      ElMessage.error('标题不能为空');
      return;
    }
    form.value.slug = form.value.slug ? String(form.value.slug) : slugify(String(form.value.title));
    form.value.author_names = authorList.value.join(',');
    form.value.scheduled_at = scheduled.value || null;
    form.value.allow_comments = allowComments.value ? 1 : 0;
    
    // Resolve apps (import remote ones)
    const finalAppIds: number[] = [];
    for (const app of selectedApps.value) {
      if (typeof app === 'number') {
        finalAppIds.push(app);
      } else if (typeof app === 'string') {
        // It's a remote ID
        const remoteApp = appOptions.value.find(a => String(a.id) === app);
        if (remoteApp) {
          try {
            // Check if app already exists locally by original_id
            // Ideally we should have an API to check existence or rely on createApp returning existing ID
            // My API implementation of createApp checks original_id and returns existing if found
            
            const created = await createApp({
              name: remoteApp.name,
              icon_url: remoteApp.icon_url,
              kind_name: (remoteApp as any).kind_name,
              average_rating: String((remoteApp as any).average_rating || ''),
              download_count_str: (remoteApp as any).download_count_str || String((remoteApp as any).download_count || ''),
              original_id: String(remoteApp.id),
              enabled: 1
            } as any);

            // The backend implementation of createApp (in server/index.cjs) handles deduplication:
            // if (original_id) check DB, if exists return { id: row.id, existed: true }
            // So calling createApp here is actually correct behavior: it either creates a new local record 
            // OR returns the existing local record ID if it was already imported.
            // This is necessary because the blog_app_relations table links to local app IDs, not remote original_ids.
            
            if (created && (created as any).id) {
              finalAppIds.push((created as any).id);
            } else if (typeof created === 'number') {
              finalAppIds.push(created);
            }
          } catch (e) {
            console.error('Failed to import app:', remoteApp.name, e);
          }
        }
      }
    }

    const tagIds = await resolveTagIds();
    const payload: Partial<Omit<Blog, 'tag_ids' | 'app_ids'>> & { tag_ids: number[]; app_ids: number[] } = { ...form.value, tag_ids: tagIds, app_ids: finalAppIds };
    if (markdownMode.value) {
      payload.content_markdown = contentMarkdown.value;
      payload.content_html = md.render(contentMarkdown.value || '');
    } else {
      if (!payload.content_html || String(payload.content_html).trim() === '') {
        payload.content_html = '<p></p>';
      }
    }
    if (editingId.value) {
      await updateBlog(editingId.value, payload);
    } else {
      const id = await createBlog(payload);
      editingId.value = id;
    }
    persistDraftToLocal(true);
    ElMessage.success('保存成功');
    showDialog.value = false;
    fetchList();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  } finally {
    stopAutoSave();
  }
};

const remove = async (row: Blog) => {
  await deleteBlog(row.id);
  fetchList();
};
const publish = async (row: Blog) => {
  await publishBlog(row.id);
  fetchList();
};
const offline = async (row: Blog) => {
  await offlineBlog(row.id);
  fetchList();
};

const fillSummaryFromContent = () => {
  const raw = markdownMode.value ? contentMarkdown.value : String(form.value.content_html || '').replace(/<[^>]*>/g, '');
  const plain = raw.replace(/\s+/g, ' ').trim();
  form.value.summary = plain.slice(0, 150);
};

const handleCoverUpload = async (options: any) => {
  try {
    const res = await uploadFile(options.file);
    form.value.cover_url = res.url;
    addRecentUpload({ url: res.url, name: options.file.name, type: 'image' });
    ElMessage.success('上传成功');
  } catch {
    ElMessage.error('上传失败');
  }
};

const handleImageUpload = async (options: any) => {
  await handleUploadWithType(options, 'image');
};
const handleVideoUpload = async (options: any) => {
  await handleUploadWithType(options, 'video');
};
const handleAudioUpload = async (options: any) => {
  await handleUploadWithType(options, 'audio');
};
const handleFileUpload = async (options: any) => {
  await handleUploadWithType(options, 'file');
};

const handleUploadWithType = async (options: any, type: string) => {
  try {
    const res = await uploadFile(options.file);
    const name = options.file?.name || '附件';
    const item = { url: res.url, name, type };
    addRecentUpload(item);
    insertUpload(item);
    ElMessage.success('上传成功');
  } catch {
    ElMessage.error('上传失败');
  }
};

const insertUpload = (item: { url: string; name: string; type: string }) => {
  if (markdownMode.value) {
    if (item.type === 'image') insertMarkdown(`![${item.name}](${item.url})`);
    else if (item.type === 'video') insertMarkdown(`<video controls src="${item.url}"></video>`);
    else if (item.type === 'audio') insertMarkdown(`<audio controls src="${item.url}"></audio>`);
    else insertMarkdown(`[${item.name}](${item.url})`);
  } else {
    if (item.type === 'image') insertHtml(`<img src="${item.url}" alt="${item.name}" />`);
    else if (item.type === 'video') insertHtml(`<video controls src="${item.url}"></video>`);
    else if (item.type === 'audio') insertHtml(`<audio controls src="${item.url}"></audio>`);
    else insertHtml(`<a href="${item.url}" target="_blank">${item.name}</a>`);
  }
};

const insertTable = () => {
  const table = `| 标题 | 内容 |\n| --- | --- |\n| 示例 | 示例 |\n`;
  if (markdownMode.value) {
    insertMarkdown(table);
  } else {
    insertHtml('<table><tr><th>标题</th><th>内容</th></tr><tr><td>示例</td><td>示例</td></tr></table>');
  }
};

const insertDivider = () => {
  if (markdownMode.value) {
    insertMarkdown('\n---\n');
  } else {
    insertHtml('<hr/>');
  }
};

const clearFormat = () => {
  const quill = quillRef.value?.getQuill?.();
  if (quill) {
    const range = quill.getSelection();
    if (range) quill.removeFormat(range.index, range.length);
  }
};

const insertHtml = (html: string) => {
  const quill = quillRef.value?.getQuill?.();
  if (!quill) return;
  const range = quill.getSelection(true);
  quill.clipboard.dangerouslyPasteHTML(range ? range.index : 0, html);
};

const insertMarkdown = (text: string) => {
  contentMarkdown.value = `${contentMarkdown.value || ''}${text}`;
};

const toggleFullScreen = () => {
  fullScreen.value = !fullScreen.value;
};

const loadRecentUploads = () => {
  try {
    const raw = localStorage.getItem('article_recent_uploads');
    recentUploads.value = raw ? JSON.parse(raw) : [];
  } catch {
    recentUploads.value = [];
  }
};

const addRecentUpload = (item: { url: string; name: string; type: string }) => {
  const list = recentUploads.value.filter(i => i.url !== item.url);
  list.unshift(item);
  recentUploads.value = list.slice(0, 12);
  localStorage.setItem('article_recent_uploads', JSON.stringify(recentUploads.value));
};

const persistDraftToLocal = (clear = false) => {
  if (clear) {
    localStorage.removeItem('article_draft');
    return;
  }
  if (editingId.value) return;
  const draft = { form: form.value, markdownMode: markdownMode.value, contentMarkdown: contentMarkdown.value, authorList: authorList.value, selectedTags: selectedTags.value, selectedApps: selectedApps.value, scheduled: scheduled.value, allowComments: allowComments.value };
  localStorage.setItem('article_draft', JSON.stringify(draft));
};

const restoreDraftIfAny = () => {
  if (editingId.value) return;
  try {
    const raw = localStorage.getItem('article_draft');
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft?.form) form.value = { ...form.value, ...draft.form };
    markdownMode.value = !!draft?.markdownMode;
    contentMarkdown.value = draft?.contentMarkdown || '';
    authorList.value = draft?.authorList || [];
    selectedTags.value = draft?.selectedTags || [];
    selectedApps.value = draft?.selectedApps || [];
    fetchAppsByIds(selectedApps.value);
    scheduled.value = draft?.scheduled || null;
    allowComments.value = draft?.allowComments ?? true;
  } catch {}
};

watch([form, contentMarkdown, markdownMode, authorList, selectedTags, selectedApps, scheduled, allowComments], () => {
  persistDraftToLocal();
}, { deep: true });

const snapshotPayload = () => ({
  title: form.value.title,
  content_html: form.value.content_html,
  content_markdown: markdownMode.value ? contentMarkdown.value : '',
  summary: form.value.summary,
  cover_url: form.value.cover_url,
  author_names: authorList.value.join(','),
  status: form.value.status,
  seo_title: form.value.seo_title,
  seo_description: form.value.seo_description,
  seo_keywords: form.value.seo_keywords
});

const startAutoSave = () => {
  stopAutoSave();
  autoSaveTimer = window.setInterval(async () => {
    if (!editingId.value) return;
    const key = JSON.stringify(snapshotPayload());
    if (key === lastSnapshotKey) return;
    lastSnapshotKey = key;
    await createBlogVersion(editingId.value, snapshotPayload());
    autoSaveTip.value = `已自动保存 ${new Date().toLocaleTimeString()}`;
  }, 30000);
};

const stopAutoSave = () => {
  if (autoSaveTimer) window.clearInterval(autoSaveTimer);
  autoSaveTimer = null;
};

const saveSnapshot = async () => {
  if (!editingId.value) return;
  await createBlogVersion(editingId.value, snapshotPayload());
  autoSaveTip.value = `已保存快照 ${new Date().toLocaleTimeString()}`;
};

const openVersions = async (row: Blog) => {
  editingId.value = row.id;
  versions.value = await getBlogVersions(row.id);
  showVersionDialog.value = true;
};

const restoreVersion = async (row: BlogVersion) => {
  if (!editingId.value) return;
  await restoreBlogVersion(editingId.value, row.id);
  ElMessage.success('恢复成功');
  showVersionDialog.value = false;
  fetchList();
};

const selectCompare = (row: BlogVersion) => {
  if (!compareLeft.value) compareLeft.value = row.id;
  else if (!compareRight.value) compareRight.value = row.id;
  else compareLeft.value = row.id;
};

const versionLabel = (row: BlogVersion) => `${row.created_at || ''} ${row.title || ''}`;

const openCompare = () => {
  const left = versions.value.find(v => v.id === compareLeft.value);
  const right = versions.value.find(v => v.id === compareRight.value);
  if (!left || !right) return;
  compareTitleLeft.value = versionLabel(left);
  compareTitleRight.value = versionLabel(right);
  compareHtmlLeft.value = left.content_markdown ? md.render(left.content_markdown || '') : String(left.content_html || '');
  compareHtmlRight.value = right.content_markdown ? md.render(right.content_markdown || '') : String(right.content_html || '');
  showCompareDialog.value = true;
};
</script>

<style>
.article-dialog.is-editor-fullscreen {
  display: flex;
  flex-direction: column;
  margin-top: 60px !important;
  height: calc(100vh - 60px) !important;
  top: 0 !important;
  margin-bottom: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
  left: 0 !important;
  position: absolute !important;
}
.article-dialog.is-editor-fullscreen .el-dialog__body {
  height: calc(100% - 54px);
  display: flex;
  flex-direction: column;
}
.article-dialog.is-editor-fullscreen .el-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .el-form > .el-row {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
</style>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.admin-view { padding-bottom: 12px; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.tag-color { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--el-border-color); }
.summary-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.cover-preview { margin-top: 8px; }

.editor-container {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 16px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
}
.editor-container.is-fullscreen {
  padding: 12px;
}
.article-dialog.is-editor-fullscreen .editor-container {
  flex: 1;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .quill-wrapper,
.article-dialog.is-editor-fullscreen .markdown-row,
.article-dialog.is-editor-fullscreen .markdown-col,
.article-dialog.is-editor-fullscreen .markdown-editor-wrapper,
.article-dialog.is-editor-fullscreen .markdown-preview-wrapper {
  flex: 1;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .markdown-col {
  display: flex;
}
.article-dialog.is-editor-fullscreen .markdown-editor :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .quill-editor :deep(.ql-container) {
  flex: 1;
  min-height: 0;
}
</style>

<style scoped>
.editor-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.recent-uploads { margin-bottom: 12px; }
.recent-title { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.recent-list { display: flex; flex-wrap: wrap; gap: 6px; }
.recent-item { cursor: pointer; }
.editor-label { font-size: 14px; font-weight: 500; color: var(--el-text-color-primary); margin-bottom: 12px; }
.editor-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.quill-wrapper { border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); display: flex; flex-direction: column; min-height: 0; }
.quill-editor :deep(.ql-toolbar) { border: none; border-bottom: 1px solid var(--el-border-color); background: var(--el-fill-color-lighter); border-top-left-radius: 5px; border-top-right-radius: 5px; }
.quill-editor :deep(.ql-container) { border: none; min-height: 320px; font-size: 14px; border-bottom-left-radius: 5px; border-bottom-right-radius: 5px; }
.quill-editor :deep(.ql-editor) { min-height: 300px; padding: 16px; }
.markdown-editor-wrapper, .markdown-preview-wrapper { display: flex; flex-direction: column; height: 100%; background: var(--el-bg-color); border-radius: 6px; overflow: hidden; border: 1px solid var(--el-border-color); }
.sub-label { font-size: 12px; color: var(--el-text-color-secondary); padding: 8px 12px; background: var(--el-fill-color-lighter); border-bottom: 1px solid var(--el-border-color); }
.markdown-editor :deep(.el-textarea__inner) { border: none; border-radius: 0; padding: 12px; font-family: monospace; font-size: 14px; line-height: 1.5; resize: none; min-height: 320px; background-color: var(--el-bg-color); color: var(--el-text-color-primary); }
.md-preview { flex: 1; padding: 12px !important; overflow: auto; font-size: 14px; background-color: transparent !important; min-height: 320px; }

.dialog-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.autosave-tip { color: var(--el-text-color-secondary); font-size: 12px; }
.footer-actions { display: flex; gap: 8px; }
.version-compare-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.compare-container { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.compare-panel { border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.compare-title { padding: 8px 12px; background: var(--el-fill-color-lighter); font-size: 12px; }
.compare-body { padding: 12px; overflow: auto; max-height: 60vh; }

@media (max-width: 768px) {
  .pagination { justify-content: center; }
  .compare-container { grid-template-columns: 1fr; }
}
</style>
