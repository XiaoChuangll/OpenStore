<template>
  <div class="non-huawei-rank-view">
    <div class="page-header">
      <div class="header-left">
        <RankNavigation />
      </div>
    </div>
    <div class="content">
      <NonHuaweiChart />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import NonHuaweiChart from '../components/NonHuaweiChart.vue';
import RankNavigation from '../components/RankNavigation.vue';

defineOptions({
  name: 'NonHuaweiRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();

onMounted(() => {
  layoutStore.setPageInfo('非华为应用下载榜', true, () => router.back());
});

onUnmounted(() => {
  layoutStore.reset();
});
</script>

<style scoped>
.non-huawei-rank-view {
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
