<template>
  <div class="admin-page settings-page">
    <div class="page-header">
      <h2 class="page-title">主题设置</h2>
      <p class="page-subtitle">调整全站品牌配色，保存后立即生效</p>
    </div>

    <div class="settings-grid">
      <!-- 颜色变量 -->
      <section class="section-card">
        <div class="section-head">
          <div class="section-left">
            <span class="section-title">颜色变量</span>
            <span class="meta-chip">{{ TOKENS.length }} 项</span>
          </div>
          <div class="head-right">
            <span v-if="isDirty" class="meta-chip is-dirty">未保存</span>
            <el-button size="small" :icon="RefreshLeft" :disabled="!hasCustomColor" @click="resetTheme">
              恢复默认
            </el-button>
            <el-button size="small" type="primary" :icon="Check" :loading="saving" @click="saveTheme">
              保存配置
            </el-button>
          </div>
        </div>

        <ul class="token-list">
          <li v-for="token in TOKENS" :key="token.key" class="token-row">
            <span class="token-dot" :style="{ backgroundColor: colorOf(token) }"></span>
            <div class="token-text">
              <span class="token-head">
                <span class="token-name">{{ token.label }}</span>
                <span v-if="!theme[token.key]" class="meta-chip token-default">默认</span>
              </span>
              <span class="token-desc">{{ token.desc }}</span>
            </div>
            <div class="token-control">
              <el-color-picker
                size="small"
                :model-value="colorOf(token)"
                :predefine="PRESET_COLORS"
                @change="(value: string | null) => onPickColor(token, value)"
              />
              <el-input
                v-model="theme[token.key]"
                size="small"
                class="hex-input"
                maxlength="9"
                spellcheck="false"
                :placeholder="colorOf(token)"
              />
            </div>
          </li>
        </ul>

        <div class="preset-bar">
          <span class="preset-label">预设配色</span>
          <button
            v-for="preset in PRESETS"
            :key="preset.name"
            type="button"
            class="preset-chip"
            :class="{ 'is-active': activePreset === preset.name }"
            @click="applyPreset(preset)"
          >
            <i class="preset-swatch">
              <span v-for="color in preset.colors" :key="color" :style="{ backgroundColor: color }"></span>
            </i>
            <span class="preset-name">{{ preset.name }}</span>
          </button>
        </div>
      </section>

      <!-- 组件预览：把颜色放进一段真实的后台片段里，比单摆控件更接近实际观感 -->
      <section class="section-card preview-card" :style="previewVars">
        <div class="section-head">
          <div class="section-left">
            <span class="section-title">组件预览</span>
            <span class="meta-chip">跟随左侧数值</span>
          </div>
        </div>

        <div class="preview-panel">
          <!-- 工具条 -->
          <div class="preview-toolbar">
            <el-input
              v-model="mock.keyword"
              size="small"
              class="preview-search"
              placeholder="搜索任务"
              :prefix-icon="Search"
              clearable
            />
            <el-button type="primary" size="small" :icon="Plus">新增</el-button>
            <el-button size="small" plain>导出</el-button>
            <el-button type="danger" size="small" link :icon="Delete">删除</el-button>
          </div>

          <!-- 列表 -->
          <ul class="preview-list">
            <li v-for="row in PREVIEW_ROWS" :key="row.name" class="preview-item">
              <span class="row-dot" :class="`is-${row.tone}`"></span>
              <span class="row-name">{{ row.name }}</span>
              <span class="row-sub">{{ row.sub }}</span>
              <el-tag :type="row.tone" size="small" effect="light">{{ row.status }}</el-tag>
              <el-button type="primary" size="small" link>编辑</el-button>
            </li>
          </ul>

          <!-- 反馈与数据 -->
          <div class="preview-metrics">
            <div class="metric">
              <span class="metric-label">存储用量</span>
              <el-progress
                :percentage="68"
                :stroke-width="6"
                :show-text="false"
                :color="theme.theme_primary_color"
                class="metric-bar"
              />
              <span class="metric-value">68%</span>
            </div>
            <el-switch v-model="mock.enabled" size="small" active-text="实时同步" />
          </div>

          <el-alert type="success" :closable="false" show-icon title="配色保存后立即对全站生效" />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Check, Delete, Plus, RefreshLeft, Search } from '@element-plus/icons-vue';
import { getSystemSettings, updateSystemSettings } from '../../services/admin';
import { useThemeStore } from '../../stores/theme';
import { buildColorVars, THEME_COLOR_TOKENS } from '../../utils/theme-color';

/**
 * 站点设计系统的默认配色（见 src/style.css）。
 * 注意：明暗两套默认色不一样（深色下主色是 #6ea8fe 而不是 #2563EB），
 * 所以「恢复默认」不能写死这组色值，而是清空自定义、交还给样式表里的默认值。
 */
const SITE_DEFAULT_COLORS: Record<string, string> = {
  theme_primary_color: '#2563EB',
  theme_success_color: '#2F9E63',
  theme_warning_color: '#C88A2E',
  theme_danger_color: '#C94F4F',
  theme_info_color: '#64748B',
};

const TOKENS = [
  { key: 'theme_primary_color', name: 'primary', label: '主色调', desc: '按钮、链接、激活状态' },
  { key: 'theme_success_color', name: 'success', label: '成功色', desc: '提交成功、运行正常' },
  { key: 'theme_warning_color', name: 'warning', label: '警告色', desc: '待处理、需要注意' },
  { key: 'theme_danger_color', name: 'danger', label: '危险色', desc: '删除、异常与错误' },
  { key: 'theme_info_color', name: 'info', label: '信息色', desc: '中性说明与次要信息' },
];

const PRESET_COLORS = [
  '#2563EB', '#2F9E63', '#C88A2E', '#C94F4F', '#64748B',
  '#7C5CFF', '#14B8A6', '#F97316', '#EF4444', '#64748B',
];

const PRESETS = [
  // 站点默认 = 不写自定义色，让明暗两套默认色各自生效
  { name: '站点默认', colors: ['#2563EB', '#2F9E63', '#C88A2E', '#C94F4F', '#64748B'], values: ['', '', '', '', ''] },
  { name: '靛青', colors: ['#4F46E5', '#10B981', '#F59E0B', '#F43F5E', '#64748B'], values: ['#4F46E5', '#10B981', '#F59E0B', '#F43F5E', '#64748B'] },
  { name: '松绿', colors: ['#14B8A6', '#22C55E', '#EAB308', '#EF4444', '#6B7280'], values: ['#14B8A6', '#22C55E', '#EAB308', '#EF4444', '#6B7280'] },
  { name: '紫罗兰', colors: ['#7C5CFF', '#22C55E', '#F59E0B', '#EC4899', '#8B95A5'], values: ['#7C5CFF', '#22C55E', '#F59E0B', '#EC4899', '#8B95A5'] },
  { name: '石墨', colors: ['#475569', '#16A34A', '#D97706', '#DC2626', '#94A3B8'], values: ['#475569', '#16A34A', '#D97706', '#DC2626', '#94A3B8'] },
];

const PREVIEW_ROWS = [
  { name: '应用更新同步', sub: '每天 03:00', status: '已完成', tone: 'success' },
  { name: '公告定时发布', sub: '今天 12:00', status: '排队中', tone: 'warning' },
  { name: '访问日志清理', sub: '每周一', status: '已暂停', tone: 'info' },
] as const;

const themeStore = useThemeStore();
const saving = ref(false);
const savedTheme = ref<Record<string, string>>({});
const mock = reactive({ enabled: true, view: 'overview', keyword: '' });

// 空字符串 = 未自定义，直接使用样式表里的站点默认色
const theme = ref<Record<string, string>>({
  theme_primary_color: '',
  theme_success_color: '',
  theme_warning_color: '',
  theme_danger_color: '',
  theme_info_color: '',
});

/** 该项真正生效的颜色：自定义值优先，否则取当前明暗模式下样式表里的默认值 */
const colorOf = (token: { key: string; name: string }) => {
  const custom = theme.value[token.key];
  if (custom) return custom;

  // 读实时值，切换明暗模式后会重新计算
  void themeStore.isDark;
  const live = getComputedStyle(document.documentElement)
    .getPropertyValue(`--el-color-${token.name}`)
    .trim();
  return live || SITE_DEFAULT_COLORS[token.key];
};

const hasCustomColor = computed(() => TOKENS.some((token) => !!theme.value[token.key]));

/** 颜色选择器清空（value = null）等于回到站点默认 */
const onPickColor = (token: { key: string }, value: string | null) => {
  theme.value[token.key] = value || '';
};

/**
 * 预览卡片直接用主题变量，所以这里放进去的梯度要和全站一致。
 * 未自定义的项不写变量，直接继承当前明暗模式下真正生效的颜色，
 * 免得深色模式下预览和实际对不上。
 */
const previewVars = computed(() => {
  const vars: Record<string, string> = {};
  THEME_COLOR_TOKENS.forEach(({ key, name }) => {
    const value = theme.value[key];
    if (!value) return;
    Object.assign(vars, buildColorVars(name, value, themeStore.isDark));
  });
  return vars;
});

const isDirty = computed(() =>
  TOKENS.some((token) => (theme.value[token.key] || '') !== (savedTheme.value[token.key] || ''))
);

const activePreset = computed(() => {
  const preset = PRESETS.find((item) =>
    THEME_COLOR_TOKENS.every(
      ({ key }, index) => (theme.value[key] || '').toUpperCase() === item.values[index].toUpperCase()
    )
  );
  return preset?.name ?? '';
});

const applyPreset = (preset: (typeof PRESETS)[number]) => {
  THEME_COLOR_TOKENS.forEach(({ key }, index) => {
    theme.value[key] = preset.values[index];
  });
};

const loadSettings = async () => {
  try {
    const settings = await getSystemSettings();
    const next: Record<string, string> = {};
    TOKENS.forEach((token) => {
      // 服务器上留空表示「用站点默认色」，这里保持原样，不要再写死具体色值
      next[token.key] = settings[token.key] || '';
    });
    theme.value = next;
    savedTheme.value = { ...next };
  } catch (e) {
    ElMessage.error('加载设置失败');
  }
};

const saveTheme = async () => {
  saving.value = true;
  try {
    const payload: Record<string, string> = {};
    TOKENS.forEach((token) => {
      payload[token.key] = theme.value[token.key] || '';
    });

    await updateSystemSettings(payload);
    savedTheme.value = { ...theme.value };
    ElMessage.success('主题配置已保存');
    themeStore.loadThemeSettings();
  } catch (e) {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
};

const resetTheme = () => {
  TOKENS.forEach((token) => {
    theme.value[token.key] = '';
  });
};

onMounted(() => {
  loadSettings();
});
</script>

<style scoped>
.page-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

/* 侧边栏 + 内边距占掉约 230px，1024 的视口刚好够并排放下两栏 */
@media (min-width: 1024px) {
  .settings-grid {
    grid-template-columns: minmax(0, 1.04fr) minmax(0, 1fr);
  }
}

.section-card {
  padding: 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background-color: var(--el-bg-color-overlay);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: nowrap;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.section-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.meta-chip {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: var(--el-fill-color-light);
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-chip.is-dirty {
  color: var(--el-color-warning);
  background-color: var(--el-color-warning-light-9);
}

/* 未自定义的项：跟输入框占位色一致，弱化处理 */
.token-default {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--el-border-color-lighter);
  background-color: transparent;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

/* 颜色变量 */
.token-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.token-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}

.token-row + .token-row {
  border-top: 1px dashed var(--el-border-color-lighter);
}

.token-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--el-fill-color-light);
}

.token-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}

.token-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.token-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.token-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.hex-input {
  width: 104px;
}

.hex-input :deep(.el-input__inner) {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  letter-spacing: 0.2px;
}

/* 预设配色 */
.preset-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.preset-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.preset-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background-color: transparent;
  font-size: 12px;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.preset-chip:hover {
  border-color: var(--el-border-color);
  color: var(--el-text-color-primary);
}

.preset-chip.is-active {
  border-color: var(--el-color-primary-light-5);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.preset-swatch {
  display: inline-flex;
  height: 14px;
  border-radius: 4px;
  overflow: hidden;
}

.preset-swatch span {
  width: 9px;
  height: 100%;
}

.preset-name {
  white-space: nowrap;
}

/* 组件预览：一段迷你后台片段 */
.preview-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-search {
  width: 168px;
  max-width: 100%;
}

.preview-list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  transition: background-color 0.16s ease;
}

.preview-item + .preview-item {
  border-top: 1px solid var(--el-border-color-lighter);
}

.preview-item:hover {
  background-color: var(--el-fill-color-lighter);
}

.row-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.row-dot.is-success { background-color: var(--el-color-success); }
.row-dot.is-warning { background-color: var(--el-color-warning); }
.row-dot.is-info { background-color: var(--el-color-info); }

.row-name {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}

.row-sub {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-item :deep(.el-tag),
.preview-item :deep(.el-button) {
  flex: 0 0 auto;
}

.preview-metrics {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.metric {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 180px;
  min-width: 0;
}

.metric-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.metric-bar {
  flex: 1 1 auto;
  min-width: 70px;
}

.metric-value {
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.preview-card :deep(.el-alert) {
  padding: 8px 12px;
}

@media (max-width: 560px) {
  .section-card {
    padding: 14px 12px;
  }

  .token-control {
    margin-left: auto;
  }

  .token-desc {
    display: none;
  }
}
</style>
