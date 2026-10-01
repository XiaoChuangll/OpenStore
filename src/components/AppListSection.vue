<template>
  <div class="mt-4">
    <AppListCard />
  </div>
</template>

<script setup lang="ts">
// 首页「应用列表」板块：保留原有的 mt-4 间距容器
import AppListCard from './AppListCard.vue';
</script>

<style scoped>
.mt-4 {
  margin-top: 20px;
}
</style>
