<template>
  <div class="app-card" @click="handleClick">
    <div class="app-icon-wrapper">
      <el-image 
        :src="app.icon_url || app.icon" 
        class="app-icon" 
        loading="lazy"
        fit="cover"
      >
        <template #error>
          <div class="icon-placeholder">
            <el-icon><Picture /></el-icon>
          </div>
        </template>
      </el-image>
    </div>
    
    <div class="app-info">
      <h3 class="app-name" :title="app.name">{{ app.name }}</h3>
      <p class="app-category" v-if="app.brief_desc || app.kind_name || app.category" :title="app.brief_desc || app.kind_name || app.category">
        {{ app.brief_desc || app.kind_name || app.category }}
      </p>
      <div class="app-meta">
        <span class="version" v-if="app.version || app.versionName || app.version_name">
          {{ app.version || app.versionName || app.version_name }}
        </span>
        <span class="downloads" v-if="app.down_count || app.download_count || app.download_count_str || app.down_count_desc">
          {{ app.down_count || app.download_count || app.download_count_str || app.down_count_desc }}次下载
        </span>
      </div>
    </div>
    
    <div class="time-badge" v-if="showTimeBadge && timeAgo">
      {{ timeAgo }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Picture } from '@element-plus/icons-vue';

const props = defineProps<{
  app: any;
  showTimeBadge?: boolean;
  timeField?: string;
}>();

const emit = defineEmits(['click']);

const timeAgo = computed(() => {
  const time =
    (props.timeField ? props.app?.[props.timeField] : null) ??
    props.app.release_date ??
    props.app.listed_at ??
    props.app.update_time ??
    props.app.created_at;
  if (!time) return '';
  
  // Handle timestamp robustly (string/number)
  let dateVal: number;
  if (typeof time === 'number') {
    dateVal = time;
  } else if (typeof time === 'string' && /^\d+$/.test(time)) {
    dateVal = parseInt(time, 10);
  } else {
    dateVal = new Date(time).getTime();
  }
  
  if (!dateVal || isNaN(dateVal)) return '';
  
  // If timestamp is in seconds (e.g., 10 digits), convert to ms
  if (dateVal < 10000000000) {
    dateVal *= 1000;
  }
  
  const date = new Date(dateVal);
  const now = new Date();
  
  // Calculate difference
  const diffMs = now.getTime() - date.getTime();
  
  // Handle future dates (if any clock skew or timezone confusion)
  // But generally diffMs should be positive for past events.
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) {
    return '刚刚';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 30) {
    return `${diffDays}天前`;
  } else {
    // For older items, maybe show date? Or just "x months ago"
    // Keeping it simple as "x days ago" or format date
    return `${diffDays}天前`;
  }
});

const handleClick = () => {
  emit('click', props.app);
};
</script>

<style scoped>
.app-card {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  height: 100%;
}

.app-card:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color-light);
}

.app-icon-wrapper {
  margin-bottom: 0;
  margin-right: 12px;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
  background: transparent;
  flex-shrink: 0;
}

.app-icon {
  width: 100%;
  height: 100%;
}

.icon-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  font-size: 20px;
}

.app-info {
  flex: 1;
  width: auto;
  margin-bottom: 0;
  min-width: 0; /* Enable truncation */
  padding-right: 8px;
}

.app-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.6;
}

.app-category {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.6;
}

.app-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  flex-wrap: nowrap;
  min-width: 0;
}

.downloads {
  white-space: nowrap;
  flex: 0 0 auto;
}

.version {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.2;
  font-weight: 500;
  border: 1px solid var(--el-color-primary-light-8);
}

.time-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  margin-left: auto;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid var(--el-color-primary-light-8);
}
</style>
