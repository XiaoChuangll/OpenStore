<template>
  <div class="title-search" :class="{ expanded: open }">
    <div class="search-trigger-wrapper" :class="{ 'is-hidden': open }">
      <el-button class="update-search-trigger" circle :icon="Search" @click="emit('update:open', true)" />
    </div>

    <div class="search-expanded-panel" :class="{ 'is-visible': open }">
      <button type="button" class="search-panel-icon" aria-label="搜索" @click="emit('run')">
        <el-icon><Search /></el-icon>
      </button>

      <el-input
        ref="inputRef"
        :model-value="query"
        placeholder="搜索应用"
        class="search-input-field"
        @update:model-value="(value: string) => emit('update:query', value)"
        @keyup.enter="emit('run')"
      />

      <button type="button" class="search-close-btn" aria-label="关闭搜索" @click="emit('close')">
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </div>

  <!-- 搜索结果正在展示、面板已经收起时，给一个一键退出搜索的按钮 -->
  <el-button
    v-if="active && !open"
    class="search-active-clear"
    circle
    :icon="CircleClose"
    @click="emit('clear')"
  />
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { Search, Close, CircleClose } from '@element-plus/icons-vue';

/*
 * 更新页的搜索框。两个页签（今日上新 / 今日更新）共用同一个，状态归父组件管。
 */
const props = defineProps<{
  open: boolean;
  query: string;
  /** 正在展示搜索结果 */
  active?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  'update:query': [string];
  run: [];
  clear: [];
  close: [];
}>();

const inputRef = ref<any>(null);

// 展开就自动聚焦，调用方不用再管输入框
watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    inputRef.value?.focus?.();
  }
);
</script>

<style scoped>
.title-search {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 40px;
  height: 40px;
  overflow: hidden;
  transition: width 0.3s linear;
  background-color: transparent;
  border-radius: 20px;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.title-search.expanded {
  width: 320px;
  max-width: 100%;
  background-color: var(--el-bg-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--el-border-color-lighter);
}

.title-search.expanded:focus-within {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 3px var(--el-color-primary-light-9), 0 4px 12px rgba(0, 0, 0, 0.1);
}

.search-trigger-wrapper {
  position: absolute;
  right: 0;
  top: 0;
  width: 40px;
  height: 40px;
  transition: opacity 0.2s;
  opacity: 1;
  pointer-events: auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.search-trigger-wrapper.is-hidden {
  opacity: 0;
  pointer-events: none;
}

.update-search-trigger {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
}

.search-expanded-panel {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 6px 0 10px;
  gap: 4px;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
  min-width: 0;
}

.search-expanded-panel.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.search-panel-icon,
.search-close-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}

.search-panel-icon:hover {
  color: var(--el-color-primary);
  background-color: var(--el-fill-color-light);
}

.search-close-btn:hover {
  color: var(--el-text-color-primary);
  background-color: var(--el-fill-color);
}

.search-input-field {
  flex: 1 1 auto;
  min-width: 0;
}

.search-input-field :deep(.el-input-group__prepend) {
  background-color: transparent;
  padding: 0;
  box-shadow: none;
}

.search-input-field :deep(.el-input__wrapper) {
  padding: 0;
  box-shadow: none !important;
  background-color: transparent !important;
}

.search-input-field :deep(.el-input__inner) {
  height: 36px;
  font-size: 13.5px;
  color: var(--el-text-color-primary);
}

.search-input-field :deep(.el-input__inner::placeholder) {
  color: var(--el-text-color-placeholder);
}

.search-input-field :deep(.el-select .el-input__wrapper) {
  box-shadow: none !important;
}

.search-active-clear {
  flex: 0 0 auto;
}
</style>
