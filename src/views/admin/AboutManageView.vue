<template>
  <div class="about-manage-view">
    <el-page-header v-if="!embedded" @back="goBack" class="mb-4">
      <template #content>
        <span class="text-large font-600 mr-3"> 关于页面管理 </span>
      </template>
    </el-page-header>

    <el-card>
      <el-form :model="form" label-width="120px" class="about-form">
        <el-row :gutter="20">
          <el-col :md="12" :xs="24">
            <el-form-item label="版本号">
              <el-input v-model="form.version" placeholder="e.g. 1.0.0" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="作者名称">
              <el-input v-model="form.author_name" placeholder="Author Name" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :md="12" :xs="24">
            <el-form-item label="GitHub 链接">
              <el-input v-model="form.author_github" placeholder="https://github.com/..." />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="仓库路径">
              <el-input v-model="form.github_repo" placeholder="owner/repo (e.g. vuejs/core)" />
            </el-form-item>
          </el-col>
          <el-col :md="12" :xs="24">
            <el-form-item label="作者头像">
              <div class="avatar-uploader">
                <el-input v-model="form.author_avatar" placeholder="Image URL" class="mb-2">
                  <template #append>
                    <el-upload
                      :show-file-list="false"
                      :http-request="handleUpload"
                      accept="image/*"
                    >
                      <el-button>上传</el-button>
                    </el-upload>
                  </template>
                </el-input>
                <div v-if="form.author_avatar" class="avatar-preview">
                  <el-image 
                    :src="form.author_avatar" 
                    fit="cover" 
                    style="width: 60px; height: 60px; border-radius: 50%;"
                  />
                </div>
              </div>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="编辑模式">
          <el-radio-group v-model="markdownMode" @change="handleModeChange">
            <el-radio :label="false">富文本编辑器</el-radio>
            <el-radio :label="true">Markdown</el-radio>
          </el-radio-group>
        </el-form-item>

        <div class="editor-container">
          <!-- 富文本编辑器 -->
          <div v-if="!markdownMode" class="editor-section">
            <div class="editor-label">页面内容</div>
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

        <div class="form-actions mt-4">
          <el-button type="primary" @click="save" :loading="saving">保存更改</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { getAboutPage, updateAboutPage, uploadFile, type AboutPage } from '../../services/admin';
import MarkdownIt from 'markdown-it';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

defineProps<{ embedded?: boolean }>();
const router = useRouter();
const goBack = () => router.push('/admin');

const form = ref<AboutPage>({
  id: 1, // Default ID
  version: '',
  author_name: '',
  author_avatar: '',
  author_github: '',
  github_repo: '',
  content_html: '',
  content_markdown: ''
});

const saving = ref(false);
const markdownMode = ref(false);
const contentMarkdown = ref('');

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const markdownPreview = computed(() => md.render(contentMarkdown.value || ''));

// Quill Options
const quillOptions = {
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
  placeholder: '请输入页面内容...',
  theme: 'snow'
};

// Watch for prop change if data is passed via props or ensure fetch happens
const fetchData = async () => {
  try {
    const data = await getAboutPage();
    if (data) {
      form.value = { 
        ...form.value, // Keep defaults
        ...data,
        content_html: data.content_html || '',
        content_markdown: data.content_markdown || ''
      };
      
      if (data.content_markdown) {
        contentMarkdown.value = data.content_markdown;
        markdownMode.value = true;
      } else {
        markdownMode.value = false;
        // If content_html is empty, maybe set a default for better UX?
      }
    }
  } catch (e) {
    ElMessage.error('获取数据失败');
  }
};

onMounted(() => {
  fetchData();
});

const handleModeChange = (val: boolean) => {
  if (val && form.value.content_html && !contentMarkdown.value) {
    // Simple HTML to Markdown fallback if needed, or just let user start fresh
    contentMarkdown.value = form.value.content_html.replace(/<[^>]*>/g, '');
  }
};

const handleUpload = async (options: any) => {
  try {
    const res = await uploadFile(options.file);
    form.value.author_avatar = res.url;
    ElMessage.success('上传成功');
  } catch (e) {
    ElMessage.error('上传失败');
  }
};

const save = async () => {
  saving.value = true;
  try {
    // Clean up github_repo
    if (form.value.github_repo) {
      let repo = form.value.github_repo.trim();
      try {
        const urlObj = new URL(repo);
        if (urlObj.hostname === 'github.com') {
          repo = urlObj.pathname.substring(1);
        }
      } catch (e) {
        // Not a URL
      }
      form.value.github_repo = repo.replace(/\.git$/, '');
    }

    if (markdownMode.value) {
      form.value.content_markdown = contentMarkdown.value;
      form.value.content_html = md.render(contentMarkdown.value || '');
    } else {
      form.value.content_markdown = '';
    }
    
    await updateAboutPage(form.value);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.mb-4 { margin-bottom: 20px; }
.mb-2 { margin-bottom: 8px; }
.mt-4 { margin-top: 20px; }
.avatar-uploader {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.avatar-preview {
  display: flex;
  justify-content: flex-start;
}

/* Editor Styles (Copied from AnnouncementsView) */
.editor-container {
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 16px;
  margin-top: 8px;
}
.editor-section { width: 100%; }
.editor-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}
.quill-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
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
  min-height: 400px;
  font-size: 14px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
}
.quill-editor :deep(.ql-editor) {
  min-height: 380px;
  padding: 16px;
}
.markdown-editor-wrapper, .markdown-preview-wrapper {
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
.markdown-editor :deep(.el-textarea__inner) {
  border: none;
  border-radius: 0;
  padding: 12px;
  font-family: monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  min-height: 400px;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
}
.md-preview {
  flex: 1;
  padding: 12px !important;
  overflow: auto;
  font-size: 14px;
  background-color: transparent !important;
  min-height: 400px;
}
</style>
