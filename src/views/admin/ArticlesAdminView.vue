<template>
  <div class="admin-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 文章管理 </span>
      </template>
    </el-page-header>

    <!-- 文章分类 / 标签管理：宽度够时并排，窄屏自动堆叠 -->
    <div class="meta-grid">
    <div class="section-card">
      <div class="section-head">
        <div class="section-left">
          <span class="section-title">文章分类</span>
          <span class="section-count">{{ categories.length }} 个</span>
        </div>
        <el-button size="small" :icon="Plus" @click="openCreateCategory">新增分类</el-button>
      </div>
      <div v-if="categories.length" class="meta-list">
        <div v-for="row in categories" :key="row.id" class="meta-item">
          <span class="meta-name">{{ row.name }}</span>
          <div class="meta-actions">
            <el-button link type="primary" :icon="Edit" @click="editCategory(row)" />
            <el-button link type="danger" :icon="Delete" @click="removeCategory(row)" />
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">还没有分类，先建一个分类再写文章。</p>
    </div>

    <!-- 标签管理 -->
    <div class="section-card">
      <div class="section-head">
        <div class="section-left">
          <span class="section-title">标签管理</span>
          <span class="section-count">{{ tags.length }} 个</span>
        </div>
        <el-button size="small" :icon="Plus" @click="openCreateTag">新增标签</el-button>
      </div>
      <div v-if="tags.length" class="meta-list">
        <div v-for="row in tags" :key="row.id" class="meta-item">
          <span class="tag-dot" :style="{ backgroundColor: row.color || 'var(--el-fill-color)' }"></span>
          <span class="meta-name">{{ row.name }}</span>
          <span v-if="row.group_name" class="meta-chip-text">{{ row.group_name }}</span>
          <span class="meta-chip-text">热度 {{ row.usage_count ?? 0 }}</span>
          <div class="meta-actions">
            <el-button link type="primary" :icon="Edit" @click="editTag(row)" />
            <el-button link type="danger" :icon="Delete" @click="removeTag(row)" />
          </div>
        </div>
      </div>
      <p v-else class="empty-hint">还没有标签。</p>
    </div>
    </div>

    <!-- 文章列表 -->
    <div class="section-card">
      <div class="section-head">
        <div class="section-left">
          <span class="section-title">文章列表</span>
          <span class="section-count">共 {{ total }} 篇</span>
        </div>
        <el-button type="primary" size="small" :icon="Plus" @click="openCreate">新增文章</el-button>
      </div>

      <div class="filter-bar">
        <el-input
          v-model="searchKeyword"
          class="filter-search"
          size="small"
          clearable
          placeholder="搜索文章标题"
          @keyup.enter="applyFilter"
          @clear="applyFilter"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="categoryFilter" size="small" class="filter-select" clearable placeholder="全部分类" @change="applyFilter">
          <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="tagFilter" size="small" class="filter-select" clearable placeholder="全部标签" @change="applyFilter">
          <el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id" />
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
        <el-table-column label="文章" min-width="150">
          <template #default="{ row }">
            <div class="title-cell">
              <span class="title-text">{{ row.title || '未命名文章' }}</span>
              <span class="title-sub">
                {{ row.category_name || '未分类' }}
                <template v-if="row.tag_names"> · {{ row.tag_names }}</template>
                <template v-if="row.slug"> · /{{ row.slug }}</template>
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="!isMobile" label="状态" min-width="96">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column v-if="!isMobile" label="发布时间" min-width="140">
          <template #default="{ row }">
            <span :class="{ 'muted-text': !row.published_at }">
              {{ row.published_at ? formatDateTime(row.published_at) : '未发布' }}
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
              <el-button v-else size="small" type="warning" plain @click="offline(row)">下线</el-button>
              <el-button size="small" text @click="openVersions(row)">版本</el-button>
              <el-button link type="danger" :icon="Delete" @click="remove(row)" />
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <div class="table-empty">
            <span>{{ hasFilter ? '没有符合条件的文章' : '还没有文章' }}</span>
            <el-button v-if="!hasFilter" size="small" type="primary" plain @click="openCreate">新增文章</el-button>
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
    </div>

    <el-dialog v-model="showDialog" :title="dialogTitle" :width="isMobile ? '100%' : '980px'" :fullscreen="isMobile || fullScreen" :class="['article-dialog', { 'is-editor-fullscreen': fullScreen || isMobile }]">
      <el-form label-position="top" :model="form" class="article-form">
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
              <el-select
                v-model="seoKeywordsList"
                multiple
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                placeholder="输入关键词并按回车添加"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>

          <el-col :md="12" :xs="24">
            <el-form-item label="评论开关">
              <el-switch v-model="allowComments" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="密码保护">
              <el-input 
                v-model="form.password" 
                :placeholder="articleHasPassword ? '已设密码，留空则保持不变' : '可选，留空为公开'" 
                show-password 
                autocomplete="new-password"
                name="article-password"
              />
              <el-checkbox
                v-if="articleHasPassword"
                v-model="removeArticlePassword"
                class="password-remove-check"
              >
                移除密码
              </el-checkbox>
            </el-form-item>
          </el-col>

          <el-col :span="24">
            <div class="editor-container" :class="{ 'is-fullscreen': fullScreen }">
              <div class="editor-tools">
                <span class="editor-tools-label">正文</span>
                <el-radio-group v-model="markdownMode" size="small" class="editor-mode-switch" @change="handleModeChange">
                  <el-radio-button :value="false">富文本</el-radio-button>
                  <el-radio-button :value="true">Markdown</el-radio-button>
                </el-radio-group>
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
                  <div 
                    v-for="item in recentUploads" 
                    :key="item.url" 
                    class="recent-item-wrapper" 
                    @click="insertUpload(item)"
                    :title="item.name"
                  >
                    <el-image 
                      :src="item.url" 
                      class="recent-item-img" 
                      fit="cover" 
                      loading="lazy"
                    >
                      <template #error>
                        <div class="image-slot">
                          <el-icon><Picture /></el-icon>
                        </div>
                      </template>
                    </el-image>
                  </div>
                </div>
              </div>

              <div v-if="!markdownMode" class="editor-section">
                <div class="quill-wrapper">
                  <QuillEditor ref="quillRef" v-model:content="form.content_html" contentType="html" theme="snow" class="quill-editor" :options="quillOptions" />
                </div>
              </div>

              <div v-else class="editor-section markdown-section">
                <el-row :gutter="16" class="markdown-row">
                  <el-col :xs="24" :md="12" class="markdown-col">
                    <div class="markdown-editor-wrapper">
                      <div class="sub-label">编辑区域</div>
                      <!--
                        不要用 autosize：它会按内容把 textarea 撑高（内联 height），
                        而外层容器是固定高度 + overflow: hidden，超出的内容会被裁掉又滚不动。
                        这里固定填满容器，由 textarea 自己内部滚动。
                      -->
                      <el-input ref="markdownInputRef" type="textarea" v-model="contentMarkdown" class="markdown-editor" placeholder="在此编写 Markdown 内容" resize="none" />
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
        <div class="dialog-footer">
          <div class="autosave-tip" v-if="autoSaveTip">{{ autoSaveTip }}</div>
          <div class="footer-actions">
            <el-button @click="showDialog=false">取消</el-button>
            <el-button @click="saveSnapshot" :disabled="!editingId">保存快照</el-button>
            <el-button type="primary" @click="save">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="showCatDialog" :title="catDialogTitle" :width="isMobile ? '90%' : '500px'">
      <el-form label-position="top" :model="catForm">
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
      <el-form label-position="top" :model="tagForm">
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
        <el-table-column prop="created_at" label="时间" min-width="140" />
        <el-table-column prop="title" label="标题" />
        <el-table-column label="操作" min-width="160">
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
import { getBlogCategories, createBlogCategory, updateBlogCategory, deleteBlogCategory, getBlogTags, createBlogTag, updateBlogTag, deleteBlogTag, getBlogs, createBlog, updateBlog, deleteBlog, publishBlog, offlineBlog, getBlogVersions, createBlogVersion, restoreBlogVersion, uploadFile, getApps, type BlogCategory, type BlogTag, type Blog, type BlogVersion, type AppItem } from '../../services/admin';
import { searchApps as searchNextApps } from '../../services/next-api';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import 'github-markdown-css/github-markdown-light.css';
import 'highlight.js/styles/atom-one-light.css';
import 'katex/dist/katex.min.css';
import { useAuthStore } from '../../stores/auth';
import { Picture, Plus, Edit, Delete, Search, Refresh } from '@element-plus/icons-vue';

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
const searchKeyword = ref('');
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
const seoKeywordsList = ref<string[]>([]);

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

/*
 * 文章密码现在只存哈希，后端不再回传原文，所以编辑时输入框是空的：
 * - 留空 + 不勾选「移除密码」 -> 保持原密码
 * - 填入新值               -> 设为新密码
 * - 勾选「移除密码」        -> 清除密码
 */
const articleHasPassword = ref(false);
const removeArticlePassword = ref(false);

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

/* ---------- 列表筛选与展示 ---------- */
const hasFilter = computed(
  () => !!(searchKeyword.value.trim() || status.value || categoryFilter.value || tagFilter.value)
);

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
// 连续改筛选条件时只认最后一次请求
let listRequestSeq = 0;
const fetchList = async () => {
  const seq = ++listRequestSeq;
  const data = await getBlogs({
    status: status.value || undefined,
    search: searchKeyword.value.trim() || undefined,
    page: page.value,
    pageSize: pageSize.value,
    category_id: categoryFilter.value || undefined,
    tag_id: tagFilter.value || undefined
  });
  if (seq !== listRequestSeq) return;
  items.value = data.items;
  total.value = data.total;
};

onMounted(async () => {
  await fetchCategories();
  await fetchTags();
  await fetchList();
  await loadRecentUploads();
});
import axios from 'axios';
const getUploads = async () => {
  const token = localStorage.getItem('token');
  const res = await axios.get('/api/uploads', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data.items;
};

const loadRecentUploads = async () => {
  try {
    const files = await getUploads();
    // Only take top 20
    recentUploads.value = files.slice(0, 20).map((f: any) => ({
      name: f.name,
      url: f.url,
      type: 'image' // Assume image for now
    }));
  } catch (e) {
    console.error('Failed to load uploads', e);
  }
};

/** 改筛选条件后回到第一页再查 */
function applyFilter() {
  page.value = 1;
  fetchList();
}

watch(status, applyFilter);
watch([categoryFilter, tagFilter], applyFilter);

// 标题输入即搜：停顿 300ms 再查
let searchTimer: number | undefined;
watch(searchKeyword, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => applyFilter(), 300);
});
onUnmounted(() => window.clearTimeout(searchTimer));

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
  articleHasPassword.value = false;
  removeArticlePassword.value = false;
  scheduled.value = null;
  markdownMode.value = false;
  contentMarkdown.value = '';
  slugEdited.value = false;
  allowComments.value = true;
  authorList.value = authStore.username ? [authStore.username] : [];
  selectedTags.value = [];
  selectedApps.value = [];
  appOptions.value = [];
  seoKeywordsList.value = [];
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
    // 密码不回显（后端只给 has_password 标记），留空即保持不变
    password: ''
  };
  articleHasPassword.value = !!row.has_password;
  removeArticlePassword.value = false;
  scheduled.value = row.scheduled_at || null;
  contentMarkdown.value = row.content_markdown || '';
  markdownMode.value = !!row.content_markdown;
  allowComments.value = row.allow_comments ? Number(row.allow_comments) === 1 : true;
  authorList.value = row.author_names ? row.author_names.split(',').map(s => s.trim()).filter(Boolean) : [];
  seoKeywordsList.value = row.seo_keywords ? row.seo_keywords.split(',').map(s => s.trim()).filter(Boolean) : [];
  const tagIds = Array.isArray(row.tag_ids)
    ? row.tag_ids
    : (row.tag_ids ? row.tag_ids.split(',').map((s: string) => Number(s)) : []);
  selectedTags.value = tagIds;
  
  // Handle related apps (new logic: use apps array from row if available, otherwise fallback)
  // row.apps comes from the API response which now includes the related apps from blog_related_apps table
  if ((row as any).apps && Array.isArray((row as any).apps)) {
    const apps = (row as any).apps;
    // Map apps to options format
    const options = apps.map((app: any) => ({
      id: app.original_id || String(app.id), // Use original_id as key for remote apps
      name: app.name,
      icon_url: app.icon_url,
      provider: app.developer_name,
      kind_name: app.kind_name,
      average_rating: app.average_rating,
      download_count_str: app.download_count_str,
      enabled: 1
    }));
    
    // Add to options
    mergeAppOptions(options);
    
    // Set selected values (use ID string for remote apps)
    selectedApps.value = options.map((o: any) => o.id);
  } else {
    // Fallback for legacy data (app_ids)
    const appIds = Array.isArray((row as any).app_ids) 
      ? (row as any).app_ids
      : ((row as any).app_ids ? (row as any).app_ids.split(',').map((s: string) => Number(s)) : []);
    selectedApps.value = appIds;
    if (appIds.length > 0) {
      fetchAppsByIds(appIds);
    }
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
    
    // Prepare related apps payload (standalone structure)
    const relatedApps = [];
    for (const app of selectedApps.value) {
      if (typeof app === 'number') {
        // Local app ID selected - fetch details to store snapshot
        // Ideally we should have the full app object, but selectedApps only has IDs for local apps
        // We need to find the app in appOptions
        const localApp = appOptions.value.find(a => a.id === app);
        if (localApp) {
          relatedApps.push({
            name: localApp.name,
            icon_url: localApp.icon_url,
            developer_name: (localApp as any).provider || (localApp as any).developer_name,
            kind_name: (localApp as any).kind_name,
            average_rating: String((localApp as any).average_rating || ''),
            download_count_str: (localApp as any).download_count_str || String((localApp as any).download_count || ''),
            original_id: (localApp as any).original_id || String(localApp.id)
          });
        }
      } else if (typeof app === 'string') {
        // It's a remote ID - find in options
        const remoteApp = appOptions.value.find(a => String(a.id) === app);
        if (remoteApp) {
          relatedApps.push({
            name: remoteApp.name,
            icon_url: remoteApp.icon_url,
            developer_name: (remoteApp as any).developer_name || (remoteApp as any).provider,
            kind_name: (remoteApp as any).kind_name || (remoteApp as any).category,
            average_rating: String((remoteApp as any).average_rating || (remoteApp as any).score || ''),
            download_count_str: (remoteApp as any).download_count_str || String((remoteApp as any).download_count || (remoteApp as any).down_count || ''),
            original_id: String(remoteApp.id)
          });
        }
      }
    }

    const tagIds = await resolveTagIds();
    // Update seo_keywords from list
    form.value.seo_keywords = seoKeywordsList.value.join(',');
    
    // We no longer send app_ids, instead we send related_apps
    const payload: Partial<Omit<Blog, 'tag_ids' | 'app_ids'>> & { tag_ids: number[]; related_apps: any[] } = { ...form.value, tag_ids: tagIds, related_apps: relatedApps };

    /*
     * 密码的三态交给后端处理：
     *   勾了「移除密码」-> 发空串（明确清除）
     *   输入了新密码    -> 原样发出（后端存哈希）
     *   留空且没勾选    -> 字段整个不发（保持原密码）
     */
    if (editingId.value) {
      if (removeArticlePassword.value) payload.password = '';
      else if (!payload.password) delete payload.password;
    }

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

// Removed duplicate loadRecentUploads function

const addRecentUpload = (item: { url: string; name: string; type: string }) => {
  // We are now loading from server, so no need to manage local storage recent uploads manually
  // But for immediate feedback, we can add to the list
  const list = recentUploads.value.filter(i => i.url !== item.url);
  list.unshift(item);
  recentUploads.value = list.slice(0, 20);
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
  /* 关键：用列方向，编辑/预览框才能在垂直方向被 flex 撑满 */
  flex-direction: column;
}
/*
 * 双栏等高规则里给 wrapper 写死了 height:320px，全屏时必须让位给 flex，
 * 否则全屏下编辑框还是只有 320px 高，看着像全屏没生效。
 */
.article-dialog.is-editor-fullscreen .markdown-editor-wrapper,
.article-dialog.is-editor-fullscreen .markdown-preview-wrapper {
  height: auto;
  flex: 1 1 auto;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .markdown-editor :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .quill-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.article-dialog.is-editor-fullscreen .quill-editor :deep(.ql-container) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.article-dialog.is-editor-fullscreen .quill-editor :deep(.ql-editor) {
  height: 100%;
  overflow-y: auto;
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
.recent-title { font-size: 14px; font-weight: 500; color: var(--el-text-color-primary); margin-bottom: 8px; }
.recent-list { display: flex; flex-wrap: wrap; gap: 8px; max-height: 120px; overflow-y: auto; padding-bottom: 4px; }
.recent-item-wrapper { width: 60px; height: 60px; border-radius: 4px; overflow: hidden; cursor: pointer; border: 1px solid var(--el-border-color); display: flex; align-items: center; justify-content: center; transition: all 0.2s; position: relative; }
.recent-item-wrapper:hover { border-color: var(--el-color-primary); transform: scale(1.05); z-index: 1; }
.recent-item-img { width: 100%; height: 100%; object-fit: cover; }
.image-slot { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; background: var(--el-fill-color-lighter); color: var(--el-text-color-secondary); }
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

.dialog-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.autosave-tip { margin-right: auto; color: var(--el-text-color-secondary); font-size: 12px; }
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

/* ------------------------------------------------------------------
 * 列表区：分类 / 标签 / 文章列表
 * ------------------------------------------------------------------ */
.section-card {
  margin-bottom: 20px;
  padding: 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-bg-color-overlay);
}

/* 分类 + 标签：一行放得下就并排，放不下自动堆叠（两栏等高） */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.meta-grid .section-card {
  margin-bottom: 0;
}

@media (max-width: 720px) {
  .meta-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-list {
  display: flex;
  flex-direction: column;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  transition: background-color 0.2s ease;
}

.meta-item:hover {
  background-color: var(--el-fill-color-light);
}

.meta-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.meta-chip-text {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.meta-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.empty-hint {
  margin: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.filter-search { width: 240px; max-width: 100%; }
.filter-select { width: 140px; }

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
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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

/* ------------------------------------------------------------------
 * 编辑器弹窗：正文工具条 + Markdown 双栏
 * 放在样式表最后，覆盖前面 `height:100%` / `min-height:320px` 造成的两栏不等高
 * ------------------------------------------------------------------ */
.editor-tools-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-right: 4px;
}

.editor-mode-switch {
  margin-right: 4px;
}

.markdown-col {
  height: auto;
}

.markdown-editor-wrapper,
.markdown-preview-wrapper {
  height: 320px;
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

/* Markdown 预览配色跟随主题（原样式是 GitHub 浅色） */
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

.md-preview :deep(a) { color: var(--el-color-primary); }
.md-preview :deep(code) { color: var(--el-text-color-primary); background-color: var(--el-fill-color); }
.md-preview :deep(pre) { background-color: var(--el-fill-color-light); }
.md-preview :deep(blockquote) { color: var(--el-text-color-secondary); border-left-color: var(--el-border-color); }
.md-preview :deep(hr) { background-color: var(--el-border-color-lighter); }
.md-preview :deep(table tr) { background-color: transparent; border-top-color: var(--el-border-color-lighter); }
.md-preview :deep(table tr:nth-child(2n)) { background-color: var(--el-fill-color-lighter); }
.md-preview :deep(table th), .md-preview :deep(table td) { border-color: var(--el-border-color-lighter); }

/* 富文本：文字与工具栏图标跟随主题 */
.quill-editor :deep(.ql-editor) { color: var(--el-text-color-primary); }
.quill-editor :deep(.ql-editor.ql-blank::before) { color: var(--el-text-color-placeholder); font-style: normal; }
.quill-editor :deep(.ql-snow .ql-stroke) { stroke: var(--el-text-color-regular); }
.quill-editor :deep(.ql-snow .ql-fill),
.quill-editor :deep(.ql-snow .ql-stroke.ql-fill) { fill: var(--el-text-color-regular); }
.quill-editor :deep(.ql-snow .ql-picker),
.quill-editor :deep(.ql-snow .ql-picker-label) { color: var(--el-text-color-regular); }
.quill-editor :deep(.ql-snow .ql-picker-options) { background-color: var(--el-bg-color-overlay); border-color: var(--el-border-color-lighter); }

@media (max-width: 768px) {
  .section-card { padding: 14px 12px; }
  .filter-search { width: 100%; }
  .filter-select { flex: 1 1 140px; width: auto; }
  .markdown-editor-wrapper,
  .markdown-preview-wrapper { height: 260px; }
  .markdown-editor :deep(.el-textarea__inner),
  .md-preview { min-height: 0; }
}
</style>
