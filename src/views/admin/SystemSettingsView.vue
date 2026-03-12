<template>
  <div class="admin-page">
    <div class="page-header">
      <h2 class="page-title">主题设置</h2>
    </div>

    <el-row :gutter="24">
      <!-- Settings Column -->
      <el-col :xs="24" :lg="14">
        <el-card class="settings-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>全局配色</span>
              <el-button link type="primary" @click="resetTheme">恢复默认</el-button>
            </div>
          </template>

          <el-form label-position="left">
            <div class="settings-list">
              <!-- Primary Color Item -->
              <div class="setting-item primary-item">
                <div class="setting-info">
                  <div class="setting-label">主色调 (Primary)</div>
                  <div class="setting-desc">用于按钮、链接、激活状态等核心交互元素</div>
                </div>
                <div class="setting-control">
                  <el-color-picker v-model="theme.theme_primary_color" show-alpha />
                  <div class="hex-input-wrapper">
                    <el-input v-model="theme.theme_primary_color" placeholder="#409EFF" />
                  </div>
                </div>
              </div>

              <div class="setting-divider"></div>

              <!-- Functional Colors Grid -->
              <div class="functional-grid">
                <div class="functional-item">
                  <div class="func-header">
                    <span class="dot success"></span>
                    <span class="func-label">成功 (Success)</span>
                  </div>
                  <div class="func-control">
                    <el-color-picker v-model="theme.theme_success_color" show-alpha size="small" />
                    <el-input v-model="theme.theme_success_color" placeholder="#67C23A" size="small" />
                  </div>
                </div>

                <div class="functional-item">
                  <div class="func-header">
                    <span class="dot warning"></span>
                    <span class="func-label">警告 (Warning)</span>
                  </div>
                  <div class="func-control">
                    <el-color-picker v-model="theme.theme_warning_color" show-alpha size="small" />
                    <el-input v-model="theme.theme_warning_color" placeholder="#E6A23C" size="small" />
                  </div>
                </div>

                <div class="functional-item">
                  <div class="func-header">
                    <span class="dot danger"></span>
                    <span class="func-label">危险 (Danger)</span>
                  </div>
                  <div class="func-control">
                    <el-color-picker v-model="theme.theme_danger_color" show-alpha size="small" />
                    <el-input v-model="theme.theme_danger_color" placeholder="#F56C6C" size="small" />
                  </div>
                </div>

                <div class="functional-item">
                  <div class="func-header">
                    <span class="dot info"></span>
                    <span class="func-label">信息 (Info)</span>
                  </div>
                  <div class="func-control">
                    <el-color-picker v-model="theme.theme_info_color" show-alpha size="small" />
                    <el-input v-model="theme.theme_info_color" placeholder="#909399" size="small" />
                  </div>
                </div>
              </div>
            </div>

            <div class="form-actions">
              <el-button type="primary" size="large" @click="saveTheme" :loading="saving" class="save-btn">
                保存配置
              </el-button>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <!-- Preview Column -->
      <el-col :xs="24" :lg="10">
        <div class="preview-container">
          <el-divider content-position="center">实时预览</el-divider>
          
          <!-- Mock Interface -->
          <div class="mock-window">
            <div class="mock-header" :style="{ backgroundColor: previewColors.primary }">
              <div class="mock-dots">
                <span></span><span></span><span></span>
              </div>
              <div class="mock-title">Dashboard</div>
              <div class="mock-user"></div>
            </div>
            
            <div class="mock-body">
              <div class="mock-sidebar">
                <div 
                  class="mock-menu-item" 
                  :class="{ active: activePreviewTab === 'overview' }"
                  :style="activePreviewTab === 'overview' ? { color: previewColors.primary, backgroundColor: fadeColor(previewColors.primary, 0.1) } : {}"
                  @click="activePreviewTab = 'overview'"
                >
                  <div class="mock-icon" :style="activePreviewTab === 'overview' ? { backgroundColor: previewColors.primary } : {}"></div>
                  <span>概览</span>
                </div>
                <div 
                  class="mock-menu-item" 
                  :class="{ active: activePreviewTab === 'analytics' }"
                  :style="activePreviewTab === 'analytics' ? { color: previewColors.primary, backgroundColor: fadeColor(previewColors.primary, 0.1) } : {}"
                  @click="activePreviewTab = 'analytics'"
                >
                  <div class="mock-icon" :style="activePreviewTab === 'analytics' ? { backgroundColor: previewColors.primary } : {}"></div>
                  <span>分析</span>
                </div>
                <div 
                  class="mock-menu-item" 
                  :class="{ active: activePreviewTab === 'settings' }"
                  :style="activePreviewTab === 'settings' ? { color: previewColors.primary, backgroundColor: fadeColor(previewColors.primary, 0.1) } : {}"
                  @click="activePreviewTab = 'settings'"
                >
                  <div class="mock-icon" :style="activePreviewTab === 'settings' ? { backgroundColor: previewColors.primary } : {}"></div>
                  <span>设置</span>
                </div>
              </div>
              
              <div class="mock-content">
                <!-- Overview Tab -->
                <template v-if="activePreviewTab === 'overview'">
                  <!-- Stats Cards -->
                  <div class="mock-stats-row">
                    <div class="mock-stat-card">
                      <div class="stat-value" :style="{ color: previewColors.primary }">98.5%</div>
                      <div class="stat-label">活跃度</div>
                    </div>
                    <div class="mock-stat-card">
                      <div class="stat-value" :style="{ color: previewColors.success }">+12%</div>
                      <div class="stat-label">增长</div>
                    </div>
                  </div>

                  <!-- Components Showcase -->
                  <div class="mock-section">
                    <div class="mock-subtitle">组件示例</div>
                    <div class="mock-buttons">
                      <button class="mock-btn primary" :style="{ backgroundColor: previewColors.primary }">主要按钮</button>
                      <button class="mock-btn success" :style="{ backgroundColor: previewColors.success }">成功</button>
                      <button class="mock-btn warning" :style="{ backgroundColor: previewColors.warning }">警告</button>
                      <button class="mock-btn danger" :style="{ backgroundColor: previewColors.danger }">危险</button>
                    </div>
                    
                    <div class="mock-tags">
                      <span class="mock-tag" :style="{ color: previewColors.primary, borderColor: previewColors.primary, backgroundColor: fadeColor(previewColors.primary, 0.1) }">标签一</span>
                      <span class="mock-tag" :style="{ color: previewColors.success, borderColor: previewColors.success, backgroundColor: fadeColor(previewColors.success, 0.1) }">标签二</span>
                      <span class="mock-tag" :style="{ color: previewColors.warning, borderColor: previewColors.warning, backgroundColor: fadeColor(previewColors.warning, 0.1) }">标签三</span>
                    </div>

                    <div class="mock-alert" :style="{ backgroundColor: fadeColor(previewColors.info, 0.1), borderLeftColor: previewColors.info }">
                      <div class="alert-icon" :style="{ backgroundColor: previewColors.info }"></div>
                      <div class="alert-text" :style="{ color: previewColors.info }">这是一条普通的消息提示</div>
                    </div>
                  </div>
                </template>

                <!-- Analytics Tab -->
                <template v-if="activePreviewTab === 'analytics'">
                  <div class="mock-section">
                    <div class="mock-subtitle">数据趋势</div>
                    <div class="mock-chart-placeholder" :style="{ borderColor: fadeColor(previewColors.primary, 0.3), backgroundColor: fadeColor(previewColors.primary, 0.05) }">
                       <div class="mock-chart-line" :style="{ borderColor: previewColors.primary }"></div>
                    </div>
                  </div>
                  <div class="mock-section">
                    <div class="mock-subtitle">状态分布</div>
                    <div class="mock-progress-list">
                      <div class="mock-progress-item">
                        <div class="mock-progress-label">已完成</div>
                        <div class="mock-progress-bar-bg"><div class="mock-progress-bar" :style="{ width: '80%', backgroundColor: previewColors.success }"></div></div>
                      </div>
                      <div class="mock-progress-item">
                        <div class="mock-progress-label">处理中</div>
                        <div class="mock-progress-bar-bg"><div class="mock-progress-bar" :style="{ width: '45%', backgroundColor: previewColors.primary }"></div></div>
                      </div>
                      <div class="mock-progress-item">
                        <div class="mock-progress-label">异常</div>
                        <div class="mock-progress-bar-bg"><div class="mock-progress-bar" :style="{ width: '15%', backgroundColor: previewColors.danger }"></div></div>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- Settings Tab -->
                <template v-if="activePreviewTab === 'settings'">
                  <div class="mock-card-container">
                    <div class="mock-card">
                      <div class="mock-card-header">
                        <div class="mock-card-title">个人资料</div>
                        <div class="mock-card-btn" :style="{ color: previewColors.primary }">编辑</div>
                      </div>
                      <div class="mock-form-group">
                        <div class="mock-avatar-row">
                          <div class="mock-avatar-large"></div>
                          <div class="mock-avatar-info">
                            <div class="mock-avatar-name">Admin User</div>
                            <div class="mock-avatar-role">Administrator</div>
                          </div>
                        </div>
                        <div class="mock-form-item">
                          <div class="mock-label">用户名</div>
                          <div class="mock-input-styled">admin</div>
                        </div>
                        <div class="mock-form-item">
                          <div class="mock-label">邮箱</div>
                          <div class="mock-input-styled">admin@example.com</div>
                        </div>
                      </div>
                    </div>

                    <div class="mock-card">
                      <div class="mock-card-header">
                        <div class="mock-card-title">偏好设置</div>
                      </div>
                      <div class="mock-list-item">
                        <div class="mock-list-text">
                          <div class="mock-list-title">消息通知</div>
                          <div class="mock-list-desc">接收系统更新通知</div>
                        </div>
                        <div 
                          class="mock-switch" 
                          :style="{ backgroundColor: mockSettings.notifications ? previewColors.primary : '#dcdfe6' }"
                          @click="mockSettings.notifications = !mockSettings.notifications"
                        >
                          <div class="mock-switch-dot" :style="{ transform: mockSettings.notifications ? 'translateX(16px)' : 'translateX(0)' }"></div>
                        </div>
                      </div>
                      <div class="mock-list-item">
                        <div class="mock-list-text">
                          <div class="mock-list-title">自动保存</div>
                          <div class="mock-list-desc">每5分钟自动保存</div>
                        </div>
                        <div 
                          class="mock-switch" 
                          :style="{ backgroundColor: mockSettings.autoSave ? previewColors.primary : '#dcdfe6' }"
                          @click="mockSettings.autoSave = !mockSettings.autoSave"
                        >
                          <div class="mock-switch-dot" :style="{ transform: mockSettings.autoSave ? 'translateX(16px)' : 'translateX(0)' }"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { getSystemSettings, updateSystemSettings } from '../../services/admin';
import { useThemeStore } from '../../stores/theme';

const themeStore = useThemeStore();
const saving = ref(false);
const activePreviewTab = ref('overview');

// Mock state for interactions
const mockSettings = ref({
  notifications: true,
  autoSave: false
});

const theme = ref<Record<string, string>>({
  theme_primary_color: '',
  theme_success_color: '',
  theme_warning_color: '',
  theme_danger_color: '',
  theme_info_color: '',
});

// Helper to simulate fade/alpha color
// Simple hex to rgba approximation for preview
const fadeColor = (hex: string, alpha: number) => {
  if (!hex) return 'rgba(0,0,0,0.1)';
  let c = hex.substring(1).split('');
  if(c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  const r = parseInt(c[0]+c[1], 16);
  const g = parseInt(c[2]+c[3], 16);
  const b = parseInt(c[4]+c[5], 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const previewColors = computed(() => {
  // Use default Element Plus colors if empty
  const primary = theme.value.theme_primary_color || '#409EFF';
  const success = theme.value.theme_success_color || '#67C23A';
  const warning = theme.value.theme_warning_color || '#E6A23C';
  const danger = theme.value.theme_danger_color || '#F56C6C';
  const info = theme.value.theme_info_color || '#909399';
  return { primary, success, warning, danger, info };
});

const loadSettings = async () => {
  try {
    const settings = await getSystemSettings();
    Object.keys(theme.value).forEach(k => {
      if (settings[k]) theme.value[k] = settings[k];
    });
  } catch (e) {
    ElMessage.error('加载设置失败');
  }
};

const saveTheme = async () => {
  saving.value = true;
  try {
    const payload: Record<string, string> = {};
    Object.keys(theme.value).forEach(k => {
      payload[k] = theme.value[k] || ''; 
    });
    
    await updateSystemSettings(payload);
    ElMessage.success('主题配置已保存');
    themeStore.loadThemeSettings();
  } catch (e) {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
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
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
}

.settings-card {
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 16px;
}

/* New List Styles */
.settings-list {
  display: flex;
  flex-direction: column;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
}

.setting-info {
  flex: 1;
  padding-right: 24px;
}

.setting-label {
  font-weight: 600;
  font-size: 15px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.setting-desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hex-input-wrapper {
  width: 140px;
}

.setting-divider {
  height: 1px;
  background-color: var(--el-border-color-lighter);
  margin: 24px 0;
}

/* Functional Colors Grid */
.functional-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.functional-item {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.func-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.success { background-color: #67C23A; }
.dot.warning { background-color: #E6A23C; }
.dot.danger { background-color: #F56C6C; }
.dot.info { background-color: #909399; }

.func-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.func-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-actions {
  margin-top: 32px;
  display: flex;
  justify-content: flex-end;
}

.save-btn {
  min-width: 120px;
}

@media (max-width: 768px) {
  .setting-item {
    flex-direction: column;
    gap: 12px;
  }
  .setting-control {
    width: 100%;
  }
  .hex-input-wrapper {
    flex: 1;
  }
  .functional-grid {
    grid-template-columns: 1fr;
  }
}

/* Preview Styles */
.preview-container {
  position: sticky;
  top: 24px;
}

.mock-window {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(0,0,0,0.08);
  border: 1px solid var(--el-border-color-lighter);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.mock-header {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: white;
}

.mock-dots {
  display: flex;
  gap: 6px;
}
.mock-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
}

.mock-title {
  font-size: 14px;
  font-weight: 500;
}

.mock-user {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255,255,255,0.4);
}

.mock-body {
  display: flex;
  height: 320px;
}

.mock-sidebar {
  width: 60px;
  background: #f8f9fa;
  border-right: 1px solid #eee;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.mock-menu-item {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 9px;
  color: #909399;
  cursor: pointer;
  transition: all 0.2s;
}

.mock-menu-item:hover {
  background: rgba(0,0,0,0.02);
}

.mock-menu-item.active {
  font-weight: 600;
}

/* Mock Chart */
.mock-chart-placeholder {
  height: 80px;
  border: 1px dashed;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  padding-bottom: 10px;
}

.mock-chart-line {
  width: 100%;
  height: 40px;
  border-top: 2px solid;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  transform: scaleX(1.5);
}

/* Mock Progress */
.mock-progress-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mock-progress-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mock-progress-label {
  font-size: 11px;
  width: 40px;
  color: #606266;
}
.mock-progress-bar-bg {
  flex: 1;
  height: 6px;
  background: #f0f2f5;
  border-radius: 3px;
  overflow: hidden;
}
.mock-progress-bar {
  height: 100%;
  border-radius: 3px;
}

/* Mock Settings Card */
.mock-card-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #f5f7fa;
  padding: 16px;
  margin: -20px;
  /* Ensure it fills height and allows scroll if needed */
  min-height: calc(100% + 40px);
  overflow-y: auto;
}

.mock-content {
  flex: 1;
  padding: 20px;
  background: #fff;
  overflow-y: auto;
  position: relative;
}

.mock-card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  overflow: hidden;
}

.mock-card-header {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mock-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.mock-card-btn {
  font-size: 12px;
  cursor: pointer;
}

.mock-form-group {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mock-avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.mock-avatar-large {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #e4e7ed;
}

.mock-avatar-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.mock-avatar-role {
  font-size: 12px;
  color: #909399;
}

.mock-input-styled {
  font-size: 13px;
  color: #606266;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 4px;
  border: 1px solid transparent;
}

.mock-form-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mock-label {
  font-size: 12px;
  color: #606266;
}

.mock-switch {
  width: 32px;
  height: 16px;
  border-radius: 8px;
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 2px;
  /* justify-content: flex-end; Removed to allow absolute positioning logic or transform */
  cursor: pointer;
  transition: background-color 0.3s;
}

.mock-switch-dot {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.3s;
}

.mock-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f5f7fa;
}

.mock-list-item:last-child {
  border-bottom: none;
}

.mock-list-title {
  font-size: 13px;
  color: #303133;
  margin-bottom: 2px;
}

.mock-list-desc {
  font-size: 11px;
  color: #909399;
}

/* Dark mode for new elements */
html.dark .mock-card-container {
  background: #141414;
}
html.dark .mock-card {
  background: #1d1e1f;
  box-shadow: none;
  border: 1px solid #303030;
}
html.dark .mock-card-header,
html.dark .mock-list-item {
  border-color: #303030;
}
html.dark .mock-card-title,
html.dark .mock-avatar-name,
html.dark .mock-list-title {
  color: #E5EAF3;
}
html.dark .mock-input-styled {
  background: #262727;
  color: #cfd3dc;
}
html.dark .mock-avatar-large {
  background: #303030;
}

.mock-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: #dcdfe6;
}

.mock-content {
  flex: 1;
  padding: 20px;
  background: #fff;
}

.mock-stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.mock-stat-card {
  flex: 1;
  background: #fcfcfc;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
}

.mock-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mock-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.mock-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mock-btn {
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.mock-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mock-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid;
}

.mock-alert {
  padding: 10px;
  border-radius: 4px;
  border-left: 3px solid;
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.alert-text {
  font-size: 12px;
}

/* Dark mode overrides for preview container (not mock window content) */
html.dark .mock-window {
  background: #1d1e1f;
  border-color: #363637;
}

html.dark .mock-sidebar {
  background: #2b2b2c;
  border-color: #363637;
}

html.dark .mock-content {
  background: #1d1e1f;
}

html.dark .mock-stat-card {
  background: #262727;
  border-color: #363637;
}

html.dark .mock-subtitle {
  color: #e5eaf3;
}
</style>