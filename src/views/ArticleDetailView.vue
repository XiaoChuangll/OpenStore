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
          <span class="meta-item"><el-icon><User /></el-icon>{{ authorText }}</span>
          <span class="meta-item"><el-icon><Calendar /></el-icon>{{ displayDate }}</span>
          <span v-if="article?.category_name" class="meta-item"><el-icon><Folder /></el-icon>{{ article.category_name }}</span>
          <span v-if="article?.views !== undefined" class="meta-item"><el-icon><View /></el-icon>{{ formatViews(article.views) }} 次阅读</span>
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
      
      <div class="related-apps" v-if="relatedApps.length">
        <h3 class="related-title">关联应用</h3>
        <div class="related-apps-grid">
          <MobileAppCard v-for="app in relatedApps" :key="app.id" :app="app" @click="goAppDetail(app)" />
        </div>
      </div>

      <div class="comments-section" v-if="article?.allow_comments">
        <h3 class="comments-title">
          评论
        </h3>
        <CommentSection :blog-id="article.id" />
      </div>
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
import 'github-markdown-css/github-markdown-light.css';
import 'highlight.js/styles/atom-one-light.css';
import 'katex/dist/katex.min.css';
import { getPublicBlogBySlug, type Blog } from '../services/api';
import { getAppDetail } from '../services/next-api';
import { useLayoutStore } from '../stores/layout';
import MobileAppCard from '../components/MobileAppCard.vue';
import { User, Calendar, Folder, View } from '@element-plus/icons-vue';
import CommentSection from '../components/CommentSection.vue';

defineOptions({ name: 'ArticleDetailView' });

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();

const loading = ref(true);
const article = ref<Blog | null>(null);
const fullAppDetails = ref<Record<string, any>>({});
const error = ref('');
const passwordRequired = ref(false);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true
});
md.set({
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

const formatViews = (views: number) => {
  if (views >= 10000) {
    return (views / 10000).toFixed(1) + '万';
  }
  return views;
};

const tagList = computed(() => {
  if (!article.value) return [];
  const names = article.value.tag_names ? article.value.tag_names.split(',') : [];
  const colors = article.value.tag_colors ? article.value.tag_colors.split(',') : [];
  return names.map((name, index) => ({
    name: name.trim(),
    color: (colors[index] || '').trim()
  })).filter(tag => tag.name);
});

const relatedApps = computed(() => {
  return (article.value?.apps || []).map((app: any) => {
    // Merge local data with remote details if available
    // For apps from standalone table, app.original_id is the key
    // For apps from legacy relation, we also use original_id if available
    const remoteId = app.original_id || String(app.id);
    const remote = fullAppDetails.value[remoteId] || {};
    
    // Check nested structures common in API responses
    const remoteData = remote.data || remote;
    
    return {
      ...app,
      ...remoteData, // Remote details override local ones where applicable
      // Ensure we have valid display fields
      name: remoteData.name || app.name,
      icon_url: remoteData.icon || remoteData.icon_url || app.icon_url || app.icon,
      // API might return 'author' instead of 'developer_name' or 'provider'
      developer_name: remoteData.author || remoteData.developer_name || remoteData.provider || app.provider || app.developer_name,
      // API might return 'download_count' or 'down_count'
      download_count: remoteData.down_count || remoteData.download_count || app.download_count || app.download_count_str || app.down_count,
      // API might return 'rating' object or 'average_rating'
      average_rating: (typeof remoteData.rating === 'object' ? remoteData.rating.average : remoteData.rating) || remoteData.average_rating || remoteData.score || app.average_rating || app.score,
      kind_name: remoteData.kind_name || remoteData.category || app.kind_name || app.category
    };
  });
});

const goAppDetail = (app: any) => {
  const appId = app.original_id || app.id;
  if (appId) {
    // Check if the route uses query parameter (dashboard style) or path parameter (apps/:id style)
    // Based on router config:
    // path: '/dashboard', name: 'app-dashboard' -> uses query param ?app_id=...
    // path: '/apps/:id', name: 'next-app-detail' -> uses path param
    
    // The user mentioned "http://localhost:3000/dashboard?title=..." is wrong
    // And AppDashboardView expects 'app_id' in query
    
    router.push({ 
      name: 'app-dashboard', 
      query: { 
        app_id: appId,
        title: app.name 
      }
    });
  }
};

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

    const description = data.seo_description || data.summary || '';
    const defaultKeywords = 'OpenStore,华为应用市场看板,鸿蒙应用看板,鸿蒙应用数据面板,鸿蒙,应用商店,应用下载,榜单,更新,应用分发';
    let keywords = data.seo_keywords ? data.seo_keywords : title;
    if (keywords) {
      keywords = `${keywords},${defaultKeywords}`;
    } else {
      keywords = defaultKeywords;
    }
    
    const updateMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    if (description) updateMeta('description', description);
    if (keywords) updateMeta('keywords', keywords);

    // Fetch remote details for related apps
    if (data.apps && data.apps.length > 0) {
      data.apps.forEach(async (app: any) => {
        if (app.original_id) {
          try {
            const detail = await getAppDetail(app.original_id);
            if (detail) {
              console.log('Fetched app detail for', app.original_id, detail);
              fullAppDetails.value = {
                ...fullAppDetails.value,
                [app.original_id]: detail
              };
            }
          } catch (e) {
            console.warn('Failed to fetch remote app detail', app.original_id, e);
          }
        }
      });
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
  gap: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  align-items: center;
}
.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
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
.related-apps {
  margin-top: 20px;
}
.comments-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 24px;
}
.related-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
}
.related-apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.comments-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.comments-placeholder {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--el-border-color-lighter);
}

.markdown-body {
  color: var(--el-text-color-primary);
  background-color: transparent;
}
/* Dark mode adaptation for markdown-body */
html.dark .markdown-body {
  color: #c9d1d9;
}
html.dark .markdown-body table tr {
  background-color: #0d1117;
  border-top-color: #30363d;
}
html.dark .markdown-body table tr:nth-child(2n) {
  background-color: #161b22;
}
html.dark .markdown-body table th,
html.dark .markdown-body table td {
  border-color: #30363d;
}
html.dark .markdown-body code {
  background-color: rgba(110, 118, 129, 0.4);
}
html.dark .markdown-body pre {
  background-color: #161b22;
}
html.dark .markdown-body blockquote {
  color: #8b949e;
  border-left-color: #30363d;
}
html.dark .markdown-body hr {
  background-color: #30363d;
}
html.dark .markdown-body a {
  color: #58a6ff;
}
html.dark .markdown-body h1,
html.dark .markdown-body h2,
html.dark .markdown-body h3,
html.dark .markdown-body h4,
html.dark .markdown-body h5,
html.dark .markdown-body h6 {
  color: #c9d1d9;
  border-bottom-color: #21262d;
}
@media (max-width: 768px) {
  .article-detail-view {
    padding: 16px;
  }
}
</style>
