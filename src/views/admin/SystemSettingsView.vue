<template>
  <div class="admin-page">
    <div class="card">
      <div class="card-header-row">
        <div class="card-title-block">
          <h3>主题设置</h3>
        </div>
        <div class="card-preview-block">
          <div class="preview-card">
            <div class="preview-header" :style="{ backgroundColor: previewColors.primary }">
              <span class="preview-title">主题预览</span>
            </div>
            <div class="preview-body">
              <div class="preview-row">
                <span class="preview-tag" :style="{ backgroundColor: previewColors.primary }">主要</span>
                <span class="preview-tag" :style="{ backgroundColor: previewColors.success }">成功</span>
                <span class="preview-tag" :style="{ backgroundColor: previewColors.warning }">警告</span>
                <span class="preview-tag" :style="{ backgroundColor: previewColors.danger }">危险</span>
              </div>
              <div class="preview-row">
                <button class="preview-button" :style="{ backgroundColor: previewColors.primary }">
                  按钮示例
                </button>
                <span class="preview-chip" :style="{ borderColor: previewColors.info, color: previewColors.info }">
                  信息提示
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-grid">
        <div class="form-item">
          <label>主题色 (Primary)</label>
          <div class="color-picker-row">
            <el-color-picker v-model="theme.theme_primary_color" show-alpha />
            <el-input v-model="theme.theme_primary_color" placeholder="默认蓝色" />
          </div>
        </div>
        <div class="form-item">
          <label>成功色 (Success)</label>
          <div class="color-picker-row">
            <el-color-picker v-model="theme.theme_success_color" show-alpha />
            <el-input v-model="theme.theme_success_color" placeholder="默认绿色" />
          </div>
        </div>
        <div class="form-item">
          <label>警告色 (Warning)</label>
          <div class="color-picker-row">
            <el-color-picker v-model="theme.theme_warning_color" show-alpha />
            <el-input v-model="theme.theme_warning_color" placeholder="默认橙色" />
          </div>
        </div>
        <div class="form-item">
          <label>危险色 (Danger)</label>
          <div class="color-picker-row">
            <el-color-picker v-model="theme.theme_danger_color" show-alpha />
            <el-input v-model="theme.theme_danger_color" placeholder="默认红色" />
          </div>
        </div>
        <div class="form-item">
          <label>信息色 (Info)</label>
          <div class="color-picker-row">
            <el-color-picker v-model="theme.theme_info_color" show-alpha />
            <el-input v-model="theme.theme_info_color" placeholder="默认灰色" />
          </div>
        </div>
      </div>
      
      <div class="actions">
        <el-button type="primary" @click="saveTheme">保存设置</el-button>
        <el-button @click="resetTheme">重置表单</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { getSystemSettings, updateSystemSettings } from '../../services/admin';
import { useThemeStore } from '../../stores/theme';

const themeStore = useThemeStore();
const theme = ref<Record<string, string>>({
  theme_primary_color: '',
  theme_success_color: '',
  theme_warning_color: '',
  theme_danger_color: '',
  theme_info_color: '',
});

const previewColors = computed(() => {
  const rootStyle = getComputedStyle(document.documentElement);
  const primary = theme.value.theme_primary_color || rootStyle.getPropertyValue('--el-color-primary').trim() || '#409EFF';
  const success = theme.value.theme_success_color || rootStyle.getPropertyValue('--el-color-success').trim() || '#67C23A';
  const warning = theme.value.theme_warning_color || rootStyle.getPropertyValue('--el-color-warning').trim() || '#E6A23C';
  const danger = theme.value.theme_danger_color || rootStyle.getPropertyValue('--el-color-danger').trim() || '#F56C6C';
  const info = theme.value.theme_info_color || rootStyle.getPropertyValue('--el-color-info').trim() || '#909399';
  return { primary, success, warning, danger, info };
});

const loadSettings = async () => {
  try {
    const settings = await getSystemSettings();
    // Fill theme refs
    Object.keys(theme.value).forEach(k => {
      if (settings[k]) theme.value[k] = settings[k];
    });
  } catch (e) {
    ElMessage.error('加载设置失败');
  }
};

const saveTheme = async () => {
  try {
    const payload: Record<string, string> = {};
    Object.keys(theme.value).forEach(k => {
      payload[k] = theme.value[k] || ''; // Send empty string if cleared
    });
    
    await updateSystemSettings(payload);
    ElMessage.success('保存成功');
    // Reload theme in store to apply immediately
    themeStore.loadThemeSettings();
  } catch (e) {
    ElMessage.error('保存失败');
  }
};

const resetTheme = () => {
  theme.value = {
    theme_primary_color: '',
    theme_success_color: '',
    theme_warning_color: '',
    theme_danger_color: '',
    theme_info_color: '',
  };
};

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.admin-page {
  padding: 20px;
  max-width: 920px;
  margin: 0 auto;
}
.card {
  background: var(--el-bg-color);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
}
.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
}
.card-title-block h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
}
.tip {
  margin-bottom: 4px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
.card-preview-block {
  flex-shrink: 0;
}
.preview-card {
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
  min-width: 260px;
  max-width: 320px;
  background: var(--el-fill-color-light);
}
.preview-header {
  padding: 10px 14px;
  color: #fff;
}
.preview-title {
  font-size: 14px;
  font-weight: 600;
}
.preview-body {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.preview-tag {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  white-space: nowrap;
}
.preview-button {
  border: none;
  outline: none;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: #fff;
  cursor: default;
}
.preview-chip {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  border-width: 1px;
  border-style: solid;
  background-color: transparent;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin-top: 8px;
}
.form-item {
  width: 100%;
}
.form-item label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.color-picker-row .el-color-picker {
  flex-shrink: 0;
}
.color-picker-row .el-color-picker__trigger {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  padding: 0;
  box-shadow: 0 0 0 1px var(--el-border-color-lighter);
}
.color-picker-row .el-color-picker__color-inner {
  border-radius: 6px;
}
.color-picker-row .el-input {
  flex: 1;
}
.color-picker-row .el-input__wrapper {
  width: 100%;
}
.actions {
  margin-top: 30px;
  display: flex;
  gap: 10px;
}
.actions .el-button + .el-button {
  margin-left: 0;
}
@media (max-width: 900px) {
  .card-header-row {
    flex-direction: column;
  }
  .card-preview-block {
    width: 100%;
  }
  .preview-card {
    max-width: 100%;
  }
}
@media (max-width: 768px) {
  .admin-page {
    padding: 12px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .actions {
    flex-direction: column;
    align-items: stretch;
  }
  .actions .el-button {
    width: 100%;
  }
}
</style>
