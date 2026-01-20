<template>
  <div class="placeholder-view">
    <el-empty :description="title + ' 功能开发中'" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const title = computed(() => {
  if (route.path.includes('apps')) return '应用';
  if (route.path.includes('updates')) return '更新';
  return '此';
});
</script>

<style scoped>
.placeholder-view {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60vh;
}
</style>