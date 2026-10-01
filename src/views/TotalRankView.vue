<template>
  <div class="total-rank-view">
    <!-- 榜单页签条已提到 App.vue（keep-alive 外面），四个榜单页共用同一个，切换时下划线才滑得动 -->
    <div class="content">
      <!-- 参考开源数据页的堆叠用量图 + 名次清单 -->
      <TopAppsStackedChart />
      <TotalDownloadRank />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import { goBackOrHome } from '../utils/route-scroll';
import TotalDownloadRank from '../components/TotalDownloadRank.vue';
import TopAppsStackedChart from '../components/TopAppsStackedChart.vue';

defineOptions({
  name: 'TotalRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();
// 返回上一页（通常是首页）：这样首页会从 keep-alive 还原 + 滚动位置也恢复
const goHome = () => goBackOrHome(router);

onActivated(() => {
  layoutStore.setPageInfo('总榜', true, goHome);
});

onUnmounted(() => {
  layoutStore.reset();
});
</script>

<style scoped>
.total-rank-view {
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

/*
  卡片之间统一留 20px 间距。
  .chart-card 自己带 margin-bottom: 20px（原来是块级排列时用的），
  这里改成交互统一的 flex gap，并把内部那个 margin 归零，避免出现 0 / 20 / 40 三种间距。
*/
.content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.content > :deep(.chart-card) {
  margin-bottom: 0;
}
</style>
