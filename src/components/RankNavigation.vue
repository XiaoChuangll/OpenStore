<template>
  <div class="rank-navigation">
    <el-tabs v-model="activeTab" @tab-change="handleChange" class="rank-nav-tabs" stretch>
      <el-tab-pane label="总下载榜" name="/rank/total" />
      <el-tab-pane label="应用下载增长对比" name="/rank/growth" />
      <el-tab-pane label="鸿蒙应用下载量历史" name="/rank/history" />
      <el-tab-pane label="非华为应用下载榜" name="/rank/non-huawei" />
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
// RankNavigation component
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
const activeTab = ref(route.path);

watch(() => route.path, (newPath) => {
  activeTab.value = newPath;
});

const handleChange = (name: string | number) => {
  router.push(name as string);
};
</script>

<style scoped>
.rank-navigation {
  margin-bottom: 20px;
}
:deep(.el-tabs__nav-wrap::after) {
  height: 1px;
}
</style>
