<template>
  <div class="articles-view">
    <div class="page-header">
      <div class="header-content">
        <h2>文章</h2>
        <p class="header-sub">探索技术见解与深度内容</p>
      </div>
    </div>

    <div class="blog-layout">
      <!-- Main Content: Article List -->
      <div class="blog-main">
        <el-skeleton v-if="loading" animated>
          <template #template>
            <div class="blog-post-card skeleton-card" v-for="i in 5" :key="i">
              <el-skeleton-item variant="image" class="skeleton-cover" />
              <div class="skeleton-body">
                <el-skeleton-item variant="h3" style="width: 60%; margin-bottom: 16px;" />
                <el-skeleton-item variant="text" style="width: 40%; margin-bottom: 12px;" />
                <el-skeleton-item variant="text" style="width: 100%;" />
                <el-skeleton-item variant="text" style="width: 100%;" />
                <el-skeleton-item variant="text" style="width: 80%;" />
              </div>
            </div>
          </template>
        </el-skeleton>

        <el-empty v-else-if="filteredItems.length === 0" description="暂无文章" />

        <div v-else class="article-list">
          <article
            class="blog-post-card"
            v-for="item in filteredItems"
            :key="item.id"
            @click="goDetail(item)"
          >
            <div class="post-cover-wrapper" v-if="item.cover_url">
              <el-image
                :src="item.cover_url"
                fit="cover"
                class="post-cover"
                loading="lazy"
              />
            </div>
            
            <div class="post-content">
              <div class="post-meta-top">
                <span class="meta-item category" v-if="item.category_name">
                  {{ item.category_name }}
                </span>
                <span class="meta-item date">{{ formatDate(item.published_at || item.updated_at) }}</span>
              </div>

              <h3 class="post-title">
                {{ item.title }}
                <el-icon v-if="item.has_password" class="lock-icon"><Lock /></el-icon>
              </h3>

              <p class="post-summary" v-if="item.summary">{{ item.summary }}</p>
              <p class="post-summary" v-else>{{ getFallbackSummary(item) }}</p>

              <div class="post-footer">
                <div class="post-author">
                  <el-avatar :size="24" :icon="UserFilled" class="author-avatar" />
                  <span class="author-name">{{ getAuthor(item) }}</span>
                </div>
                
                <div class="post-tags" v-if="getTags(item).length > 0">
                  <span 
                    v-for="tag in getTags(item).slice(0, 3)" 
                    :key="tag.name" 
                    class="post-tag"
                  >
                    #{{ tag.name }}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="blog-sidebar">
        <!-- Search Widget -->
        <div class="sidebar-widget search-widget">
          <el-input
            v-model="keyword"
            placeholder="搜索文章..."
            :prefix-icon="Search"
            clearable
            class="sidebar-search"
          />
        </div>

        <!-- Categories Widget -->
        <div class="sidebar-widget">
          <h4 class="widget-title">分类</h4>
          <ul class="category-list">
            <li 
              :class="['category-item', { active: categoryFilter === null }]"
              @click="categoryFilter = null"
            >
              <span>全部文章</span>
              <span class="count">{{ items.length }}</span>
            </li>
            <li 
              v-for="cat in categories" 
              :key="cat.id"
              :class="['category-item', { active: categoryFilter === cat.id }]"
              @click="categoryFilter = cat.id"
            >
              <span>{{ cat.name }}</span>
              <!-- Note: We'd need to calculate counts per category for real accuracy, omitting for now or can compute -->
            </li>
          </ul>
        </div>

        <!-- Tags Widget -->
        <div class="sidebar-widget">
          <h4 class="widget-title">标签</h4>
          <div class="tag-cloud">
            <span
              :class="['tag-item', { active: tagFilter === null }]"
              @click="tagFilter = null"
            >
              全部
            </span>
            <span
              v-for="tag in tags"
              :key="tag.id"
              :class="['tag-item', { active: tagFilter === tag.id }]"
              @click="tagFilter = tag.id"
              :style="tagFilter === tag.id && tag.color ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' } : {}"
            >
              {{ tag.name }}
            </span>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import { getPublicBlogCategories, getPublicBlogTags, getPublicBlogs, type Blog, type BlogCategory, type BlogTag } from '../services/api';
import { Lock, Search, UserFilled } from '@element-plus/icons-vue';

defineOptions({ name: 'ArticlesView' });

const router = useRouter();
const layoutStore = useLayoutStore();

const loading = ref(true);
const items = ref<Blog[]>([]);
const categories = ref<BlogCategory[]>([]);
const tags = ref<BlogTag[]>([]);
const categoryFilter = ref<number | null>(null);
const tagFilter = ref<number | null>(null);
const keyword = ref('');

const fetchMeta = async () => {
  categories.value = await getPublicBlogCategories();
  tags.value = await getPublicBlogTags();
};

const fetchList = async () => {
  loading.value = true;
  try {
    items.value = await getPublicBlogs({
      limit: 40,
      category_id: categoryFilter.value || undefined,
      tag_id: tagFilter.value || undefined
    });
  } finally {
    loading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!keyword.value) return items.value;
  const text = keyword.value.trim().toLowerCase();
  return items.value.filter(item => (item.title || '').toLowerCase().includes(text));
});

const getAuthor = (item: Blog) => {
  if (!item.author_names) return '匿名';
  const authors = item.author_names.split(',').map(s => s.trim()).filter(Boolean);
  return authors.length ? authors.join(' / ') : '匿名';
};

const getTags = (item: Blog) => {
  const names = item.tag_names ? item.tag_names.split(',') : [];
  const colors = item.tag_colors ? item.tag_colors.split(',') : [];
  return names.map((name, index) => ({
    name: name.trim(),
    color: (colors[index] || '').trim()
  })).filter(tag => tag.name);
};

const getFallbackSummary = (item: Blog) => {
  const raw = item.content_markdown || item.content_html || '';
  const text = String(raw).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return text ? `${text.slice(0, 120)}${text.length > 120 ? '…' : ''}` : '暂无摘要';
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const goDetail = (item: Blog) => {
  if (!item.slug) return;
  router.push(`/articles/${item.slug}`);
};

onMounted(async () => {
  layoutStore.setPageInfo('文章', false);
  await fetchMeta();
  await fetchList();
});

onUnmounted(() => {
  layoutStore.reset();
});

watch([categoryFilter, tagFilter], fetchList);
</script>

<style scoped>
.articles-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 20px;
}

.page-header {
  margin-bottom: 40px;
  text-align: center;
}

.header-content h2 {
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 12px;
  background: linear-gradient(120deg, var(--el-color-primary), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-sub {
  color: var(--el-text-color-secondary);
  font-size: 16px;
  margin: 0;
}

.blog-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}

/* Main Content Area */
.blog-main {
  flex: 1;
  min-width: 0; /* Prevent flex item overflow */
}

.article-list {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.blog-post-card {
  background: var(--el-bg-color);
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.3s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.blog-post-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  border-color: var(--el-color-primary-light-8);
}

.post-cover-wrapper {
  width: 100%;
  height: 240px;
  overflow: hidden;
  position: relative;
}

.post-cover {
  width: 100%;
  height: 100%;
  transition: transform 0.5s ease;
}

.blog-post-card:hover .post-cover {
  transform: scale(1.05);
}

.post-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.post-meta-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.meta-item.category {
  color: var(--el-color-primary);
  font-weight: 600;
  background: var(--el-color-primary-light-9);
  padding: 2px 8px;
  border-radius: 4px;
}

.post-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 12px;
  line-height: 1.4;
  color: var(--el-text-color-primary);
  transition: color 0.2s;
}

.blog-post-card:hover .post-title {
  color: var(--el-color-primary);
}

.lock-icon {
  margin-left: 6px;
  vertical-align: middle;
  color: var(--el-color-warning);
}

.post-summary {
  color: var(--el-text-color-regular);
  font-size: 15px;
  line-height: 1.6;
  margin: 0 0 20px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.post-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.post-author {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.author-avatar {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}

.post-tags {
  display: flex;
  gap: 8px;
}

.post-tag {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: color 0.2s;
}

.post-tag:hover {
  color: var(--el-color-primary);
}

/* Sidebar */
.blog-sidebar {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: sticky;
  top: 80px; /* Adjust based on header height */
}

.sidebar-widget {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--el-border-color-lighter);
}

.widget-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.category-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--el-text-color-regular);
  transition: all 0.2s;
  font-size: 14px;
}

.category-item:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.category-item.active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 500;
}

.category-item .count {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  background: var(--el-fill-color);
  padding: 2px 6px;
  border-radius: 10px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-item {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.tag-item:hover {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.tag-item.active {
  background: var(--el-color-primary);
  color: white;
}

/* Skeleton styles */
.skeleton-card {
  height: 400px;
  margin-bottom: 30px;
}
.skeleton-cover {
  width: 100%;
  height: 240px;
}
.skeleton-body {
  padding: 24px;
}

@media (max-width: 900px) {
  .blog-layout {
    flex-direction: column;
  }
  
  .blog-sidebar {
    width: 100%;
    position: static;
  }
  
  .post-cover-wrapper {
    height: 200px;
  }
}

@media (max-width: 600px) {
  .articles-view {
    padding: 20px 16px;
  }
  
  .header-content h2 {
    font-size: 26px;
  }
  
  .post-content {
    padding: 16px;
  }
  
  .post-title {
    font-size: 18px;
  }
}
</style>
