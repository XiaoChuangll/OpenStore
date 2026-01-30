<template>
  <div class="growth-rank-view">
    <div class="page-header">
      <div class="header-left">
        <RankNavigation />
      </div>
    </div>
    <div class="content">
      <GrowthChart />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import GrowthChart from '../components/GrowthChart.vue';
import RankNavigation from '../components/RankNavigation.vue';

defineOptions({
  name: 'GrowthRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();
const goHome = () => router.push('/');

onMounted(() => {
  layoutStore.setPageInfo('应用下载增长对比', true, goHome);
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
</style>
