<template>
  <div class="topic-detail-view">
    <div v-if="loading" class="loading-state">
      <el-skeleton :rows="5" animated />
    </div>
    
    <div v-else-if="error" class="error-state">
      <el-result
        icon="error"
        title="获取专题失败"
        :sub-title="error"
      >
        <template #extra>
          <el-button type="primary" @click="fetchDetail">重试</el-button>
          <el-button @click="router.back()">返回</el-button>
        </template>
      </el-result>
    </div>

    <div v-else-if="topic" class="topic-content">
      <div class="topic-header">
        <h1 class="topic-title">{{ topic.title }}</h1>
        <p class="topic-subtitle" v-if="topic.subtitle">{{ topic.subtitle }}</p>
        <div class="topic-meta">
          <span class="date">发布于 {{ formatDate(topic.created_at) }}</span>
        </div>
        <div class="topic-description" v-if="topic.comment">
          {{ topic.comment }}
        </div>
      </div>

      <div class="apps-grid">
        <AppCard
          v-for="app in topic.apps"
          :key="app.app_id"
          :app="app"
          @click="goToApp(app)"
        />
      </div>
      
      <el-empty v-if="!topic.apps || topic.apps.length === 0" description="暂无应用" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTopicDetail, type FullSubstanceInfo } from '../services/api';
import AppCard from '../components/AppCard.vue';
import { useLayoutStore } from '../stores/layout';

const route = useRoute();
const router = useRouter();
const layoutStore = useLayoutStore();

const topic = ref<FullSubstanceInfo | null>(null);
const loading = ref(true);
const error = ref('');

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const fetchDetail = async () => {
  const id = route.params.id as string;
  if (!id) return;

  loading.value = true;
  error.value = '';

  try {
    const data = await getTopicDetail(id);
    topic.value = data;
    
    // Set page title
    layoutStore.setPageInfo(data.title || '专题详情', true, () => router.back());
    document.title = `${data.title || '专题详情'} - OpenStore`;
  } catch (err: any) {
    console.error(err);
    error.value = '无法加载专题详情，请稍后再试';
  } finally {
    loading.value = false;
  }
};

const goToApp = (app: any) => {
  if (app.app_id) {
    router.push({
      path: `/apps/${app.app_id}`,
      query: { title: app.name }
    });
  }
};

onMounted(() => {
  fetchDetail();
});
</script>

<style scoped>
.topic-detail-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.loading-state, .error-state {
  padding: 40px;
}

.topic-header {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.back-btn {
  margin-bottom: 10px;
  padding-left: 0;
}

.topic-title {
  font-size: 28px;
  margin: 10px 0;
  color: var(--el-text-color-primary);
}

.topic-subtitle {
  font-size: 18px;
  color: var(--el-text-color-secondary);
  margin-bottom: 10px;
}

.topic-meta {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 20px;
}

.topic-description {
  font-size: 16px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  padding: 15px;
  border-radius: 8px;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 32px;
  margin-top: 32px;
}

@media (max-width: 768px) {
  .apps-grid {
    grid-template-columns: 1fr;
  }
}
</style>
