<template>
  <el-page-header v-if="!embedded" class="admin-page-header" @back="goBack">
    <template #content>
      <span class="text-large font-600 mr-3">{{ title }}</span>
    </template>
  </el-page-header>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

/*
 * 后台子页面标题栏（返回箭头 + 标题）。
 * embedded 时不渲染（外层统一画标题）；返回统一回后台首页，可用 back-to 覆盖。
 */
const props = withDefaults(
  defineProps<{ title: string; embedded?: boolean; backTo?: string }>(),
  { embedded: false, backTo: '/admin' }
);

const router = useRouter();
const goBack = () => router.push(props.backTo);
</script>

<style scoped>
/* 原来每个页面各自写一份 .mb-4，现在统一收进组件 */
.admin-page-header {
  margin-bottom: 20px;
}
</style>
