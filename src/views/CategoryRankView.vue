<template>
  <div class="category-rank-view">
    <!-- 榜单页签条已提到 App.vue（keep-alive 外面），各榜单页共用同一个 -->
    <div class="content">
      <CategoryGrowthRank />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import { goBackOrHome } from '../utils/route-scroll';
import CategoryGrowthRank from '../components/CategoryGrowthRank.vue';

defineOptions({
  name: 'CategoryRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();
// 返回上一页（通常是首页）：这样首页会从 keep-alive 还原 + 滚动位置也恢复
const goHome = () => goBackOrHome(router);

onActivated(() => {
  layoutStore.setPageInfo('分类榜', true, goHome);
});

onUnmounted(() => {
  layoutStore.reset();
});
</script>

<style scoped>
.category-rank-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

/* 与其它榜单页同一套排布：卡片统一 20px 间距，内部 margin 归零 */
.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.content > :deep(.chart-card) {
  margin-bottom: 0;
}
</style>
