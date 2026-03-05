<template>
  <div class="article-detail-view">
    <el-skeleton v-if="loading" animated>
      <template #template>
        <div class="detail-skeleton">
          <el-skeleton-item variant="image" class="skeleton-cover" />
          <el-skeleton-item variant="h1" style="width: 60%; margin: 20px 0;" />
          <el-skeleton-item variant="text" style="width: 80%; margin-bottom: 8px;" />
          <el-skeleton-item variant="text" style="width: 70%;" />
        </div>
      </template>
    </el-skeleton>

    <div v-else-if="error" class="state-box">
      <el-result icon="error" title="加载失败" :sub-title="error">
        <template #extra>
          <el-button type="primary" @click="retry">重试</el-button>
        </template>
      </el-result>
    </div>

    <div v-else-if="passwordRequired" class="state-box">
      <el-result icon="warning" title="需要访问密码" sub-title="该文章已启用密码保护">
        <template #extra>
          <el-button type="primary" @click="promptPassword">输入密码</el-button>
        </template>
      </el-result>
    </div>

    <div v-else class="article-wrapper">
      <el-image
        v-if="article?.cover_url"
        :src="article.cover_url"
        fit="cover"
        class="detail-cover"
      />
      <div class="article-header">
        <h1 class="article-title">{{ article?.title }}</h1>
        <p v-if="article?.summary" class="article-summary">{{ article.summary }}</p>
        <div class="article-meta">
          <span>{{ authorText }}</span>
          <span>{{ displayDate }}</span>
          <span v-if="article?.category_name">{{ article.category_name }}</span>
        </div>
        <div class="article-tags" v-if="tagList.length">
          <el-tag
            v-for="tag in tagList"
            :key="tag.name"
            size="small"
            :style="tag.color ? { borderColor: tag.color, color: tag.color } : undefined"
          >
            {{ tag.name }}
          </el-tag>
        </div>
      </div>
      <div class="article-content markdown-body" v-html="renderedContent"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import MarkdownIt from 'markdown-it';
import markdownItKatex from 'markdown-it-katex';
import hljs from 'highlight.js';
import 'github-markdown-css/github-markdown.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';
import { getPublicBlogBySlug, type Blog } from '../services/api';
import { useLayoutStore } from '../stores/layout';

defineOptions({ name: 'ArticleDetailView' });

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();

const loading = ref(true);
const article = ref<Blog | null>(null);
const error = ref('');
const passwordRequired = ref(false);

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

const renderedContent = computed(() => {
  if (!article.value) return '';
  if (article.value.content_markdown) {
    return md.render(article.value.content_markdown);
  }
  return article.value.content_html || '';
});

const authorText = computed(() => {
  if (!article.value?.author_names) return '匿名';
  const list = article.value.author_names.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list.join(' / ') : '匿名';
});

const displayDate = computed(() => {
  const dateStr = article.value?.published_at || article.value?.updated_at;
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

const tagList = computed(() => {
  if (!article.value) return [];
  const names = article.value.tag_names ? article.value.tag_names.split(',') : [];
  const colors = article.value.tag_colors ? article.value.tag_colors.split(',') : [];
  return names.map((name, index) => ({
    name: name.trim(),
    color: (colors[index] || '').trim()
  })).filter(tag => tag.name);
});

const fetchDetail = async (password?: string) => {
  const slug = String(route.params.slug || '');
  if (!slug) return;
  loading.value = true;
  error.value = '';
  passwordRequired.value = false;
  try {
    const data = await getPublicBlogBySlug(slug, password);
    article.value = data;
    
    const title = data.title || '文章详情';
    layoutStore.setPageInfo(title, true, () => router.back());
    document.title = `${title} - OpenStore`;

    const description = data.summary || '';
    if (description) {
      const updateMeta = (name: string, content: string) => {
        let el = document.querySelector(`meta[name="${name}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute('name', name);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };
      updateMeta('description', description);
    }
  } catch (err: any) {
    const status = err?.response?.status;
    const message = err?.response?.data?.error;
    if (status === 403 && message === 'password_required') {
      passwordRequired.value = true;
    } else {
      error.value = '无法加载文章内容，请稍后再试';
    }
  } finally {
    loading.value = false;
  }
};

const promptPassword = async () => {
  try {
    const result = await ElMessageBox.prompt('请输入访问密码', '受保护文章', {
      inputType: 'password',
      confirmButtonText: '确认',
      cancelButtonText: '取消'
    });
    if (!result.value) return;
    await fetchDetail(result.value);
  } catch {
    ElMessage.info('已取消输入');
  }
};

const retry = () => {
  fetchDetail();
};

onMounted(() => {
  fetchDetail();
});

onUnmounted(() => {
  layoutStore.reset();
});

watch(() => route.params.slug, () => {
  fetchDetail();
});
</script>

<style scoped>
.article-detail-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}
.detail-skeleton {
  display: flex;
  flex-direction: column;
}
.skeleton-cover {
  width: 100%;
  height: 280px;
  border-radius: 16px;
}
.state-box {
  padding: 40px 0;
}
.article-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.detail-cover {
  width: 100%;
  height: 320px;
  border-radius: 16px;
}
.article-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.article-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}
.article-summary {
  margin: 0;
  font-size: 15px;
  color: var(--el-text-color-secondary);
}
.article-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.article-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.article-content {
  background: var(--el-bg-color);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid var(--el-border-color-lighter);
}
.markdown-body {
  color: var(--el-text-color-primary);
}
.markdown-body :deep(pre) {
  background: #0f172a;
}
.markdown-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--el-border-color);
  padding-left: 12px;
  color: var(--el-text-color-secondary);
}
.markdown-body :deep(img) {
  max-width: 100%;
}
@media (max-width: 768px) {
  .article-detail-view {
    padding: 16px;
  }
  .detail-cover {
    height: 220px;
  }
  .article-title {
    font-size: 22px;
  }
}
</style>
