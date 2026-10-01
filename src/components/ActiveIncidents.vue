<template>
  <!--
    数据没回来之前先占好位置（骨架），别再让首屏顶部空一块、
    等其它图表加载完才「冒」出来。
  -->
  <div v-if="loading" class="active-incidents" aria-hidden="true">
    <article class="incident-card is-skeleton">
      <header class="incident-head">
        <span class="sk sk-icon"></span>
        <div class="head-main">
          <span class="sk sk-title"></span>
          <span class="sk sk-pill"></span>
        </div>
      </header>
      <div class="sk-body">
        <span class="sk sk-line"></span>
        <span class="sk sk-line"></span>
        <span class="sk sk-line"></span>
        <span class="sk sk-line is-short"></span>
      </div>
      <footer class="incident-foot">
        <span class="sk sk-meta"></span>
      </footer>
    </article>
  </div>

  <div v-else-if="incidents.length > 0" class="active-incidents">
    <article
      v-for="item in incidents"
      :key="item.id"
      class="incident-card"
      :class="`tone-${getTone(item)}`"
    >
      <header class="incident-head">
        <span class="type-icon">
          <el-icon><component :is="itemIcon(item)" /></el-icon>
        </span>

        <div class="head-main">
          <h3 class="incident-title">{{ item.title }}</h3>
          <span class="status-pill">
            <i class="status-dot"></i>{{ getStatusText(item) }}
          </span>
        </div>
      </header>

      <div
        v-if="item.content"
        class="incident-body markdown-body"
        v-html="renderMarkdown(item.content)"
      ></div>

      <footer class="incident-foot">
        <span v-if="item.start_time" class="meta-item">开始 {{ formatTime(item.start_time) }}</span>
        <span v-if="item.end_time" class="meta-item">预计结束 {{ formatTime(item.end_time) }}</span>
        <span class="meta-item">更新于 {{ formatTime(item.updated_at) }}</span>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getActiveIncidents, type Incident } from '../services/api';
import {
  WarningFilled, Tools, InfoFilled, BellFilled, Promotion, ChatDotRound,
  Link, Download, Clock, CircleCheckFilled, Star, Trophy, Setting, Monitor
} from '@element-plus/icons-vue';
import { marked } from 'marked';

const incidents = ref<Incident[]>([]);
const loading = ref(true);

const fetchIncidents = async () => {
  try {
    incidents.value = await getActiveIncidents();
  } catch {
    incidents.value = [];
  } finally {
    loading.value = false;
  }
};

/** 状态文案：提示类型说「展示中 / 已结束」，故障/维护沿用故障流程的说法 */
const getStatusText = (item: Incident) => {
  if (item.type === 'notice') {
    return item.status === 'resolved' ? '已结束' : '展示中';
  }
  const map: Record<string, string> = {
    investigating: '正在调查',
    identified: '已确认',
    monitoring: '正在观察',
    resolved: '已解决',
    scheduled: '计划维护'
  };
  return map[item.status] || item.status;
};

// 卡片配色基调：先看状态，再回退到公告类型
const getTone = (item: Incident) => {
  // 「提示」是轻量说明，不跟着故障状态变红：展示中是绿色，结束后转灰
  if (item.type === 'notice') return item.status === 'resolved' ? 'info' : 'success';
  switch (item.status) {
    case 'resolved': return 'success';
    case 'identified': return 'warning';
    case 'monitoring': return 'primary';
    case 'scheduled': return 'info';
    case 'investigating': return 'danger';
    default: return item.type === 'maintenance' ? 'primary' : 'danger';
  }
};

/*
 * 卡片标题前的图标：后台可以自己挑（存的是图标名），
 * 没挑就按类型给默认值：故障=警告、维护=工具、提示=信息。
 */
const ICON_MAP: Record<string, any> = {
  WarningFilled,
  Tools,
  InfoFilled,
  BellFilled,
  Promotion,
  ChatDotRound,
  Link,
  Download,
  Clock,
  CircleCheckFilled,
  Star,
  Trophy,
  Setting,
  Monitor
};

const itemIcon = (item: Incident) => {
  const picked = item.icon ? ICON_MAP[item.icon] : null;
  if (picked) return picked;
  if (item.type === 'maintenance') return Tools;
  if (item.type === 'notice') return InfoFilled;
  return WarningFilled;
};

const formatTime = (seconds: number) => new Date(seconds * 1000).toLocaleString();

const renderMarkdown = (text: string) => {
  return marked(text || '');
};

onMounted(() => {
  fetchIncidents();
});
</script>

<style scoped>
.active-incidents {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}

/* ---------- 加载骨架：形状与真实卡片一致，先占位 ---------- */
.incident-card.is-skeleton {
  --tone-color: var(--el-text-color-placeholder);
}

.sk {
  display: block;
  border-radius: 6px;
  background: var(--el-fill-color);
  animation: sk-pulse 1.4s ease-in-out infinite;
}

.sk-icon { width: 30px; height: 30px; border-radius: 8px; flex: 0 0 auto; }
.sk-title { width: 132px; height: 15px; }
.sk-pill { width: 74px; height: 20px; border-radius: 999px; }
.sk-body { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 12px; }
.sk-line { width: 100%; height: 13px; }
.sk-line.is-short { width: 46%; }
.sk-meta { width: 210px; height: 11px; }

@keyframes sk-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ---------- 卡片外观 ---------- */

.incident-card {
  --tone-color: var(--el-color-danger);
  --tone-bg: var(--el-color-danger-light-9);

  position: relative;
  padding: 16px 20px 14px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  /* 与探索页其它卡片统一为 16px 圆角 */
  border-radius: 16px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tone-color) 7%, var(--el-bg-color)) 0%,
      var(--el-bg-color) 58%
    );
  box-shadow: var(--el-box-shadow-light);
}

.tone-danger { --tone-color: var(--el-color-danger); --tone-bg: var(--el-color-danger-light-9); }
.tone-warning { --tone-color: var(--el-color-warning); --tone-bg: var(--el-color-warning-light-9); }
.tone-primary { --tone-color: var(--el-color-primary); --tone-bg: var(--el-color-primary-light-9); }
.tone-success { --tone-color: var(--el-color-success); --tone-bg: var(--el-color-success-light-9); }
.tone-info { --tone-color: var(--el-color-info); --tone-bg: var(--el-color-info-light-9); }

/* ---------- 头部：类型图标 + 标题 + 状态 ---------- */

.incident-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.type-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid color-mix(in srgb, var(--tone-color) 26%, transparent);
  border-radius: 9px;
  background: var(--tone-bg);
  color: var(--tone-color);
  font-size: 16px;
}

.head-main {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.incident-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.01em;
  color: var(--el-text-color-primary);
}

/* ---------- 状态胶囊 ---------- */

.status-pill {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border: 1px solid color-mix(in srgb, var(--tone-color) 30%, transparent);
  border-radius: 999px;
  background: var(--tone-bg);
  color: var(--tone-color);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.7;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* 进行中的异常用呼吸点提示，已解决 / 计划类保持静止 */
.tone-danger .status-dot,
.tone-warning .status-dot {
  animation: status-pulse 1.8s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.75); }
}

/* ---------- 正文 ---------- */

.incident-body {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

/* ---------- 底部时间 ---------- */

.incident-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* 两个时间左右分放：开始时间靠左、更新于靠右 */
  justify-content: space-between;
  gap: 4px 12px;
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
}

/* 左右分放之后不需要分隔圆点（三个时间时也不会挤在一起） */

@media (max-width: 640px) {
  .incident-card {
    padding: 14px 16px 12px;
  }

  .head-main {
    align-items: flex-start;
  }

  .incident-foot {
    /* 手机上也保持「开始 …  更新于 …」左右分放，窄到放不下才自动换行 */
    gap: 2px 8px;
    /* 小屏再把字缩一点，375 这种宽度两个时间才放得下一行 */
    font-size: 11.5px;
  }

  .meta-item + .meta-item {
    margin-left: 0;
  }

  .meta-item + .meta-item::before {
    display: none;
  }
}

/* ---------- Markdown 正文排版 ---------- */

:deep(.incident-body) {
  background-color: transparent !important;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

:deep(.incident-body > *:first-child) { margin-top: 0; }
:deep(.incident-body > *:last-child) { margin-bottom: 0; }

/* 正文标题压到卡片标题以下，避免抢走视觉重心 */
:deep(.incident-body h1),
:deep(.incident-body h2),
:deep(.incident-body h3),
:deep(.incident-body h4) {
  margin: 0 0 6px;
  padding: 0;
  border: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--el-text-color-primary);
}

:deep(.incident-body p) {
  margin: 0 0 8px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--el-text-color-regular);
}

:deep(.incident-body ul),
:deep(.incident-body ol) {
  margin: 0 0 8px;
  padding-left: 1.25em;
}

:deep(.incident-body li) {
  margin: 0;
}

:deep(.incident-body li + li) {
  margin-top: 4px;
}

:deep(.incident-body a) {
  color: var(--el-color-primary);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--el-color-primary) 45%, transparent);
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

:deep(.incident-body a:hover) {
  border-bottom-color: var(--el-color-primary);
}

/*
  单独成段的链接：做成克制的胶囊，尾巴挂一枚圆形箭头。
  以前是高饱和的蓝底蓝字按钮，在深色下很扎眼，也和卡片本身的语气不搭。
*/
:deep(.incident-body p > a:only-child) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin: 2px 0 4px;
  padding: 5px 8px 5px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
  transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;
}

:deep(.incident-body p > a:only-child::after) {
  content: '\2197';
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 1;
  transition: background-color 0.18s ease, color 0.18s ease;
}

:deep(.incident-body p > a:only-child:hover) {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}

:deep(.incident-body p > a:only-child:hover::after) {
  background: var(--el-color-primary);
  color: var(--el-color-white);
}

:deep(.incident-body blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
}

:deep(.incident-body code) {
  padding: 1px 5px;
  border-radius: 5px;
  background-color: var(--el-fill-color-light) !important;
  color: var(--el-text-color-primary) !important;
  font-size: 12.5px;
}

:deep(.incident-body pre) {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background-color: var(--el-fill-color-light) !important;
  overflow-x: auto;
}

:deep(.incident-body img) {
  max-width: 100%;
  border-radius: 10px;
}
</style>
