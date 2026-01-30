<template>
  <div class="history-rank-view">
    <div class="page-header">
      <div class="header-left">
        <RankNavigation />
      </div>
    </div>
    <div class="content">
      <HistoryChart />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import HistoryChart from '../components/HistoryChart.vue';
import RankNavigation from '../components/RankNavigation.vue';

defineOptions({
  name: 'HistoryRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();

onMounted(() => {
  layoutStore.setPageInfo('鸿蒙应用下载量历史', true, () => router.back());
});

onUnmounted(() => {
  layoutStore.reset();
});
</script>

<style scoped>
.history-rank-view {
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
</style>
