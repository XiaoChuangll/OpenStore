<template>
  <div class="total-rank-view">
    <div class="page-header">
      <div class="header-left">
        <RankNavigation />
      </div>
    </div>
    <div class="content">
      <TotalDownloadRank />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useLayoutStore } from '../stores/layout';
import TotalDownloadRank from '../components/TotalDownloadRank.vue';
import RankNavigation from '../components/RankNavigation.vue';

defineOptions({
  name: 'TotalRankView'
});

const router = useRouter();
const layoutStore = useLayoutStore();
const goHome = () => router.push('/');

onMounted(() => {
  layoutStore.setPageInfo('总下载榜', true, goHome);
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
</style>
