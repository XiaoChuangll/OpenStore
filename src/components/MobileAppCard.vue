<template>
  <div class="mobile-app-card" @click="handleClick">
    <div class="mobile-card-top">
      <img 
        :src="app.icon_url || app.icon || '/placeholder.png'" 
        :alt="`${app.name} 应用图标`" 
        class="mobile-app-icon" 
        loading="lazy" 
        @error="onIconError"
      />
      <div class="mobile-card-content">
        <div class="mobile-card-header-row">
          <span class="mobile-app-name">{{ app.name }}</span>
        </div>
        <div class="mobile-tags-row">
          <div class="developer-tag-wrapper">
            <el-tag 
              effect="plain" 
              type="info" 
              size="small"
              class="clickable-tag developer-tag"
              @click.stop="handleSearchByDeveloper"
            >
              {{ app.developer_name || app.provider || '未知开发者' }}
            </el-tag>
          </div>
          <el-tag 
            v-if="app.kind_name || app.category"
            effect="plain" 
            size="small"
            class="clickable-tag category-tag"
            @click.stop="handleSearchByKind"
          >
            {{ app.kind_name || app.category }}
          </el-tag>
        </div>
      </div>
    </div>
    
    <div class="mobile-meta-row">
      <div class="meta-left">
        <el-rate
          v-if="rating > 0"
          v-model="rating"
          disabled
          show-score
          text-color="#ff9900"
          score-template="{value}"
          size="small"
        />
        <span v-else class="no-rating">暂无评分</span>
      </div>
      <div class="meta-right">
        <div class="stat-item">
          <el-icon><Download /></el-icon>
          <span>{{ formatCount(app.download_count || app.down_count || 0) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Download } from '@element-plus/icons-vue';

const props = defineProps<{
  app: any;
}>();

const emit = defineEmits(['click', 'search-developer', 'search-kind']);

const rating = computed(() => {
  const val = Number(props.app.average_rating || props.app.score || 0);
  return Number.isNaN(val) ? 0 : val;
});

const handleClick = () => {
  emit('click', props.app);
};

const handleSearchByDeveloper = () => {
  const dev = props.app.developer_name || props.app.provider;
  if (dev) emit('search-developer', dev);
};

const handleSearchByKind = () => {
  const kind = props.app.kind_name || props.app.category;
  if (kind) emit('search-kind', kind);
};

const onIconError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  target.src = '/placeholder.png';
};

const formatCount = (count: number | string) => {
  if (!count) return '0';
  const num = Number(count);
  if (Number.isNaN(num)) return String(count);
  
  if (num > 100000000) return (num / 100000000).toFixed(1) + '亿';
  if (num > 10000) return (num / 10000).toFixed(1) + '万';
  return num.toString();
};
</script>

<style scoped>
.mobile-app-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s;
}

.mobile-app-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.mobile-card-top {
  display: flex;
  align-items: flex-start;
  width: 100%;
  position: relative;
  z-index: 1;
}

.mobile-app-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  margin-right: 12px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-lighter);
}

.mobile-card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.mobile-card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mobile-app-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mobile-tags-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.developer-tag-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-start;
}

.developer-tag {
  max-width: 100%;
}

:deep(.developer-tag .el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
  vertical-align: bottom;
}

.category-tag {
  flex-shrink: 0;
}

.mobile-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.meta-left {
  display: flex;
  align-items: center;
}

.no-rating {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.meta-right {
  display: flex;
  align-items: center;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

:deep(.el-rate) {
  height: auto;
  --el-rate-icon-size: 14px;
  --el-rate-font-size: 12px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .mobile-app-card {
    padding: 10px;
    border-radius: 8px;
  }
  
  .mobile-app-icon {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    margin-right: 10px;
  }
  
  .mobile-app-name {
    font-size: 14px;
  }
  
  .mobile-meta-row {
    margin-top: 8px;
    padding-top: 6px;
  }
}
</style>