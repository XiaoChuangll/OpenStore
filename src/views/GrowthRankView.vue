<template>
  <div class="growth-rank-view">
    <!-- 榜单页签条已提到 App.vue（keep-alive 外面），四个榜单页共用同一个 -->
    <div class="content">
      <TopAppsStackedChart title="增长最快的应用" rank-by="growth" />
      <GrowthChart />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import { goBackOrHome } from '../utils/route-scroll';
import GrowthChart from '../components/GrowthChart.vue';
import TopAppsStackedChart from '../components/TopAppsStackedChart.vue';

defineOptions({
  name: 'GrowthRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();
// 返回上一页（通常是首页）：这样首页会从 keep-alive 还原 + 滚动位置也恢复
const goHome = () => goBackOrHome(router);

onActivated(() => {
  layoutStore.setPageInfo('飙升榜', true, goHome);
});

onUnmounted(() => {
  layoutStore.reset();
});
</script>

<style scoped>
.growth-rank-view {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}
.header-left {
  flex: 1;
  min-width: 300px;
}

/* 与「总下载榜」页签同一套排布：卡片统一 20px 间距，内部 margin 归零 */
.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.content > :deep(.chart-card) {
  margin-bottom: 0;
}
</style>
