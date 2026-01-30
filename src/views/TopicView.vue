<template>
  <div class="topic-list-view">
    <div class="page-header">
      <h1>精选专题</h1>
      <p>发现更多优质应用集合</p>
    </div>

    <div v-if="loading && topics.length === 0" class="loading-state">
      <el-skeleton :rows="3" :count="3" animated />
    </div>

    <div v-else-if="error" class="error-state">
      <el-result icon="error" title="获取专题失败" :sub-title="error">
         <template #extra>
          <el-button type="primary" @click="refresh">重试</el-button>
        </template>
      </el-result>
    </div>

    <div v-else class="topics-container">
      <div class="topics-grid">
        <el-card
          v-for="topic in topics"
          :key="topic.substance_id"
          class="topic-card"
          shadow="hover"
          @click="goToDetail(topic)"
        >
          <div class="topic-card-content">
            <div class="card-header">
               <h3 class="topic-title">{{ topic.title }}</h3>
               <el-tag size="small" effect="plain">专题</el-tag>
            </div>
            <p class="topic-subtitle">{{ topic.subtitle || '暂无介绍' }}</p>
            <div class="topic-footer">
              <span class="date">{{ formatDate(topic.created_at) }}</span>
              <el-button link type="primary" class="view-btn">
                查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
              </el-button>
            </div>
          </div>
        </el-card>
      </div>
      
      <div class="load-more" v-if="hasMore">
          <el-button :loading="loading" @click="loadMore" round>加载更多</el-button>
      </div>
      
      <el-empty v-if="!loading && topics.length === 0" description="暂无专题" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { getTopics, type ShortSubstanceInfo } from '../services/api';
import { ArrowRight } from '@element-plus/icons-vue';

defineOptions({
  name: 'TopicView'
});

const router = useRouter();

const topics = ref<ShortSubstanceInfo[]>([]);
const loading = ref(false);
const error = ref('');
// Looking at api.ts snippet in summary: "export const getTopics = async (page: number = 0, ..."
// It defaults to 0. So I should start at 0.
const currentPage = ref(0);
const pageSize = 20;
const total = ref(0);

const hasMore = computed(() => {
  return topics.value.length < total.value;
});

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const fetchTopics = async (reset = false) => {
  if (reset) {
    currentPage.value = 0;
    topics.value = [];
  }
  
  loading.value = true;
  error.value = '';

  try {
    const res = await getTopics(currentPage.value, pageSize);
    if (reset) {
      topics.value = res.data;
    } else {
      topics.value = [...topics.value, ...res.data];
    }
    total.value = res.total;
  } catch (err: any) {
    console.error(err);
    error.value = '无法加载专题列表';
  } finally {
    loading.value = false;
  }
};

const loadMore = () => {
  currentPage.value++;
  fetchTopics();
};

const refresh = () => {
  fetchTopics(true);
};

const goToDetail = (topic: any) => {
  router.push({
    path: `/topics/${topic.substance_id}`,
    query: { title: topic.title }
  });
};

onMounted(() => {
  fetchTopics(true);
});
</script>

<style scoped>
.topic-list-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  margin-bottom: 30px;
  text-align: center;
}

.page-header h1 {
  font-size: 32px;
  margin-bottom: 10px;
  color: var(--el-text-color-primary);
}

.page-header p {
  color: var(--el-text-color-secondary);
  font-size: 16px;
}

.topics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.topic-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-radius: 12px;
  border: none;
  background: var(--el-bg-color-overlay);
}

.topic-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.topic-card-content {
  padding: 10px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.topic-title {
  font-size: 20px;
  margin: 0;
  color: var(--el-text-color-primary);
  font-weight: 600;
  line-height: 1.4;
}

.topic-subtitle {
  color: var(--el-text-color-regular);
  margin-bottom: 20px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 44px; /* Approximate height for 2 lines */
  font-size: 15px;
}

.topic-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 15px;
}

.date {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.load-more {
  text-align: center;
  margin-top: 40px;
  margin-bottom: 40px;
}

@media (max-width: 768px) {
  .topics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
